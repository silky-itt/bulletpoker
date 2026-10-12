// Bullet Poker online play.
// - Lobby (room discovery): retained messages on a public MQTT broker. Each host announces
//   its room every few seconds; an MQTT "last will" clears the room if the tab dies.
// - Game traffic: relayed through the same MQTT brokers, one topic per guest, with seq/ack/resend
//   and end-to-end encryption. The host's browser runs the rules; guests send actions and
//   receive a filtered state.
// See DESIGN.md §8.
(function (root) {
'use strict';
const V = 1;
const TOPIC = `bulletpoker/v${V}/rooms/`;
const TABLE = `bulletpoker/v${V}/t/`;
const BROKERS = ['wss://broker.hivemq.com:8884/mqtt', 'wss://broker.emqx.io:8084/mqtt', 'wss://test.mosquitto.org:8081/mqtt'];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_SEATS = 4;
const STALE_MS = 30000;
// Last-will payload meaning "this host is gone". Not empty: test.mosquitto.org drops clients whose
// will is empty. An explicit close publishes GONE, then '' to delete the retained message where
// the broker allows it (test.mosquitto.org disconnects on that too, but we are leaving anyway).
const GONE = '0';
const clearRetained = (mq, topic) => { mq.publish(topic, GONE, {retain: true, qos: 0}); mq.publish(topic, '', {retain: true, qos: 0}); };

const makeCode = (n = 5) => Array.from({length: n}, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
const cleanCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
const cleanName = (s, fallback, max = 14) => (String(s || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max) || fallback);
const ANIMALS = ['fox', 'pig', 'bear', 'bull'];
const validAnimal = (a, fallback = 'fox') => ANIMALS.includes(a) ? a : fallback;
const ACTIONS = ['fold', 'coward', 'check', 'call', 'raise', 'allin'];
const STREETS = ['preflop', 'flop', 'turn', 'river', 'showdown'];
const GUN_STATES = ['load', 'aim', 'click', 'bang', 'godsave'];
const EVENTS = ['deal', 'board', 'check', 'bet', 'allin', 'fold', 'switch', 'loadStart', 'loadBullet', 'aim', 'click', 'bang', 'godsave', 'gunDown', 'win', 'showdown', 'yourTurn', 'thinking', 'gameOver'];

/* ---------- guest-side validation: never trust what arrives over the wire ---------- */
const int = (v, lo, hi, d = lo) => { v = Number(v); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d; };
const arr = v => Array.isArray(v) ? v : [];
const seatOrNull = (v, n) => v == null ? null : int(v, 0, n - 1, null);
function cleanCard(c) {
  if (!c || c.hidden || !Number.isFinite(+c.r) || !Number.isFinite(+c.s)) return {hidden: true};
  const r = int(c.r, 2, 14), s = int(c.s, 0, 3);
  return {r, s, id: s * 13 + r};
}
function sanitizeState(S, seat) {
  if (!S || typeof S !== 'object') return null;
  const players = arr(S.players).slice(0, MAX_SEATS).map((p, i) => (p = p && typeof p === 'object' ? p : {}, {
    id: i, name: cleanName(p.name, 'Player', 22), kind: 'human', animal: validAnimal(p.animal),
    alive: !!p.alive, hole: arr(p.hole).slice(0, 2).map(cleanCard), bet: int(p.bet, 0, 6),
    folded: !!p.folded, acted: !!p.acted, inHand: !!p.inHand, cowardUsed: !!p.cowardUsed,
    switchUsed: !!p.switchUsed, switchedNow: !!p.switchedNow, lastAction: String(p.lastAction || '').slice(0, 24),
  }));
  const n = players.length || 1;
  const g = S.gun && typeof S.gun === 'object' ? S.gun : null;
  return {
    players, board: arr(S.board).slice(0, 5).map(cleanCard).filter(c => !c.hidden),
    street: STREETS.includes(S.street) ? S.street : 'preflop', currentBet: int(S.currentBet, 1, 6),
    dealer: int(S.dealer, -1, n - 1, -1), handNo: int(S.handNo, 0, 1e6),
    toAct: seatOrNull(S.toAct, n), awaiting: seatOrNull(S.awaiting, n), showdown: !!S.showdown,
    winners: S.winners == null ? null : arr(S.winners).slice(0, MAX_SEATS).map(w => int(w, 0, n - 1)),
    gun: g && GUN_STATES.includes(g.state) ? {pid: int(g.pid, 0, n - 1), bullets: int(g.bullets, 1, 6), loaded: int(g.loaded, 0, 6), state: g.state, reason: String(g.reason || '').slice(0, 40)} : null,
    winner: seatOrNull(S.winner, n), over: !!S.over,
    switchOffer: S.switchOffer && int(S.switchOffer.pid, 0, n - 1) === seat ? {pid: seat, cards: arr(S.switchOffer.cards).slice(0, 4).map(cleanCard).filter(c => !c.hidden)} : null,
    log: arr(S.log).slice(0, 60).map(l => String(l).slice(0, 200)),
    gameId: String(S.gameId || '').slice(0, 16),
  };
}
function sanitizeEvent(type, d) {
  if (!EVENTS.includes(type)) return null;
  d = d && typeof d === 'object' ? d : {};
  const out = {};
  if (d.pid != null) out.pid = int(d.pid, 0, MAX_SEATS - 1);
  for (const k of ['count', 'added', 'total', 'n', 'bullets']) if (d[k] != null) out[k] = int(d[k], 0, 8);
  if (d.ids != null) out.ids = arr(d.ids).slice(0, MAX_SEATS).map(x => int(x, 0, MAX_SEATS - 1));
  if (d.winner != null) out.winner = int(d.winner, 0, MAX_SEATS - 1);
  if (d.street != null) out.street = STREETS.includes(d.street) ? d.street : 'flop';
  return out;
}
function sanitizeRoom(r) {
  if (!r || typeof r !== 'object') return null;
  return {code: cleanCode(r.code), name: cleanName(r.name, 'Table', 24), isPublic: r.isPublic !== false, status: r.status === 'playing' ? 'playing' : 'waiting',
    seats: arr(r.seats).slice(0, MAX_SEATS).map(s => ({key: String(s && s.key || '').slice(0, 12), name: cleanName(s && s.name, 'Player'), animal: validAnimal(s && s.animal), host: !!(s && s.host)}))};
}

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

/* ---------- MQTT client: every broker at once ---------- */
// Connect to every broker in parallel (they are slow to answer and we must not split hosts and
// guests across brokers). Publishes go to all; messages from all are merged by the caller,
// which must expect duplicates. `loss` drops that share of incoming live messages (tests only;
// retained ones are kept, since a real connection doesn't lose them).
function mqttClient(opts) {
  const mqtt = root.mqtt;
  if (!mqtt) return null;
  const loss = opts.loss || 0;
  const clients = (opts.brokers || BROKERS).map(url => {
    const c = mqtt.connect(url, {connectTimeout: 20000, reconnectPeriod: 4000, keepalive: 30, clean: true, ...opts.connect});
    c.on('connect', () => opts.onConnect && opts.onConnect(c));
    c.on('message', (t, m, pk) => { if (!(loss && !pk.retain && Math.random() < loss)) opts.onMessage && opts.onMessage(t, m); });
    c.on('error', () => {});
    return c;
  });
  return {
    get connected() { return clients.some(c => c.connected); },
    publish(topic, payload, o) { for (const c of clients) if (c.connected) c.publish(topic, payload, o); },
    // After the tab comes back from the background, don't wait for the reconnect timer.
    kick() { for (const c of clients) if (!c.connected && !c.disconnecting && !c.reconnecting) try { c.reconnect(); } catch {} },
    end() { for (const c of clients) c.end(true); },
  };
}

/* ---------- table transport: reliable links relayed through MQTT ---------- */
// Topics under bulletpoker/v1/t/<CODE>/: `h` = host inbox (all guests write), `g/<guestId>` =
// one guest's inbox, `p` = retained host presence (cleared by last will).
// Every data message has a seq; it is resent until acked, and the receiver drops duplicates and
// delivers in order. Acks are cumulative plus selective (ranges already buffered past a gap), so
// one lost message doesn't make the sender repeat everything after it. Payloads are AES-GCM encrypted with a per-guest ECDH key, because public
// brokers let anyone subscribe to `#` and hole cards must stay secret.
// Interface (shared with the test transports): listen(code, onConn, onReady, onError) -> stop,
// connect(code, onReady, onError) -> stop; conn = {send, on('data'|'close'), close, id}.
const TICK_MS = 250, RTO_MS = 1000, RTO_MAX = 2500, FAST_MS = 400, RESEND_PER_TICK = 24, PING_MS = 5000;
const PEER_TIMEOUT = 90000;      // no frame for this long (while we are visible) = peer left
const PEER_HIDDEN_TIMEOUT = 600000; // peer said its tab is hidden (phone switched apps)
const FLUSH_MS = 3000;           // closing: keep resending this long, then hang up
const CONNECT_MS = 15000, JOIN_MS = 30000, NOT_FOUND_MS = 10000;
const ERR_OFFLINE = 'Could not reach the game servers. Check your internet connection (some networks block WebSockets).';

const subtle = () => (root.crypto && root.crypto.subtle) || null; // missing outside secure contexts
const toB64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = s => Uint8Array.from(atob(s), ch => ch.charCodeAt(0));
const ENC = new TextEncoder(), DEC = new TextDecoder();
async function makeKeys() {
  if (!subtle()) return null;
  try {
    const pair = await subtle().generateKey({name: 'ECDH', namedCurve: 'P-256'}, false, ['deriveKey']);
    return {pair, pub: toB64(await subtle().exportKey('raw', pair.publicKey))};
  } catch { return null; }
}
// Shared AES key, or null (plaintext) if either side has no WebCrypto, e.g. plain http on a LAN IP.
async function linkKey(keys, peerPub) {
  if (!keys || typeof peerPub !== 'string') return null;
  const pub = await subtle().importKey('raw', fromB64(peerPub), {name: 'ECDH', namedCurve: 'P-256'}, false, []);
  return subtle().deriveKey({name: 'ECDH', public: pub}, keys.pair.privateKey, {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
}

const isHidden = () => !!(root.document && root.document.hidden);
const parseFrame = m => {
  try { const f = JSON.parse(m.toString()); return f && typeof f === 'object' && typeof f.f === 'string' && f.f.length <= 16 ? f : null; } catch { return null; }
};

// One reliable, ordered link between this endpoint (`me`) and a peer.
function makeLink({me, peer, key, pub, onDead}) {
  const h = {data: [], close: []};
  let tx = 0, rx = 0, dead = false, closing = 0, hangup = 0, peerEnd = null, peerEndAt = 0, ackTimer = null;
  let lastSeen = Date.now(), lastPing = 0, peerHidden = false;
  const unacked = new Map(); // seq -> {body, sent, rto}
  const inbox = new Map();   // seq -> decoded message, waiting for the gap before it to fill
  const aad = (from, q) => ENC.encode(from + '>' + q);
  const raw = f => pub(JSON.stringify({f: me, ...f}));

  async function seal(m, q) {
    const text = JSON.stringify(m);
    if (!key) return text;
    const iv = root.crypto.getRandomValues(new Uint8Array(12));
    const c = await subtle().encrypt({name: 'AES-GCM', iv, additionalData: aad(me, q)}, key, ENC.encode(text));
    return {iv: toB64(iv), c: toB64(c)};
  }
  async function open(b, q) {
    if (!key) return JSON.parse(b);
    const p = await subtle().decrypt({name: 'AES-GCM', iv: fromB64(b.iv), additionalData: aad(peer, q)}, key, fromB64(b.c));
    return JSON.parse(DEC.decode(p));
  }
  // Ranges of seqs held past a gap, e.g. [[7, 9], [12, 12]].
  function sack() {
    if (!inbox.size) return undefined;
    const out = [];
    for (const q of [...inbox.keys()].sort((x, y) => x - y)) {
      const r = out[out.length - 1];
      if (r && q === r[1] + 1) r[1] = q; else if (out.push([q, q]) > 16) { out.pop(); break; }
    }
    return out;
  }
  const sendData = (q, e) => { e.sent = Date.now(); raw({k: 'd', q, a: rx, s: sack(), b: e.body}); };
  const ping = () => { lastPing = Date.now(); raw({k: 'p', a: rx, s: sack(), h: isHidden() ? 1 : 0}); };
  function die(notify) {
    if (dead) return;
    dead = true;
    clearTimeout(ackTimer);
    if (notify) raw({k: 'x', n: tx});
    onDead();
    h.close.forEach(f => f());
  }
  function drain() {
    while (inbox.has(rx + 1)) {
      const m = inbox.get(rx + 1);
      inbox.delete(++rx);
      if (!dead) h.data.forEach(f => f(m));
    }
    if (peerEnd != null && rx >= peerEnd) die(false);
  }
  function ackSoon() { if (!ackTimer) ackTimer = setTimeout(() => { ackTimer = null; if (!dead) raw({k: 'a', a: rx, s: sack()}); }, 40); }

  const link = {
    get dead() { return dead; },
    recv(f) {
      if (dead) return;
      lastSeen = Date.now();
      if (f.a != null) for (const q of unacked.keys()) if (q <= f.a) unacked.delete(q); else break;
      if (Array.isArray(f.s)) {
        let top = 0;
        for (const r of f.s.slice(0, 16)) if (Array.isArray(r)) for (let q = r[0] | 0, e = Math.min(r[1] | 0, q + 512); q <= e; q++) { unacked.delete(q); top = Math.max(top, q); }
        // Fast retransmit: the peer holds later messages, so anything older still unacked was lost.
        const now = Date.now();
        let n = 0;
        for (const [q, e] of unacked) {
          if (q > top || n >= RESEND_PER_TICK) break;
          if (e.body !== undefined && now - e.sent > FAST_MS) { sendData(q, e); n++; }
        }
      }
      if (f.k === 'p') peerHidden = !!f.h;
      if (f.k === 'x') {
        if (hangup) return die(false); // our goodbye was heard
        raw({k: 'x', n: tx});           // answer, so the closing side can stop repeating
        if (peerEnd == null) { peerEnd = Math.max(0, f.n | 0); peerEndAt = Date.now(); }
        return drain();
      }
      if (f.k !== 'd') return;
      const q = f.q | 0;
      ackSoon();
      if (q <= rx || inbox.has(q)) return; // duplicate (several brokers, or a resend)
      open(f.b, q).then(m => { if (!dead && q > rx && !inbox.has(q)) { inbox.set(q, m); drain(); ackSoon(); } }, () => {});
    },
    tick(now, hiddenSelf) {
      if (dead) return;
      let n = 0;
      for (const [q, e] of unacked) {
        if (e.body === undefined || now - e.sent < e.rto) continue;
        sendData(q, e); e.rto = Math.min(e.rto * 2, RTO_MAX);
        if (++n >= RESEND_PER_TICK) break;
      }
      if (now - lastPing >= PING_MS) ping();
      // Closing: flush, then repeat the goodbye until the peer answers it (or give up after 2 s).
      if (closing && (!unacked.size || now - closing > FLUSH_MS)) {
        if (!hangup) hangup = now;
        if (now - hangup > 2000) return die(false);
        return raw({k: 'x', n: tx});
      }
      if (peerEnd != null && now - peerEndAt > FLUSH_MS) return die(false); // peer left; stop waiting for the rest
      // Our own timers are frozen while hidden, so silence then proves nothing.
      if (!hiddenSelf && now - lastSeen > (peerHidden ? PEER_HIDDEN_TIMEOUT : PEER_TIMEOUT)) die(true);
    },
    visible() { lastSeen = Date.now(); ping(); },
    hidden() { ping(); },
    conn: {
      id: peer,
      send(m) {
        if (dead || closing) return;
        const q = ++tx, e = {body: undefined, sent: 0, rto: RTO_MS};
        unacked.set(q, e);
        seal(m, q).then(body => { e.body = body; if (!dead && unacked.has(q)) sendData(q, e); }, () => unacked.delete(q));
      },
      on: (ev, f) => h[ev] && h[ev].push(f),
      // Graceful: what was already sent (e.g. a 'bye') still gets delivered before hanging up.
      close() { if (!dead && !closing) closing = Date.now(); },
    },
  };
  return link;
}

// Shared by host and guest: MQTT clients, the link table, timers, and tab visibility.
function endpoint({brokers, loss, will, subs, onFrame, onSubscribed}) {
  const id = Math.random().toString(36).slice(2, 12);
  const links = new Map();
  let ended = false;
  const mq = mqttClient({
    brokers, loss, connect: will ? {will: will(id)} : {},
    onConnect: c => c.subscribe(subs(id), {qos: 0}, err => { if (!err && !ended) onSubscribed(c); }),
    onMessage: (t, m) => { if (!ended) onFrame(t, parseFrame(m)); },
  });
  if (!mq) throw new Error('Online play failed to load (MQTT library missing). Reload the page.');
  const timer = setInterval(() => { const now = Date.now(), hid = isHidden(); for (const l of [...links.values()]) l.tick(now, hid); }, TICK_MS);
  const doc = root.document && root.document.addEventListener ? root.document : null;
  const onVis = () => {
    if (isHidden()) return links.forEach(l => l.hidden());
    mq.kick();
    links.forEach(l => l.visible());
  };
  doc && doc.addEventListener('visibilitychange', onVis);
  return {
    id, mq, links,
    // Close every link gracefully, then drop the brokers once the last one is gone.
    end(before) {
      if (ended) return;
      for (const l of links.values()) l.conn.close();
      const t0 = Date.now();
      const wait = setInterval(() => {
        if (links.size && Date.now() - t0 < FLUSH_MS + 3000) return;
        clearInterval(wait); clearInterval(timer); ended = true;
        doc && doc.removeEventListener('visibilitychange', onVis);
        before && before();
        mq.end();
      }, 100);
    },
  };
}

function mqttTransport({brokers, loss} = {}) {
  if (!root.mqtt) throw new Error('Online play failed to load (MQTT library missing). Reload the page.');
  const base = code => TABLE + code + '/';
  return {
    listen(code, onConn, onReady, onError) {
      const B = base(code);
      const closedIds = new Set(), pending = new Set();
      let ready = false, stopped = false, keys = null;
      const keysReady = makeKeys().then(k => { keys = k; });
      const synAck = () => JSON.stringify({f: ep.id, k: 's', pk: keys && keys.pub});
      const toGuest = gid => s => ep.mq.publish(B + 'g/' + gid, s, {qos: 0});
      const unpresence = () => clearRetained(ep.mq, B + 'p');
      const fail = err => { if (ready || stopped) return; stopped = true; clearTimeout(offline); ep.end(unpresence); onError(err); };
      const ep = endpoint({brokers, loss,
        will: () => ({topic: B + 'p', payload: GONE, retain: true, qos: 0}),
        subs: () => [B + 'h', B + 'p'],
        onSubscribed: c => {
          c.publish(B + 'p', JSON.stringify({f: ep.id, k: 'here', ts: Date.now()}), {retain: true, qos: 0});
          // Give a retained presence from another host a moment to arrive before claiming the code.
          if (!ready) setTimeout(() => { if (!stopped && !ready) { ready = true; clearTimeout(offline); keysReady.then(() => !stopped && onReady()); } }, 800);
        },
        onFrame(t, f) {
          if (!f || stopped) return;
          if (t === B + 'p') { if (f.f !== ep.id) fail('taken'); return; }
          if (t !== B + 'h') return;
          const gid = f.f, l = ep.links.get(gid);
          if (l) return f.k === 's' ? toGuest(gid)(synAck()) : l.recv(f); // repeated hello: the answer was lost
          if (closedIds.has(gid)) return toGuest(gid)(JSON.stringify({f: ep.id, k: 'x', n: 0}));
          if (f.k !== 's' || !ready || pending.has(gid)) return;
          pending.add(gid);
          keysReady.then(() => linkKey(keys, f.pk)).catch(() => null).then(key => {
            pending.delete(gid);
            if (ep.links.has(gid) || stopped) return;
            const pub = toGuest(gid);
            const link = makeLink({me: ep.id, peer: gid, key, pub, onDead: () => { ep.links.delete(gid); closedIds.add(gid); }});
            ep.links.set(gid, link);
            pub(synAck());
            onConn(link.conn);
          });
        },
      });
      const offline = setTimeout(() => fail(ERR_OFFLINE), CONNECT_MS);
      return () => { if (stopped && !ready) return; stopped = true; clearTimeout(offline); ep.end(unpresence); };
    },
    connect(code, onReady, onError) {
      const B = base(code);
      let link = null, linking = false, settled = false, seen = false, firstSub = 0, keys = null;
      const keysReady = makeKeys().then(k => { keys = k; });
      const fail = err => { if (settled) return; settled = true; clearInterval(syn); ep.end(); onError(err); };
      const t0 = Date.now();
      const ep = endpoint({brokers, loss,
        subs: id => [B + 'g/' + id, B + 'p'],
        onSubscribed: () => { if (!firstSub) firstSub = Date.now(); },
        onFrame(t, f) {
          if (!f) return;
          if (t === B + 'p') { seen = true; return; }
          if (link) { if (f.f === link.peer) link.l.recv(f); return; }
          if (settled) return;
          if (f.k === 'x') return fail('The host closed the room.');
          if (f.k !== 's' || linking) return;
          linking = true;
          keysReady.then(() => linkKey(keys, f.pk)).catch(() => null).then(key => {
            if (settled) return;
            const l = makeLink({me: ep.id, peer: f.f, key, pub: s => ep.mq.publish(B + 'h', s, {qos: 0}), onDead: () => ep.links.delete(f.f)});
            link = {peer: f.f, l};
            ep.links.set(f.f, l);
            settled = true;
            clearInterval(syn);
            onReady(l.conn);
          });
        },
      });
      const syn = setInterval(() => {
        const now = Date.now();
        if (!firstSub) { if (now - t0 > CONNECT_MS) fail(ERR_OFFLINE); return; }
        if (linking) return;
        if (!seen && now - firstSub > NOT_FOUND_MS) return fail(`Table ${code} not found. Check the code, or the host may have closed it.`);
        if (now - firstSub > JOIN_MS) return fail(`The host of table ${code} is not answering. They may have lost their connection; try again.`);
        keysReady.then(() => { if (!linking && !settled) ep.mq.publish(B + 'h', JSON.stringify({f: ep.id, k: 's', pk: keys && keys.pub}), {qos: 0}); });
      }, 1000);
      return () => { settled = true; clearInterval(syn); ep.end(); };
    },
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
      if (!msg || !msg.length || msg.toString() === GONE) { rooms.delete(code); return publish(); }
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
  const T = transport || mqttTransport();
  let code = makeCode(), stopListen = null, mq = null, beat = null, closed = false;
  const room = {
    code, name: cleanName(roomName, `${me.name}'s table`, 24), isPublic, status: 'waiting',
    seats: [{key: 'host', name: cleanName(me.name, 'Host'), animal: me.animal, host: true}],
  };
  const guests = new Map(); // key -> {conn, seatIdx}
  let game = null, seatOfKey = new Map();
  const gone = new Set(); // guests who left during a game

  const roomView = () => ({code: room.code, name: room.name, isPublic: room.isPublic, status: room.status, seats: room.seats.map(s => ({key: s.key, name: s.name, animal: s.animal, host: !!s.host}))});
  const broadcast = msg => { for (const g of guests.values()) g.conn.send(msg); };
  const changed = () => { onRoom && onRoom(roomView()); broadcast({t: 'room', room: roomView()}); announceNow(); };

  function announceNow() {
    if (!mq || !mq.connected || !room.isPublic) return;
    mq.publish(TOPIC + room.code, JSON.stringify({v: V, code: room.code, name: room.name, host: room.seats[0].name, players: room.seats.length, status: room.status, ts: Date.now()}), {retain: true, qos: 0});
  }
  function unannounce() { if (mq) clearRetained(mq, TOPIC + room.code); }

  function pruneGone() { if (gone.size) { room.seats = room.seats.filter(s => !gone.has(s.key)); gone.clear(); } }
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
        room.seats.push({key, name: cleanName(msg.name, 'Guest'), animal: freeAnimal(validAnimal(msg.animal))});
        guests.set(key, {conn});
        conn.send({t: 'welcome', key});
        changed();
        return;
      }
      if (!key) return;
      const seat = seatOfKey.get(key);
      if (msg.t === 'pick' && room.status === 'waiting') { const s = room.seats.find(x => x.key === key); if (s && ANIMALS.includes(msg.animal) && s.animal !== msg.animal && !room.seats.some(o => o !== s && o.animal === msg.animal)) { s.animal = msg.animal; changed(); } }
      if (!game || seat == null) return;
      const S = game.state;
      if (msg.t === 'act' && S.awaiting === seat && msg.a && ACTIONS.includes(msg.a.type)) game.act({type: msg.a.type});
      if (msg.t === 'swOpen' && S.awaiting === seat) game.switchOpen(seat);
      if (msg.t === 'swPick' && S.awaiting === seat) game.switchPick(seat, msg.h == null ? null : msg.h | 0, msg.o == null ? null : msg.o | 0);
    });
    conn.on('close', () => {
      if (!key || !guests.has(key)) return;
      guests.delete(key);
      if (room.status === 'waiting') { room.seats = room.seats.filter(s => s.key !== key); changed(); }
      else { gone.add(key); if (game && seatOfKey.has(key)) game.removePlayer(seatOfKey.get(key)); }
    });
  }

  function listen() {
    stopListen = T.listen(room.code, onConn, () => {
      changed();
      if (announce) {
        mq = mqttClient({
          connect: {will: {topic: TOPIC + room.code, payload: GONE, retain: true, qos: 0}},
          onConnect: () => announceNow(),
        });
        beat = setInterval(announceNow, 8000);
      }
    }, err => {
      if (err === 'taken' && !closed) { room.code = code = makeCode(); stopListen && stopListen(); return listen(); }
      onError && onError(err);
    });
  }
  listen();

  return {
    get room() { return roomView(); },
    get code() { return room.code; },
    pickAnimal(a) { if (ANIMALS.includes(a) && !room.seats.some((o, i) => i > 0 && o.animal === a)) { room.seats[0].animal = a; changed(); return true; } return false; },
    // Seats for PokerGame, in join order. Guests who left during the last game are dropped.
    seatsForGame() {
      pruneGone();
      const seats = room.seats.map(s => ({name: s.name, kind: 'human', animal: s.animal, key: s.key}));
      seatOfKey = new Map();
      seats.forEach((s, i) => seatOfKey.set(s.key, i));
      return seats;
    },
    get playerCount() { return room.seats.filter(s => !gone.has(s.key)).length; },
    attach(g) { game = g; room.status = 'playing'; changed(); },
    // Called by the host UI on every state change / event.
    pushState(S) {
      for (const [key, g] of guests) { const seat = seatOfKey.get(key); if (seat != null) g.conn.send({t: 'state', S: viewFor(S, seat), seat}); }
    },
    pushEvent(type, data) { broadcast({t: 'ev', type, data}); },
    backToRoom() { game = null; room.status = 'waiting'; pruneGone(); changed(); broadcast({t: 'lobby'}); },
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
  const T = transport || mqttTransport();
  let conn = null, done = false, key = null, stop = null, seat = null, timeout = null;
  const fail = reason => { if (done) return; done = true; clearTimeout(timeout); onClose && onClose(String(reason || 'Disconnected.').slice(0, 160)); stop && stop(); };
  stop = T.connect(cleanCode(code), c => {
    conn = c;
    c.on('data', msg => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'welcome') key = String(msg.key || '').slice(0, 12);
      if (msg.t === 'room') { const r = sanitizeRoom(msg.room); if (r) onRoom && onRoom(r, key); }
      if (msg.t === 'state') { seat = int(msg.seat, 0, MAX_SEATS - 1); const S = sanitizeState(msg.S, seat); if (S && seat < S.players.length) onState && onState(S, seat); }
      if (msg.t === 'ev') { const d = sanitizeEvent(msg.type, msg.data); if (d) onEvent && onEvent(msg.type, d); }
      if (msg.t === 'lobby') onLobby && onLobby();
      if (msg.t === 'bye') fail(msg.reason);
    });
    c.on('close', () => fail('Lost connection to the host.'));
    c.send({t: 'hello', v: V, name: me.name, animal: me.animal});
  }, err => fail(err));
  timeout = setTimeout(() => { if (!key) fail('Could not reach the room. Check the code and your connection.'); }, 45000);
  return {
    send(m) { conn && conn.send(m); },
    pickAnimal(a) { conn && conn.send({t: 'pick', animal: a}); },
    get key() { return key; },
    leave() { done = true; clearTimeout(timeout); try { conn && conn.close(); } catch {} stop && stop(); },
  };
}

root.PokerNet = {watchLobby, hostRoom, joinRoom, mqttTransport, viewFor, sanitizeState, sanitizeEvent, cleanCode, MAX_SEATS, ANIMALS};
})(typeof window !== 'undefined' ? window : globalThis);
