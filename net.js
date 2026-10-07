// Bullet Poker online play.
// - Lobby (room discovery): retained messages on a public MQTT broker. Each host announces
//   its room every few seconds; an MQTT "last will" clears the room if the tab dies.
// - Game traffic: PeerJS (WebRTC data channels, encrypted, browser to browser).
//   The host's browser runs the rules; guests send actions and receive a filtered state.
// See DESIGN.md §8.
(function (root) {
'use strict';
const V = 1;
const TOPIC = `bulletpoker/v${V}/rooms/`;
const BROKERS = ['wss://broker.hivemq.com:8884/mqtt', 'wss://broker.emqx.io:8084/mqtt'];
const PEER_PREFIX = `bulletpoker-v${V}-`;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_SEATS = 4;
const STALE_MS = 30000;

const makeCode = (n = 5) => Array.from({length: n}, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
const cleanCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
const cleanName = (s, fallback, max = 14) => (String(s || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max) || fallback);

// What one seat is allowed to see: other players' hole cards stay hidden until showdown.
function viewFor(S, seat) {
  return {
    ...S,
    players: S.players.map(p => {
      const visible = p.id === seat || (S.showdown && p.inHand && !p.folded);
      const {style, ...rest} = p;
      return {...rest, hole: visible ? p.hole : p.hole.map(() => ({hidden: true}))};
    }),
    switchOffer: S.switchOffer && S.switchOffer.pid === seat ? S.switchOffer : null,
  };
}

/* ---------- transports (swappable for tests) ---------- */
function peerTransport() {
  const Peer = root.Peer;
  if (!Peer) throw new Error('PeerJS failed to load.');
  return {
    listen(code, onConn, onReady, onError) {
      const peer = new Peer(PEER_PREFIX + code, {debug: 0});
      peer.on('open', () => onReady());
      peer.on('connection', c => onConn(wrapConn(c)));
      peer.on('error', e => onError(e.type === 'unavailable-id' ? 'taken' : (e.type || 'error')));
      return () => peer.destroy();
    },
    connect(code, onReady, onError) {
      const peer = new Peer({debug: 0});
      let conn;
      peer.on('open', () => {
        const c = peer.connect(PEER_PREFIX + code, {reliable: true});
        conn = wrapConn(c);
        c.on('open', () => onReady(conn));
      });
      peer.on('error', e => onError(e.type === 'peer-unavailable' ? 'Room not found. Check the code, or the host may have closed it.' : 'Connection failed (' + (e.type || 'error') + ').'));
      return () => peer.destroy();
    },
  };
}
function wrapConn(c) {
  const h = {data: [], close: []};
  c.on('data', d => h.data.forEach(f => f(d)));
  c.on('close', () => h.close.forEach(f => f()));
  c.on('error', () => h.close.forEach(f => f()));
  return {send: m => { try { c.send(m); } catch {} }, on: (ev, f) => h[ev].push(f), close: () => c.close(), id: c.peer};
}

// Connect to every broker at once (they are slow to answer and we must not split hosts and
// viewers across brokers). Publishes go to all; messages from all are merged by the caller.
function mqttClient(opts) {
  const mqtt = root.mqtt;
  if (!mqtt) return null;
  const clients = BROKERS.map(url => {
    const c = mqtt.connect(url, {connectTimeout: 20000, reconnectPeriod: 5000, clean: true, ...opts.connect});
    c.on('connect', () => opts.onConnect && opts.onConnect(c));
    c.on('message', (t, m) => opts.onMessage && opts.onMessage(t, m));
    c.on('error', () => {});
    return c;
  });
  return {
    get connected() { return clients.some(c => c.connected); },
    publish(topic, payload, o) { for (const c of clients) if (c.connected) c.publish(topic, payload, o); },
    end() { for (const c of clients) c.end(true); },
  };
}

/* ---------- lobby: list public rooms ---------- */
function watchLobby(onList, onStatus) {
  const rooms = new Map();
  const publish = () => {
    const now = Date.now();
    for (const [k, r] of rooms) if (now - r.ts > STALE_MS) rooms.delete(k);
    onList([...rooms.values()].sort((a, b) => (a.status === 'waiting' ? 0 : 1) - (b.status === 'waiting' ? 0 : 1) || b.ts - a.ts));
  };
  const m = mqttClient({
    onConnect: c => { c.subscribe(TOPIC + '+'); onStatus && onStatus('online'); },
    onMessage: (t, msg) => {
      const code = t.slice(TOPIC.length);
      if (!msg || !msg.length) { rooms.delete(code); return publish(); }
      try {
        const r = JSON.parse(msg.toString());
        if (r.v !== V || cleanCode(r.code) !== code) return;
        rooms.set(code, {code, name: cleanName(r.name, 'Room', 24), host: cleanName(r.host, 'Host'), players: Math.min(MAX_SEATS, r.players | 0), status: r.status === 'playing' ? 'playing' : 'waiting', ts: Math.min(Date.now(), +r.ts || 0)});
        publish();
      } catch {}
    },
  });
  if (!m) onStatus && onStatus('unavailable');
  const timer = setInterval(publish, 5000);
  return () => { clearInterval(timer); m && m.end(); };
}

/* ---------- host a room ---------- */
// me: {name, animal}. Returns a room controller.
function hostRoom({me, roomName, isPublic, onRoom, onError, transport, announce = true}) {
  const T = transport || peerTransport();
  let code = makeCode(), stopListen = null, mq = null, beat = null, closed = false;
  const room = {
    code, name: cleanName(roomName, `${me.name}'s table`, 24), isPublic, status: 'waiting',
    seats: [{key: 'host', name: cleanName(me.name, 'Host'), animal: me.animal, host: true}],
  };
  const guests = new Map(); // key -> {conn, seatIdx}
  let game = null, seatOfKey = new Map(), keyOfSeat = new Map();
  const handlers = {state: null, event: null};

  const roomView = () => ({code: room.code, name: room.name, isPublic: room.isPublic, status: room.status, seats: room.seats.map(s => ({key: s.key, name: s.name, animal: s.animal, host: !!s.host}))});
  const broadcast = msg => { for (const g of guests.values()) g.conn.send(msg); };
  const changed = () => { onRoom && onRoom(roomView()); broadcast({t: 'room', room: roomView()}); announceNow(); };

  function announceNow() {
    if (!mq || !mq.connected || !room.isPublic) return;
    mq.publish(TOPIC + room.code, JSON.stringify({v: V, code: room.code, name: room.name, host: room.seats[0].name, players: room.seats.length, status: room.status, ts: Date.now()}), {retain: true, qos: 0});
  }
  function unannounce() { if (mq) mq.publish(TOPIC + room.code, '', {retain: true, qos: 0}); }

  function freeAnimal(want) {
    const used = new Set(room.seats.map(s => s.animal));
    if (!used.has(want)) return want;
    return ['fox', 'pig', 'bear', 'bull'].find(a => !used.has(a)) || want;
  }

  function onConn(conn) {
    let key = null;
    conn.on('data', msg => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'hello' && !key) {
        if (closed) return conn.send({t: 'bye', reason: 'The room is closed.'});
        if (room.status !== 'waiting') { conn.send({t: 'bye', reason: 'This game has already started.'}); return setTimeout(() => conn.close(), 300); }
        if (room.seats.length >= MAX_SEATS) { conn.send({t: 'bye', reason: 'The table is full.'}); return setTimeout(() => conn.close(), 300); }
        key = 'g' + Math.random().toString(36).slice(2, 8);
        room.seats.push({key, name: cleanName(msg.name, 'Guest'), animal: freeAnimal(msg.animal)});
        guests.set(key, {conn});
        conn.send({t: 'welcome', key});
        changed();
        return;
      }
      if (!key) return;
      const seat = seatOfKey.get(key);
      if (msg.t === 'pick' && room.status === 'waiting') { const s = room.seats.find(x => x.key === key); if (s && !room.seats.some(o => o !== s && o.animal === msg.animal)) { s.animal = msg.animal; changed(); } }
      if (!game || seat == null) return;
      const S = game.state;
      if (msg.t === 'act' && S.awaiting === seat && msg.a && typeof msg.a.type === 'string') game.act({type: msg.a.type});
      if (msg.t === 'swOpen' && S.awaiting === seat) game.switchOpen(seat);
      if (msg.t === 'swPick' && S.awaiting === seat) game.switchPick(seat, msg.h == null ? null : msg.h | 0, msg.o == null ? null : msg.o | 0);
    });
    conn.on('close', () => {
      if (!key || !guests.has(key)) return;
      guests.delete(key);
      if (room.status === 'waiting') { room.seats = room.seats.filter(s => s.key !== key); changed(); }
      else if (game && seatOfKey.has(key)) game.removePlayer(seatOfKey.get(key));
    });
  }

  function listen() {
    stopListen = T.listen(room.code, onConn, () => {
      changed();
      if (announce) {
        mq = mqttClient({
          connect: {will: {topic: TOPIC + room.code, payload: '', retain: true, qos: 0}},
          onConnect: () => announceNow(),
        });
        beat = setInterval(announceNow, 8000);
      }
    }, err => {
      if (err === 'taken' && !closed) { room.code = code = makeCode(); stopListen && stopListen(); return listen(); }
      onError && onError('Could not open the room (' + err + '). Check your connection and try again.');
    });
  }
  listen();

  return {
    get room() { return roomView(); },
    get code() { return room.code; },
    pickAnimal(a) { if (!room.seats.some((o, i) => i > 0 && o.animal === a)) { room.seats[0].animal = a; changed(); } },
    // Seats for PokerGame, in join order. Everyone is a human player.
    seatsForGame() {
      const seats = room.seats.map(s => ({name: s.name, kind: 'human', animal: s.animal, key: s.key}));
      seatOfKey = new Map(); keyOfSeat = new Map();
      seats.forEach((s, i) => { if (s.key) { seatOfKey.set(s.key, i); keyOfSeat.set(i, s.key); } });
      return seats;
    },
    attach(g) { game = g; room.status = 'playing'; changed(); },
    // Called by the host UI on every state change / event.
    pushState(S) {
      for (const [key, g] of guests) { const seat = seatOfKey.get(key); if (seat != null) g.conn.send({t: 'state', S: viewFor(S, seat), seat}); }
    },
    pushEvent(type, data) { broadcast({t: 'ev', type, data}); },
    backToRoom() { game = null; room.status = 'waiting'; changed(); broadcast({t: 'lobby'}); },
    close() {
      closed = true;
      broadcast({t: 'bye', reason: 'The host closed the room.'});
      unannounce();
      clearInterval(beat);
      setTimeout(() => { mq && mq.end(); stopListen && stopListen(); }, 300);
    },
    hostSeat: 0,
  };
}

/* ---------- join a room ---------- */
function joinRoom({code, me, onRoom, onState, onEvent, onLobby, onClose, transport}) {
  const T = transport || peerTransport();
  let conn = null, done = false, key = null;
  const fail = reason => { if (done) return; done = true; onClose && onClose(reason); stop && stop(); };
  const stop = T.connect(cleanCode(code), c => {
    conn = c;
    c.on('data', msg => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'welcome') key = msg.key;
      if (msg.t === 'room') onRoom && onRoom(msg.room, key);
      if (msg.t === 'state') onState && onState(msg.S, msg.seat);
      if (msg.t === 'ev') onEvent && onEvent(msg.type, msg.data);
      if (msg.t === 'lobby') onLobby && onLobby();
      if (msg.t === 'bye') fail(msg.reason);
    });
    c.on('close', () => fail('Lost connection to the host.'));
    c.send({t: 'hello', v: V, name: me.name, animal: me.animal});
  }, err => fail(err));
  const timeout = setTimeout(() => { if (!conn) fail('Could not reach the room. Check the code and your connection.'); }, 15000);
  return {
    send(m) { conn && conn.send(m); },
    pickAnimal(a) { conn && conn.send({t: 'pick', animal: a}); },
    get key() { return key; },
    leave() { done = true; clearTimeout(timeout); try { conn && conn.close(); } catch {} stop && stop(); },
  };
}

root.PokerNet = {watchLobby, hostRoom, joinRoom, viewFor, cleanCode, MAX_SEATS};
})(typeof window !== 'undefined' ? window : globalThis);
