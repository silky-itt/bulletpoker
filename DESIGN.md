# Bullet Poker — Design Bible

A browser-based 3D bluffing game in the spirit of *Liar's Bar* (Curve Animation, 2024): Texas Hold'em where you bet **bullets**, not chips, at a grimy bar table full of animal regulars. This file is the reference for every visual, audio and UX decision. Follow it when adding features; update it when a decision changes.

> Sources and status. Facts about Liar's Bar come from its Steam news feed (app 3097560), SteamSpy and Wikipedia (see *References*). Everything marked **[Design]** is our own decision, not a claim about the original game. We do **not** copy Liar's Bar characters, names, models or audio. We borrow the *mood* (dark comedy, tension, Russian roulette), not the assets.

---

## 1. Pillars

1. **Tension over complexity.** Every decision should feel like it might kill you. Show the odds; never hide the risk.
2. **Readable at a glance.** The game is played in first person in a dim room, so the HUD has to carry the critical info: your cards, your bullets, the bet to call, whose turn it is.
3. **Characters with attitude.** Players are animals with faces that react: they blink, look at whoever is acting, panic when the gun is on them, smirk when they win.
4. **Juice on every action.** Each action has a sound and a small motion. The gunshot is the one big moment, so nothing else competes with it.
5. **Runs anywhere.** Single HTML page plus JS, Three.js r128 from cdnjs, no external assets. All audio is synthesized with the Web Audio API. Must run on an M1 MacBook and on a phone.

---

## 2. Rules (current)

| Item | Rule |
|---|---|
| Players | 2–4 humans, **each on their own device**, joined through an online table. No bots. |
| Ante | Every hand, each player starts with **1 bullet** loaded. |
| Betting | Texas Hold'em streets: pre-flop, flop, turn, river. **Check**, **Call** (match highest bullets), **Raise** (+1 bullet), **All-in** (straight to 6). |
| Gun | Six-chamber revolver. With *k* bullets the death chance is *k*/6. A full 6-bullet load has a **5% God Save** chance: the hammer falls on nothing and the player lives (named after the original game's *God Save* mechanic). |
| Fold | You pull the trigger immediately with the bullets you have loaded. |
| Showdown | Best hand is safe. Every other player still in pulls the trigger with their bullets. Ties are all safe. |
| Coward's Fold | Once per match: fold and take only 1 bullet. |
| Switch | Once per match, before the river: swap one hole card for one of 4 / 3 / 2 offered cards (pre-flop / flop / turn). You cannot go All-in on the turn you Switch. *(Original game: Switch options shrink from 4 to 2 and All-in is blocked on the Switch turn, per the 2026-07-03 patch notes.)* |
| Win | Last player alive. |

---

## 3. Visual direction

### 3.1 Mood
- **Setting:** an underground bar after hours. One warm lamp over a green felt table. Everything outside the lamp cone falls into darkness and fog.
- **Palette** (shared by the 3D scene and the HUD):

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#0d0a08` | Room darkness, page background |
| `--wood` | `#231811` | Panels, table rim |
| `--line` | `#4a3726` | Panel borders |
| `--felt` | `#1f4a32` | Table felt |
| `--paper` | `#f1e8d4` | Card faces |
| `--lamp` | `#e2a64a` | Accent: turn highlight, bullets, primary buttons |
| `--blood` | `#c8412f` | Danger: All-in, gunshot flash, death |
| `--ok` | `#8cbc72` | Survived, winner |
| `--muted` | `#a58f72` | Secondary text |

- **Light:** one warm spotlight (≈ 2700 K, `#ffc77a`) with soft shadows, plus a very low hemisphere fill. The lamp sways a little; its brightness flickers by about 4%.
- **Type:** *Playfair Display* (italic 900) for the logo and big moments ("BANG!"), *Alfa Slab One* for the showdown board, *Be Vietnam Pro* for UI text, *JetBrains Mono* for numbers and labels.

### 3.2 Characters **[Design]**
Low-poly, built from primitives, chunky proportions (big head, small body), seated at the table.

| Key | Name | Animal | Look | Accessory | Personality (bot) |
|---|---|---|---|---|---|
| `fox` | Rusty | Red fox | Orange fur, cream muzzle, pointed ears, black nose tip | Green bow tie | Sly: bluffs more |
| `pig` | Truffle | Pig | Pink, flat round snout with two nostrils, floppy ears | Grey flat cap | Reckless: calls a lot |
| `bear` | Bruno | Brown bear | Dark brown, round ears, big black nose | Red scarf | Steady: plays tight |
| `bull` | Tank | Bull | Charcoal, wide muzzle, ivory horns | Gold nose ring | Aggressive: raises a lot |

**Face kit (every character):**
- **Eyes:** white sclera + black pupil + small highlight. Pupils track whoever is acting.
- **Blink:** every 2–6 s at random, 120 ms.
- **Brows:** two dark bars. Neutral → raised (fear) → angled down (confident).
- **Nose:** species-specific (see table).
- **Mouth:** dark opening whose height animates. Closed normally, flaps while "talking" (when they act), wide open in fear, smile arc when they win.

**Expressions:**

| Trigger | Face |
|---|---|
| Their turn / acting | Mouth flaps for about 0.6 s, head turns to the table |
| Gun on them | Eyes wide, brows up, mouth open, body trembles |
| Survived (click) | Big exhale: head drops then recovers, short smile |
| Died (bang) | Slumps forward onto the table, eyes become "X" (pupils hidden) |
| Won the hand | Smile arc + brows confident for 2 s |

### 3.3 Table objects
- **Cards:** 0.28 × 0.40 units, cream face with large rank and suit, red-black diagonal-stripe back. They slide from the deck when dealt and flip at showdown.
- **Bullets:** brass case + copper tip, standing upright in a 3-per-row cluster in front of each player. One clink per bullet added.
- **Revolver:** rests in the middle of the table. It has a real 6-chamber cylinder (holes visible on the back face).
- **Reload sequence** (every shot):
  1. **Open (0.7 s):** the gun floats up in front of the shooter, rear of the cylinder turned toward the viewer, barrel tilted up.
  2. **Load (0.42 s per bullet):** each bet bullet lifts off the table in a small arc and drops into the next chamber. A brass round appears in that chamber with a "tink".
  3. **Spin & raise (2.1 s):** the cylinder spins, the hammer cocks, and the gun moves to the shooter's temple (or beside your camera if it's you). The shooter's face goes to fear.
  4. **Result (2 s, 3.2 s for God Save):** click / GOD SAVE / BANG.
  - **God Save effect:** golden radial flash over the screen, a warm light from above the survivor, a spinning gold halo over their head, "GOD SAVE!" text popping in with a glow, and a choir chord with bells. The survivor smiles with relief.
  - HUD mirror: a 2D cylinder (6 chambers) in the center fills chamber by chamber ("Rusty loads 2 / 3"), then spins ("Rusty pulls the trigger · 3 of 6").

---

## 4. Camera

| Mode | When | Framing |
|---|---|---|
| **Seat view** | A human is playing | Eye height in your chair, looking at the table. Mouse or drag rotates the view ±90° to look at neighbors. |
| **Board view** | Toggle with the **Board** button or key **B** | Camera rises above the table and looks down at the community cards. Smooth 0.6 s move. A 2D strip of the board also shows in the HUD. |
| **Spectator** | Bots only | High three-quarter view of the whole table. |
| **Shot cam** **[Future]** | A gun event | Brief dolly toward the shooter's face. |



---

## 5. HUD and UX

### 5.1 Layout (desktop, also stacks on phones)
```
┌──────────────────────────────────────────────────────────────┐
│ [Logo · Hand 3 · Flop · Bet 2]        [♪ Music][🔊 SFX][Board][Log][Leave] │
│                                                              │
│            name tags float above each character              │
│               (name · ●●○○○○ bullets · last action)            │
│                                                              │
│                    BIG MOMENT TEXT (BANG!)                   │
│                                                              │
│      ┌ your hole cards (2D) · bullets loaded · hand name ┐   │
│      └ [Fold 2] [Coward 1] [Call 3] [Raise 4] [ALL-IN] [Switch] ┘   │
│        risk line: "Fold: 33% death · Call and lose: 50% death"   │
└──────────────────────────────────────────────────────────────┘
```

### 5.2 Rules of thumb
- **Show the odds.** Every decision button states its bullet count, and a risk line shows death % for fold vs. call-and-lose.
- **Color = meaning:** amber = your turn / primary, red = lethal (All-in, BANG), green = safe / win. Never use red for something harmless.
- **Turn indicator:** the active player's name tag glows amber, and a soft "ding" plays when it becomes *your* turn.
- **Buttons only when actionable.** Hide actions you cannot take instead of greying them out.
- **Keyboard:** `F` fold, `C` check/call, `R` raise, `A` all-in, `S` switch, `B` board view, `M` music. **[Future]** Show the hints on the buttons.
- **Phone:** controls wrap into rows; the log is hidden behind its button; the board strip stays visible.
- **No browser dialogs.** All confirmations are built into the page.

### 5.3 Showdown board
Shown for 4.8 s at showdown, hidden while a gun is in use. Inspired by the *Liar's Poker* results screen (see the reference screenshot the user provided).
- **Top:** the five community cards inside a gold-outlined box with a gold diamond on the top and bottom edges.
- **Rows:** one full-width translucent band per player still in the hand, with gold rules between rows, sorted from best to worst:
  `Name (right-aligned) | two hole cards | ordinal + HAND NAME | SAFE / PULLS n`
- **Ordinal** = rank among the 10 classic hand types: 1st Royal Flush, 2nd Straight Flush, 3rd Four of a Kind, 4th Full House, 5th Flush, 6th Straight, 7th Three of a Kind, 8th Two Pair, 9th Pair, 10th High Card. The ordinal is gold, the hand name is cream, both set in a chunky slab serif (*Alfa Slab One*) in uppercase.
- **Winner row:** warm gold gradient band plus a green **SAFE** tag. Losers get a red **PULLS n** tag (n = bullets they will load).
- Phone: the name moves above the cards; cards shrink.

### 5.4 Flow: profile → lobby → table
1. **Profile:** your name + a strip of **portrait cards** (head-and-shoulders render of each animal under the bar lamp). Saved in localStorage, so returning players skip straight to the lobby.
2. **Lobby:** *Open tables* (live list: table name, host, seats used, Join), *Host a table* (name + "Show in the open tables list"), *Join with a code*. Opening an invite link (`…/#CODE`) joins that table directly.
3. **Table (waiting):** big table code, invite link with **Copy**, 4 seat cards with portraits, *Change character* (taken characters are disabled). Only the host sees **Start game**, enabled from 2 players.
4. **Game over:** the host chooses *Play again* (same players) or *Back to the room*; guests wait.

Characters are unique per table: if you join with a taken character, the host gives you a free one, and you can change it in the room.

---

## 6. Audio

All sound is synthesized at runtime (Web Audio API). No files, so there are no license issues and the CSP stays happy. Audio starts only after the first click (*Take a seat*), as browsers require.

### 6.1 Music **[Design]**
Two tracks. The **Music** button (or key **M**) cycles *High Stakes → Smoky Jazz → Off*, and the choice is remembered (localStorage).

**Track 1: High Stakes** (default). Tense, driving, spaghetti-western-meets-thriller.
- D minor, 112 BPM, 16th-note grid. Progression `Dm – B♭ – Gm – A` (i – VI – iv – V, with the V pulling back to the tonic).
- **Adaptive intensity**, recomputed on every state change:

| Level | When | Layers |
|---|---|---|
| 0 | Pre-flop, 1 bullet each | Dark saw pad, pulsing 8th-note bass, kick on 1 & 3, off-beat hats |
| 1 | Board is out or the bet is 2 | + snare on 2 & 4, tresillo string stabs (3-3-2), whistle hook every 8 bars |
| 2 | Bet is 3–4, or showdown | + syncopated kick, 16th square arpeggio, open hats |
| 3 | Bet is 5–6 (All-in) | + 16th bass, four-on-the-floor, taiko hits, tom fill every 4th bar, noise riser |

**Track 2: Smoky Jazz.** Slow swing at 84 BPM, `Am7 – D7 – Gmaj7 – E7`, walking bass, Rhodes stabs, brushes, vinyl crackle.

**Gun moments (both tracks):** from the first loaded bullet until the result, the music ducks (low-pass ~350 Hz, about −55%) and a heartbeat plays at ~86 BPM. Full mix returns after the click / bang.

### 6.2 Sound effects

| Event | Sound recipe |
|---|---|
| Card dealt / board card | Short band-passed noise "flick" with an upward sweep |
| Check | Two knuckle knocks on wood (low sine thumps + noise) |
| Call / Raise (per bullet) | Brass "clink": two high sine partials (≈2.8 k / 4.2 kHz) with fast decay, staggered 90 ms per bullet |
| All-in | Six rapid clinks, then a low "doom" hit |
| Fold | Card toss (longer noise swish) plus a soft thud |
| Switch | Two quick card flicks |
| Cylinder opens | Latch click + short metallic slide |
| Each bullet loaded | Brass "tink" + chamber clack (one per bullet, 420 ms apart) |
| Gun raised | Cylinder spin: 12–16 clicks slowing down, then the hammer cocks |
| Click (survived) | Sharp dry hammer click, then a breath of relief (filtered noise) |
| BANG | Noise burst with falling low-pass + 55 Hz thump + synthetic reverb tail; screen shake + red flash |
| God Save | Dry hammer click, then a soft detuned choir chord (C major) with a cascade of high bells |
| Hand won | Short rising Rhodes arpeggio |
| Your turn | Soft two-tone bell (880 / 1320 Hz) |
| UI click | Tiny tick |

---

## 7. Feedback and effects checklist
- [x] Cards slide from the deck, bullets drop in, gun flies to the head
- [x] Muzzle flash light + camera shake + red screen flash on BANG
- [x] Lamp sway and flicker
- [x] Characters breathe, look around, slump on death
- [x] Faces: blink, pupils track the actor, mouth talk, fear, smile
- [x] Synth music + SFX with ducking during gun moments
- [x] Adaptive "High Stakes" track (4 intensity levels)
- [x] Showdown results board
- [x] Reload sequence: bullets fly into the chambers; HUD cylinder mirror
- [x] Board view toggle
- [ ] **[Future]** Shot cam dolly, slow-motion on BANG
- [ ] **[Future]** Smoke particles in the lamp cone
- [ ] **[Future]** Character hands that actually hold the gun
- [x] Online tables: lobby list, host / join by code or invite link (see §8)
- [ ] **[Future]** Reconnect to a running game after a page refresh
- [ ] **[Future]** Host migration (game survives the host leaving)

---

## 8. Online play
- **Topology:** the host's browser is the server. It runs `PokerGame`; guests send intents and receive a filtered view of the state. Guests can never see another player's hole cards before showdown, because those cards are never sent to them.
- **Game transport:** PeerJS (WebRTC data channels, DTLS-encrypted), using the free PeerJS cloud broker only for the handshake. Peer id = `bulletpoker-v1-<CODE>`.
- **Lobby transport:** public MQTT brokers over WebSocket (HiveMQ and EMQX, **connected in parallel**, because each takes 6–7 s to answer and host and viewer must not end up on different brokers). Public tables publish a retained message on `bulletpoker/v1/rooms/<CODE>` every 8 s. An MQTT *last will* plus an explicit clear on close removes the table; listings older than 30 s are dropped.
- **Messages:** guest → host: `hello`, `pick`, `act`, `swOpen`, `swPick`. Host → guest: `welcome`, `room`, `state` (filtered, with the guest's seat), `ev` (sound/face events), `lobby`, `bye`.
- **Leaving:** a guest who disconnects mid-game leaves the table (out, no bullet fired). If the host leaves, the table closes for everyone.
- **Limits:** tables are best-effort (free public infrastructure, no accounts). Some strict networks block WebRTC. Only runs from a normal web host such as GitHub Pages, not inside a claude.ai artifact, which blocks WebRTC and WebSockets.

## 9. Tech notes
- `engine.js`: card model, hand evaluator (best 5 of 7), Monte Carlo equity. No DOM.
- `game.js`: rules and turn flow; emits `onChange(state)` and `onEvent(type, data)`. No DOM.
- `scene.js`: Three.js scene, characters, faces, camera modes, portrait renderer. Reads state only.
- `audio.js`: Web Audio synth for music and SFX.
- `net.js`: lobby (MQTT) and table networking (PeerJS), state filtering per seat.
- `index.html`: profile, lobby, room, HUD, input, and the wiring between the files above.
- Three.js **r128 UMD** from cdnjs (the last line with a `three.min.js` global build there).

---

## References
- Liar's Bar on Steam: https://store.steampowered.com/app/3097560/Liars_Bar/
- Steam news API (patch notes, incl. *Liar's Poker has arrived!* 2025-06-27 and *Liar's Deck Remastered* 2026-07-03): `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=3097560`
- SteamSpy: https://steamspy.com/app/3097560
- Wikipedia, *Liar's Bar*: https://en.wikipedia.org/wiki/Liar%27s_Bar
- Steam community guide, *Guide to Every (Current) Game Mode* (seen only as a search snippet): https://steamcommunity.com/sharedfiles/filedetails/?id=3377103757
- HUD attention and "juice" guidance: https://respawn.outlookindia.com/gaming/gaming-guides/ui-and-ux-in-games-building-menus-huds-and-feedback-systems
