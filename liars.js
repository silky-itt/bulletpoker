// Liar's Deck and Liar's Dice: the two bluffing modes from Liar's Bar, played with the same
// revolver. Each player has their own six-chamber gun with one live round in a random chamber;
// every pull advances the cylinder, so the odds go 1/6, 1/5, ... 1/1. Where the round sits is
// known only to the host's game object, never put in `state`.
// Same interface as PokerGame (state, act, removePlayer, start, stop), so net.js and the HUD
// can drive any mode. See DESIGN.md §2.
(function (root) {
'use strict';
const CHAMBERS = 6;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/* ---------- Liar's Deck ---------- */
// 20 cards: 6 Kings, 6 Queens, 6 Aces, 2 Jokers (wild). 5 each. A round names a table rank;
// you play 1–3 cards face down claiming they are that rank. The next player may call Liar.
const DECK_RANKS = ['K', 'Q', 'A'];
const RANK_NAME = {K: 'King', Q: 'Queen', A: 'Ace', J: 'Joker'};
const HAND_SIZE = 5, MAX_PLAY = 3;
function deckOptions(S, p) {
  const n = p.hand.length;
  return {canPlay: n > 0, maxPlay: Math.min(MAX_PLAY, n), canLiar: !!S.last && S.last.pid !== p.id && !S.reveal};
}

/* ---------- Liar's Dice ---------- */
// 5 dice each, hidden under a cup. Bid "at least q dice show f" (f = 2..6). Ones are wild.
// Raise the quantity, or keep it and raise the face. The next player may call Liar.
const DICE = 5;
const bidBeats = (bid, q, f) => !bid || q > bid.q || (q === bid.q && f > bid.f);
function diceOptions(S, p) {
  const live = S.players.filter(x => x.alive).length;
  const maxQ = live * DICE;
  // the smallest legal bid, used as the HUD's starting point
  const min = !S.bid ? {q: 1, f: 2} : S.bid.f < 6 ? {q: S.bid.q, f: S.bid.f + 1} : {q: S.bid.q + 1, f: 2};
  return {canBid: min.q <= maxQ, maxQ, min, canLiar: !!S.bid && S.bid.pid !== p.id && !S.reveal};
}

function createLiarsGame(mode, seats, onChange, opts = {}) {
  const speed = opts.speed ?? 1;
  const onEvent = opts.onEvent || (() => {});
  const wait = ms => sleep(ms * speed);
  let token = 0, resolveHuman = null;
  const bulletAt = new Map(); // pid -> chamber holding the live round (secret)
  const S = {
    mode,
    players: seats.map((s, i) => ({id: i, name: s.name, kind: 'human', animal: s.animal, alive: true, shots: 0, lastAction: '',
      ...(mode === 'deck' ? {hand: []} : {dice: []})})),
    round: 0, starter: -1, toAct: null, awaiting: null, gun: null, winner: null, over: false, reveal: false, result: null,
    log: [], gameId: Math.random().toString(36).slice(2, 10),
    ...(mode === 'deck' ? {table: 'K', pile: [], last: null} : {bid: null}),
  };
  S.players.forEach(p => bulletAt.set(p.id, Math.floor(Math.random() * CHAMBERS)));
  const emit = () => onChange && onChange(S);
  const fx = (type, data = {}) => { try { onEvent(type, data, S); } catch (e) { console.error(e); } };
  const log = m => { S.log.unshift(m); S.log.length = Math.min(S.log.length, 60); };
  const alive = () => S.players.filter(p => p.alive);
  const n = () => S.players.length;
  const nextAlive = (i, pred = () => true) => { for (let k = 1; k <= n(); k++) { const j = (i + k) % n(); if (S.players[j].alive && pred(S.players[j])) return j; } return -1; };

  // One pull of this player's own gun.
  async function shoot(p, t, reason) {
    const left = CHAMBERS - p.shots;
    S.gun = {pid: p.id, bullets: 1, loaded: 1, state: 'aim', reason, spent: p.shots};
    log(`${p.name} ${reason}. Pull ${p.shots + 1} of 6: a 1 in ${left} chance.`);
    fx('aim', {pid: p.id, bullets: 1});
    emit();
    await wait(2300); if (t !== token) return;
    const dead = bulletAt.get(p.id) === p.shots;
    p.shots++;
    S.gun.state = dead ? 'bang' : 'click';
    if (dead) { p.alive = false; log(`BANG! ${p.name} is out.`); }
    else log(`Click... ${p.name} survives.`);
    fx(S.gun.state, {pid: p.id});
    emit();
    await wait(2000); if (t !== token) return;
    S.gun = null; fx('gunDown', {pid: p.id}); emit();
  }

  async function getAction(p, t) {
    S.toAct = p.id; S.awaiting = p.id; emit();
    fx('yourTurn', {pid: p.id});
    const a = await new Promise(r => { resolveHuman = r; });
    S.awaiting = null; resolveHuman = null;
    return t === token ? a : null;
  }

  /* ----- one round of each mode; returns {loser} once someone calls Liar ----- */
  function dealDeck() {
    const cards = shuffle([...DECK_RANKS.flatMap(k => Array(6).fill(k)), 'J', 'J']).map((k, id) => ({id, k}));
    for (const p of S.players) p.hand = p.alive ? cards.splice(0, HAND_SIZE) : [];
    S.table = DECK_RANKS[Math.floor(Math.random() * 3)];
    S.pile = []; S.last = null;
    log(`— Round ${S.round}. Table of ${RANK_NAME[S.table]}s.`);
    fx('deal', {count: alive().length * HAND_SIZE});
  }
  function rollDice() {
    for (const p of S.players) p.dice = p.alive ? Array.from({length: DICE}, () => 1 + Math.floor(Math.random() * 6)) : [];
    S.bid = null;
    log(`— Round ${S.round}. Everyone shakes their cup.`);
    fx('roll', {count: alive().length});
  }
  // Deck: the next player with cards acts; if nobody else has cards, the next player must call Liar.
  function nextActor(i) {
    if (S.mode !== 'deck') return nextAlive(i);
    const j = nextAlive(i, p => p.hand.length > 0 && p.id !== i);
    return j >= 0 ? j : nextAlive(i);
  }

  async function applyDeck(p, a) {
    const o = deckOptions(S, p);
    if (a.type === 'liar' && o.canLiar) return callLiar(p);
    if (!o.canPlay) return o.canLiar ? callLiar(p) : 'skip';
    let idx = [...new Set((Array.isArray(a.cards) ? a.cards : []).map(x => x | 0))].filter(x => x >= 0 && x < p.hand.length).slice(0, o.maxPlay);
    if (a.type !== 'play' || !idx.length) return 'again';
    idx.sort((x, y) => y - x);
    const cards = idx.map(k => p.hand.splice(k, 1)[0]).reverse();
    if (S.last) S.pile.push(...S.last.cards.map(c => ({id: c.id})));
    S.last = {pid: p.id, n: cards.length, cards};
    p.lastAction = `Played ${cards.length}`;
    log(`${p.name} plays ${cards.length} card${cards.length > 1 ? 's' : ''}: "${cards.length} ${RANK_NAME[S.table]}${cards.length > 1 ? 's' : ''}."`);
    fx('play', {pid: p.id, n: cards.length});
    return 'next';
  }
  async function applyDice(p, a) {
    const o = diceOptions(S, p);
    if (a.type === 'liar' && o.canLiar) return callLiar(p);
    const q = a.q | 0, f = a.f | 0;
    if (a.type !== 'bid' || f < 2 || f > 6 || q < 1 || q > o.maxQ || !bidBeats(S.bid, q, f)) return o.canBid ? 'again' : (o.canLiar ? callLiar(p) : 'again');
    S.bid = {pid: p.id, q, f};
    p.lastAction = `Bid ${q} × ${f}`;
    log(`${p.name} bids ${q} × ${f}.`);
    fx('bid', {pid: p.id, n: Math.min(8, q)});
    return 'next';
  }

  // Reveal and settle. Returns {loser}.
  function callLiar(caller) {
    caller.lastAction = 'LIAR!';
    if (S.mode === 'deck') {
      const accused = S.players[S.last.pid];
      const honest = S.last.cards.every(c => c.k === S.table || c.k === 'J');
      S.result = {caller: caller.id, accused: accused.id, honest, loser: honest ? caller.id : accused.id};
      log(`${caller.name} calls ${accused.name} a liar! The cards: ${S.last.cards.map(c => RANK_NAME[c.k]).join(', ')}. ${honest ? 'All true.' : 'A lie!'}`);
    } else {
      const bid = S.bid, bidder = S.players[bid.pid];
      const count = alive().reduce((s, p) => s + p.dice.filter(d => d === bid.f || d === 1).length, 0);
      const honest = count >= bid.q;
      S.result = {caller: caller.id, accused: bidder.id, honest, loser: honest ? caller.id : bidder.id, count, q: bid.q, f: bid.f};
      log(`${caller.name} calls ${bidder.name} a liar! ${count} × ${bid.f} on the table (ones wild), bid was ${bid.q}. ${honest ? 'The bid stands.' : 'A lie!'}`);
    }
    return {loser: S.result.loser};
  }

  async function playRound() {
    const t = token;
    S.round++; S.reveal = false; S.result = null;
    for (const p of S.players) p.lastAction = '';
    if (S.mode === 'deck') dealDeck(); else rollDice();
    emit(); await wait(1200); if (t !== token) return;
    let i = S.players[S.starter] && S.players[S.starter].alive ? S.starter : nextAlive(S.starter < 0 ? n() - 1 : S.starter);
    let outcome = null;
    for (let guard = 0; guard < 400 && !outcome; guard++) {
      if (alive().length <= 1) break;
      const p = S.players[i];
      if (!p.alive) { i = nextActor(i); continue; }
      const a = await getAction(p, t);
      if (t !== token || !a) return;
      if (a.type === 'leave') { i = nextActor(i); continue; }
      const r = S.mode === 'deck' ? await applyDeck(p, a) : await applyDice(p, a);
      if (r === 'again') continue;
      S.toAct = null; emit();
      if (r && r.loser != null) { outcome = r; break; }
      await wait(450); if (t !== token) return;
      i = nextActor(i);
    }
    S.toAct = null;
    if (outcome) {
      fx('liar', {pid: S.result.caller});
      emit(); await wait(1100); if (t !== token) return;
      S.reveal = true;
      fx('reveal', {pid: S.result.accused});
      emit(); await wait(3200); if (t !== token) return;
      const loser = S.players[outcome.loser];
      if (loser.alive) { await shoot(loser, t, S.result.honest ? 'called it wrong' : 'was caught lying'); if (t !== token) return; }
      S.starter = loser.alive ? loser.id : nextAlive(loser.id);
    }
    const left = alive();
    if (left.length <= 1) {
      S.winner = left.length ? left[0].id : null;
      log(left.length ? `${left[0].name} is the last one standing!` : 'Nobody made it out.');
      S.over = true; fx('gameOver', {winner: S.winner}); emit(); return;
    }
    playRound();
  }

  return {
    state: S, CHAMBERS,
    act(a) { if (resolveHuman) resolveHuman(a); },
    switchOpen() {}, switchPick() {},
    // A player left: they are out (no shot). If it was their turn, play moves on.
    removePlayer(pid) {
      const p = S.players[pid]; if (!p || !p.alive) return;
      p.alive = false; p.lastAction = 'Left'; p.name = p.name.replace(/ \(left\)$/, '') + ' (left)';
      log(`${p.name.replace(' (left)', '')} left the table.`);
      if (S.awaiting === pid && resolveHuman) resolveHuman({type: 'leave'});
      else emit();
    },
    start() { token++; playRound(); },
    stop() { token++; if (resolveHuman) resolveHuman(null); },
  };
}

root.LiarsGame = {
  createDeck: (seats, onChange, opts) => createLiarsGame('deck', seats, onChange, opts),
  createDice: (seats, onChange, opts) => createLiarsGame('dice', seats, onChange, opts),
  deckOptions, diceOptions, bidBeats, RANK_NAME, DECK_RANKS, CHAMBERS, HAND_SIZE, MAX_PLAY, DICE,
};
})(typeof window !== 'undefined' ? window : globalThis);
