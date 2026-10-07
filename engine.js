// Bullet Poker: cards, hand evaluator and Monte Carlo equity. No DOM.
(function (root) {
'use strict';
const SUITS = ['♠', '♥', '♦', '♣'];
const RANK_LABEL = {11: 'J', 12: 'Q', 13: 'K', 14: 'A'};
const rankLabel = r => RANK_LABEL[r] || String(r);
const HAND_NAME = ['High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'];

function newDeck() {
  const d = [];
  for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) d.push({r, s, id: s * 13 + r});
  return d;
}
function shuffle(a, rnd = Math.random) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Score 5 cards: higher is stronger.
function eval5(c) {
  const rs = c.map(x => x.r).sort((a, b) => b - a);
  const flush = c.every(x => x.s === c[0].s);
  const uniq = [...new Set(rs)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (rs[0] - rs[4] === 4) straightHigh = rs[0];
    else if (rs[0] === 14 && rs[1] === 5) straightHigh = 5; // A-2-3-4-5
  }
  const cnt = {};
  for (const r of rs) cnt[r] = (cnt[r] || 0) + 1;
  const groups = Object.entries(cnt).map(([r, n]) => [n, +r]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const order = groups.map(g => g[1]);
  let cat;
  if (straightHigh && flush) cat = 8;
  else if (groups[0][0] === 4) cat = 7;
  else if (groups[0][0] === 3 && groups[1][0] === 2) cat = 6;
  else if (flush) cat = 5;
  else if (straightHigh) cat = 4;
  else if (groups[0][0] === 3) cat = 3;
  else if (groups[0][0] === 2 && groups[1][0] === 2) cat = 2;
  else if (groups[0][0] === 2) cat = 1;
  else cat = 0;
  const kick = (cat === 8 || cat === 4) ? [straightHigh] : order;
  let score = cat;
  for (let i = 0; i < 5; i++) score = score * 15 + (kick[i] || 0);
  return score;
}
const catOf = score => Math.floor(score / 759375); // 15^5

// Best 5-card score out of 5-7 cards.
function bestHand(cards) {
  if (cards.length < 5) return null;
  let best = -1, bestCards = null;
  const n = cards.length, five = [];
  (function pick(start) {
    if (five.length === 5) { const s = eval5(five); if (s > best) { best = s; bestCards = five.slice(); } return; }
    for (let i = start; i <= n - (5 - five.length); i++) { five.push(cards[i]); pick(i + 1); five.pop(); }
  })(0);
  return {score: best, cards: bestCards, name: HAND_NAME[catOf(best)]};
}

// Win probability by Monte Carlo simulation.
function equity(hole, board, nOpp, sims = 300) {
  const used = new Set([...hole, ...board].map(c => c.id));
  const rest = newDeck().filter(c => !used.has(c.id));
  let win = 0;
  for (let s = 0; s < sims; s++) {
    const d = shuffle(rest.slice());
    let k = 0;
    const b = board.concat(d.slice(k, k + 5 - board.length)); k += 5 - board.length;
    const me = bestHand(hole.concat(b)).score;
    let best = 0, ties = 0, lost = false;
    for (let o = 0; o < nOpp; o++) {
      const sc = bestHand([d[k++], d[k++]].concat(b)).score;
      if (sc > me) { lost = true; break; }
      if (sc === me) ties++;
    }
    if (!lost) win += 1 / (ties + 1);
  }
  return win / sims;
}

// Split main and side pots (used by the chip version).
function settlePots(players, board) {
  const contrib = players.map(p => p.totalBet);
  const levels = [...new Set(contrib.filter(x => x > 0))].sort((a, b) => a - b);
  const live = players.filter(p => !p.folded && p.inHand);
  const scores = new Map(live.map(p => [p.id, bestHand(p.hole.concat(board)).score]));
  const results = [];
  let prev = 0;
  for (const lv of levels) {
    let amount = 0;
    for (const p of players) amount += Math.max(0, Math.min(p.totalBet, lv) - prev);
    const elig = live.filter(p => p.totalBet >= lv);
    prev = lv;
    if (!amount) continue;
    if (!elig.length) { results.push({amount, winners: [], refund: true}); continue; }
    const top = Math.max(...elig.map(p => scores.get(p.id)));
    const winners = elig.filter(p => scores.get(p.id) === top);
    const share = Math.floor(amount / winners.length);
    let rem = amount - share * winners.length;
    for (const w of winners) { w.chips += share + (rem > 0 ? 1 : 0); rem--; }
    results.push({amount, winners: winners.map(w => w.id), score: top});
  }
  // merge pots with the same winners
  const merged = [];
  for (const r of results) {
    const key = r.winners.join(',');
    const last = merged[merged.length - 1];
    if (last && last.key === key) last.amount += r.amount; else merged.push({...r, key});
  }
  return merged;
}

// Rank among the 10 classic hand types: 1st Royal Flush ... 10th High Card.
const RANK10_NAME = ['High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'];
function handRank10(best) {
  const cat = catOf(best.score);
  const royal = cat === 8 && best.cards.some(c => c.r === 14) && best.cards.some(c => c.r === 13);
  const place = royal ? 1 : 10 - cat;
  const suffix = place === 1 ? 'st' : place === 2 ? 'nd' : place === 3 ? 'rd' : 'th';
  return {place, suffix, name: royal ? 'Royal Flush' : RANK10_NAME[cat]};
}

root.PokerEngine = {SUITS, rankLabel, HAND_NAME, newDeck, shuffle, eval5, bestHand, equity, settlePots, catOf, handRank10};
})(typeof window !== 'undefined' ? window : globalThis);
