// Bullet Poker rules: Texas Hold'em where you bet bullets. Six-chamber revolver.
// The UI only reads `state`, calls `act()` / Switch helpers, and listens to `onEvent`.
(function (root) {
'use strict';
const E = root.PokerEngine;
const CHAMBERS = 6;          // six-chamber revolver, max bet 6 bullets
const JAM = 0.05;            // a full load still jams 5% of the time
const SWITCH_OFFERS = {preflop: 4, flop: 3, turn: 2};
const STREET_NAME = {preflop: 'Pre-flop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown'};
const sleep = ms => new Promise(r => setTimeout(r, ms));

function createGame(seats, onChange, opts = {}) {
  const speed = opts.speed ?? 1;
  const onEvent = opts.onEvent || (() => {});
  const wait = ms => sleep(ms * speed);
  let token = 0, deck = [], resolveHuman = null;
  const S = {
    players: seats.map((s, i) => ({
      id: i, name: s.name, kind: s.kind, animal: s.animal, alive: true,
      hole: [], bet: 0, folded: false, acted: false, inHand: false,
      cowardUsed: false, switchUsed: false, switchedNow: false, lastAction: '',
      style: Object.assign({aggr: 0.8 + Math.random() * 0.5, bluff: 0.05 + Math.random() * 0.08, nerve: Math.random() * 0.08}, s.style || {}),
    })),
    dealer: -1, handNo: 0, board: [], street: 'preflop', currentBet: 1,
    toAct: null, awaiting: null, showdown: false, winners: null, gun: null, winner: null,
    switchOffer: null, log: [],
  };
  const emit = () => onChange && onChange(S);
  const fx = (type, data = {}) => { try { onEvent(type, data, S); } catch (e) { console.error(e); } };
  const log = m => { S.log.unshift(m); S.log.length = Math.min(S.log.length, 60); };
  const alive = () => S.players.filter(p => p.alive);
  const inPlay = () => S.players.filter(p => p.inHand && !p.folded && p.alive);
  const nextFrom = (i, pred) => { const n = S.players.length; for (let k = 1; k <= n; k++) { const j = (i + k) % n; if (pred(S.players[j])) return j; } return -1; };

  function options(p) {
    const toCall = S.currentBet - p.bet;
    return {
      toCall, canCheck: toCall === 0,
      canRaise: S.currentBet < CHAMBERS,
      canAllIn: S.currentBet < CHAMBERS && !p.switchedNow,
      canCoward: !p.cowardUsed && p.bet > 1,
      canSwitch: !p.switchUsed && !!SWITCH_OFFERS[S.street],
      switchCount: SWITCH_OFFERS[S.street] || 0,
      bet: p.bet, currentBet: S.currentBet,
    };
  }

  // Pull the trigger with k bullets in a six-chamber gun.
  async function shoot(p, k, t, reason) {
    const jam = k >= CHAMBERS && Math.random() < JAM;
    const dead = !jam && Math.random() < k / CHAMBERS;
    // 1) load the cylinder one bullet at a time
    S.gun = {pid: p.id, bullets: k, loaded: 0, state: 'load', reason};
    log(`${p.name} ${reason}: loading ${k} bullet${k > 1 ? 's' : ''}...`);
    fx('loadStart', {pid: p.id, bullets: k});
    emit();
    await wait(700); if (t !== token) return;
    for (let b = 1; b <= k; b++) {
      S.gun.loaded = b; fx('loadBullet', {pid: p.id, n: b}); emit();
      await wait(420); if (t !== token) return;
    }
    // 2) spin, snap shut, raise to the head
    S.gun.state = 'aim';
    fx('aim', {pid: p.id, bullets: k});
    emit();
    await wait(2100); if (t !== token) return;
    S.gun.state = dead ? 'bang' : jam ? 'jam' : 'click';
    if (dead) { p.alive = false; log(`BANG! ${p.name} is out.`); }
    else log(jam ? `The gun jams! ${p.name} cheats death.` : `Click... ${p.name} survives.`);
    fx(S.gun.state, {pid: p.id});
    emit();
    await wait(2000); if (t !== token) return;
    S.gun = null; fx('gunDown', {pid: p.id}); emit();
  }

  async function apply(p, a, t) {
    const o = options(p);
    if (a.type === 'fold' || a.type === 'coward') {
      const coward = a.type === 'coward' && o.canCoward;
      if (coward) p.cowardUsed = true;
      p.folded = true; p.lastAction = coward ? "Coward's fold" : 'Fold';
      log(coward ? `${p.name} takes the Coward's Fold: only 1 bullet.` : `${p.name} folds and must take ${p.bet}.`);
      fx('fold', {pid: p.id});
      emit();
      await shoot(p, coward ? 1 : p.bet, t, coward ? "took the coward's way out" : 'folded');
    } else if (a.type === 'check' || (a.type === 'call' && o.toCall === 0)) {
      p.lastAction = 'Check'; log(`${p.name} checks.`);
      fx('check', {pid: p.id});
    } else if (a.type === 'call') {
      const added = S.currentBet - p.bet;
      p.bet = S.currentBet; p.lastAction = `Call ${p.bet}`; log(`${p.name} calls, loading up to ${p.bet}.`);
      fx('bet', {pid: p.id, added, total: p.bet});
    } else if ((a.type === 'raise' && o.canRaise) || (a.type === 'allin' && o.canAllIn)) {
      const to = a.type === 'allin' ? CHAMBERS : S.currentBet + 1;
      const added = to - p.bet;
      p.bet = S.currentBet = to;
      for (const q of S.players) if (q !== p) q.acted = false;
      p.lastAction = to === CHAMBERS ? 'ALL-IN' : `Raise ${to}`;
      log(to === CHAMBERS ? `${p.name} goes ALL-IN: 6 bullets! Call or fold.` : `${p.name} raises to ${to}.`);
      fx(to === CHAMBERS ? 'allin' : 'bet', {pid: p.id, added, total: to});
    } else { // invalid action counts as a call
      p.bet = S.currentBet; p.lastAction = `Call ${p.bet}`;
    }
    p.acted = true; p.switchedNow = false;
  }

  /* ---------- Switch: swap one hole card, once per match ---------- */
  function switchOpen(pid) {
    const p = S.players[pid], o = options(p);
    if (!o.canSwitch || S.awaiting !== pid) return null;
    S.switchOffer = {pid, cards: deck.splice(deck.length - o.switchCount, o.switchCount)};
    emit(); return S.switchOffer.cards;
  }
  function switchPick(pid, holeIdx, offerIdx) {
    const p = S.players[pid], off = S.switchOffer;
    if (!off || off.pid !== pid) return;
    if (holeIdx != null && offerIdx != null) {
      const old = p.hole[holeIdx];
      p.hole[holeIdx] = off.cards[offerIdx];
      off.cards[offerIdx] = old;
      p.switchUsed = true; p.switchedNow = true;
      log(`${p.name} uses Switch and swaps a hole card.`);
      fx('switch', {pid});
    }
    deck.unshift(...off.cards); // back to the bottom of the deck
    S.switchOffer = null; emit();
  }

  /* ---------- Bots ---------- */
  function botSwitch(p, opp) {
    const o = options(p);
    if (!o.canSwitch) return;
    const base = E.equity(p.hole, S.board, opp, 120);
    if (base > 0.55) return;
    const offer = deck.slice(deck.length - o.switchCount);
    let best = {gain: 0.07};
    for (let h = 0; h < 2; h++) for (let k = 0; k < offer.length; k++) {
      const hole = p.hole.slice(); hole[h] = offer[k];
      const eq = E.equity(hole, S.board, opp, 90);
      if (eq - base > best.gain) best = {gain: eq - base, h, k};
    }
    if (best.h == null) return;
    const card = deck.splice(deck.length - o.switchCount + best.k, 1)[0];
    const old = p.hole[best.h]; p.hole[best.h] = card; deck.unshift(old);
    p.switchUsed = true; p.switchedNow = true;
    log(`${p.name} uses Switch and swaps a hole card.`);
    fx('switch', {pid: p.id});
  }

  function botDecide(p) {
    const opp = Math.max(1, inPlay().length - 1);
    botSwitch(p, opp);
    const o = options(p);
    const eq = E.equity(p.hole, S.board, opp, S.board.length ? 240 : 160);
    const fair = 1 / (opp + 1);
    const edge = (eq - fair) * p.style.aggr;
    const r = Math.random();
    const foldCost = (o.canCoward ? 1 : p.bet) / CHAMBERS;
    const streetsLeft = {preflop: 3, flop: 2, turn: 1, river: 0}[S.street];
    const finalBet = Math.min(CHAMBERS, S.currentBet + (streetsLeft ? 1 : 0));
    const stayCost = (1 - eq) * finalBet / CHAMBERS;
    if (o.canAllIn && eq > 0.78 && r < 0.35) return {type: 'allin'};
    if (o.canRaise && (edge > 0.22 || (edge > 0.12 && r < 0.45))) return {type: 'raise'};
    if (o.canCheck && o.canRaise && r < p.style.bluff * (S.board.length ? 1.5 : 1)) return {type: 'raise'};
    if (o.canCheck) return {type: 'check'};
    if (stayCost <= foldCost + p.style.nerve + (Math.random() - 0.5) * 0.06) return {type: 'call'};
    return {type: o.canCoward ? 'coward' : 'fold'};
  }

  async function getAction(p, t) {
    S.toAct = p.id;
    if (p.kind === 'human') {
      S.awaiting = p.id; emit();
      fx('yourTurn', {pid: p.id});
      const a = await new Promise(r => { resolveHuman = r; });
      S.awaiting = null; resolveHuman = null;
      if (S.switchOffer) switchPick(p.id, null, null);
      return a;
    }
    emit();
    fx('thinking', {pid: p.id});
    await wait(800 + Math.random() * 700);
    if (t !== token) return null;
    return botDecide(p);
  }

  async function bettingRound(start, t) {
    let i = start;
    for (let guard = 0; guard < 300; guard++) {
      if (t !== token) return false;
      const live = inPlay();
      if (live.length <= 1) return true;
      if (live.every(p => p.acted && p.bet === S.currentBet)) return true;
      const p = S.players[i];
      if (p.inHand && !p.folded && p.alive && !(p.acted && p.bet === S.currentBet)) {
        const a = await getAction(p, t);
        if (t !== token || !a) return false;
        await apply(p, a, t);
        if (t !== token) return false;
        S.toAct = null; emit();
        await wait(350);
      }
      i = (i + 1) % S.players.length;
    }
    return true;
  }

  async function playHand() {
    const t = token;
    S.handNo++;
    S.board = []; S.showdown = false; S.winners = null; S.switchOffer = null;
    deck = E.shuffle(E.newDeck());
    for (const p of S.players) Object.assign(p, {hole: [], bet: p.alive ? 1 : 0, folded: false, acted: false, inHand: p.alive, lastAction: '', switchedNow: false});
    S.currentBet = 1;
    S.dealer = nextFrom(S.dealer, p => p.alive);
    for (let k = 0; k < 2; k++) for (const p of S.players) if (p.inHand) p.hole.push(deck.pop());
    S.street = 'preflop';
    log(`— Hand ${S.handNo}. Everyone antes 1 bullet. ${S.players[S.dealer].name} has the button.`);
    fx('deal', {count: alive().length * 2});
    emit(); await wait(1000);
    if (!await bettingRound(nextFrom(S.dealer, p => p.inHand && p.alive), t)) return;

    for (const [street, k] of [['flop', 3], ['turn', 1], ['river', 1]]) {
      if (inPlay().length <= 1) break;
      for (const p of S.players) { p.acted = false; if (!p.folded) p.lastAction = ''; }
      deck.pop();
      for (let j = 0; j < k; j++) S.board.push(deck.pop());
      S.street = street;
      fx('board', {count: k, street});
      emit();
      await wait(1000); if (t !== token) return;
      if (!await bettingRound(nextFrom(S.dealer, p => p.inHand && !p.folded && p.alive), t)) return;
    }
    if (t !== token) return;

    const live = inPlay();
    S.toAct = null;
    if (live.length === 1) {
      S.winners = [live[0].id];
      log(`${live[0].name} wins the hand: everyone else folded.`);
      fx('win', {ids: S.winners});
      emit(); await wait(1600);
    } else if (live.length > 1) {
      S.street = 'showdown'; S.showdown = true;
      const scores = live.map(p => ({p, h: E.bestHand(p.hole.concat(S.board))}));
      const top = Math.max(...scores.map(s => s.h.score));
      const win = scores.filter(s => s.h.score === top);
      S.winners = win.map(s => s.p.id);
      log(`${win.map(s => s.p.name).join(', ')} win${win.length > 1 ? '' : 's'} with ${win[0].h.name}.`);
      fx('showdown', {ids: S.winners});
      emit(); await wait(4800); if (t !== token) return;
      for (const s of scores) {
        if (s.h.score === top || !s.p.alive) continue;
        await shoot(s.p, s.p.bet, t, `lost with ${s.h.name}`);
        if (t !== token) return;
      }
    }
    const left = alive();
    if (left.length <= 1) {
      S.winner = left.length ? left[0].id : null;
      log(left.length ? `${left[0].name} is the last one standing!` : 'Nobody made it out.');
      S.over = true; fx('gameOver', {winner: S.winner}); emit(); return;
    }
    playHand();
  }

  return {
    state: S, CHAMBERS, STREET_NAME,
    options: id => options(S.players[id]),
    act(a) { if (resolveHuman) resolveHuman(a); },
    switchOpen, switchPick,
    start() { token++; playHand(); },
    stop() { token++; if (resolveHuman) resolveHuman(null); },
  };
}

root.PokerGame = {createGame, CHAMBERS};
})(typeof window !== 'undefined' ? window : globalThis);
