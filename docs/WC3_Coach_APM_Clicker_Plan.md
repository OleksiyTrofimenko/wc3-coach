# WC3 Coach — Reflex Clicker (APM Trainer Game) — Design & Implementation Plan

> Status: PLAN (proposed task, slots under EPIC 4 alongside T4.1 drill engine).
> Renderer decision: **pure SVG + animations** (no WebGL, no PixiJS, no deps).
> Art direction: **stylized original** vector look (no ripped IP).
> Target: **stable 60fps**, juicy game-feel, integrates with the existing
> render-agnostic trainer engine pattern and emits the canonical `DrillResult`.

---

## 1. Concept

A fast, juicy reflex game that trains the raw mechanical skills WC3 rewards:
**target acquisition speed, click precision under pressure, sustained click
throughput (APM/EPM), and target prioritization.**

Stylized framing (no Blizzard IP): arcane **rifts** tear open across a
battlefield. Each rift spawns small and **charges up**, growing larger over its
short life. Click a rift to **dispel** it. Dispel it *early* — while it's still
small and freshly opened — for maximum points. Let it finish charging and it
**unleashes** (lunges + vanishes): a miss that breaks your combo. The pressure
ramps: rifts open faster and live shorter as the session goes on.

The core tension is deliberately WC3-shaped: the *highest-value* targets are the
*smallest and youngest* (hardest to click), so you're constantly trading safety
for value — exactly like choosing whether to focus-fire the right unit in a fight.

### Design pillars
1. **Reads instantly.** Every state (fresh / charging / about to unleash) is
   legible at a glance through color, size, and motion.
2. **Rewards speed + precision.** The scoring curve makes fast small clicks
   strictly better than slow safe ones.
3. **Juice echoes the mechanic.** Faster, cleaner play produces brighter, faster
   feedback. (Vlambeer "Art of Screenshake" / "Juice it or Lose it" principles.)
4. **60fps is a feature, not a hope.** Architecture is built to hit it, not
   patched toward it.

---

## 2. Core mechanics (formalized)

### 2.1 Rift (unit) lifecycle

Each rift is a pure data record owned by the engine:

```
Rift {
  id: number
  x, y: number          // SVG user-unit coords within the arena viewBox
  spawnT: number        // clock() ms at spawn
  lifetimeMs: number    // how long until it "unleashes" (difficulty-scaled)
  kind: RiftKind         // visual/value variant (see 2.4)
  state: 'charging' | 'unleashing' | 'dispelled' | 'gone'
}
```

Age fraction over its life: `a = clamp((now - spawnT) / lifetimeMs, 0, 1)`.

- **Size** grows with age: `radius = lerp(rMin, rMax, easeOutCubic(a))`.
  Fast pop-in, then slower swell — small/young for the first beat, then big.
- At `a >= ~0.85` it enters a **telegraph** wind-up (last ~150 ms): visibly
  flares/jitters to warn it's about to unleash.
- At `a >= 1` with no dispel → **unleash**: short lunge toward screen centre +
  vanish. Recorded as an **escape (miss)**.

### 2.2 Clicking

- **Dispel (hit):** pointerdown lands inside a rift → it's destroyed, points
  awarded, combo increments, juice fires.
- **Overlap rule:** if the click is inside multiple rifts, the **smallest**
  (youngest, highest-value) wins. This rewards precision over spray.
- **Misclick:** pointerdown on empty arena → counts against accuracy, does **not**
  break combo (we punish escapes, not eagerness). Tunable.

### 2.3 Scoring curve (the heart of it)

Points for a dispel at age `a`, with combo multiplier `m`:

```
base   = round( lerp(P_MAX, P_MIN, easeInOutQuad(a)) )   // P_MAX≈100 fresh, P_MIN≈10 late
points = base * m
```

So dispelling the instant a rift opens ≈ **100 × combo**; dispelling just before
it unleashes ≈ **10 × combo**. Early + small + precise = the optimal line.

- **Combo** `m`: rises one tier every N consecutive dispels (e.g. tier each 5
  hits, `m = 1 + 0.5 * tier`, capped). **Any escape resets combo to ×1.**
- **Escape penalty:** small flat score hit (e.g. −25) + combo reset + harsh juice.

### 2.4 Rift kinds (variety + prioritization training)

| Kind | Look | Behaviour | Trains |
|---|---|---|---|
| Standard | Amber orb | Normal curve | Baseline reflex |
| Swift | Teal, smaller | Shorter lifetime, +value | Reaction speed |
| Brute | Crimson, larger | Needs 2 clicks; slower | Sustained click bursts |
| Ward (don't-click) | Cool blue sigil | Friendly — clicking it penalises | Target discrimination (focus-fire the *right* thing) |

(Ward and Brute are stretch; ship Standard + Swift first.)

### 2.5 Difficulty ramp (one 60 s session, tunable)

| Param | Start | End |
|---|---|---|
| Spawn interval | 700 ms | 280 ms |
| Rift lifetime | 1500 ms | 900 ms |
| Max concurrent | 4 | 9 |
| Swift chance | 10% | 35% |

Linear (or easeIn) interpolation across the session clock. APM demand climbs as
your hands warm up.

---

## 3. Scoring → canonical `DrillResult`

The in-game **points** are the headline number the player chases. For the rest of
the platform (analyzer, `apm_sessions`, history), the session also produces the
existing `DrillResult` (shared-types), so this game is a first-class citizen
beside the hotkey drills:

- `apm`  = total clicks (hits + misclicks) per minute → raw throughput.
- `epm`  = dispels per minute → effective throughput (the meaningful one).
- `accuracy` = hits / total clicks → click precision.
- `reactionMs` = mean `(clickT − spawnT)` over hits → **directly** the reaction
  metric this game is built to train.
- `score` (0–1000) = normalized composite (reuse the existing weighting shape:
  accuracy / speed / epm), so it's comparable across drill types.
- `checkpoints[]` = per-dispel `{ tMs, ok }`, plus escapes as `ok:false`.
- Extra game-native stats (points, max combo, escape count) ride along in a
  small extension and persist to `apm_sessions` (T4.6 — currently a localStorage
  stub; this game can be the thing that promotes it to real persistence).

---

## 4. Architecture

Reuse the proven pattern from `apps/web/src/trainer/engine/`: **render-agnostic
core + injected clock + pure scoring**, with a thin render layer on top. Because
the core never touches the DOM, the SVG renderer is just one consumer of engine
state — swappable, testable, deterministic.

```
apps/web/src/trainer/clicker/
├─ engine/
│  ├─ types.ts          # Rift, ClickerScenario, ClickResult, ClickerState
│  ├─ ClickEngine.ts    # spawn + lifecycle + hit-test + combo state machine
│  │                    #   - injected clock()  (like DrillEngine)
│  │                    #   - injected seeded RNG (deterministic spawns for tests)
│  │                    #   - tick(): advance time, expire/unleash rifts
│  │                    #   - handleClick(x,y): hit-test, score, combo
│  │                    #   - subscribe(state => …)  (same pub/sub as DrillEngine)
│  ├─ spawner.ts        # deterministic spawn schedule from seed + difficulty curve
│  ├─ scoring.ts        # pure points curve + DrillResult metrics
│  └─ *.test.ts         # vitest, deterministic via fake clock + fixed seed
└─ render/
   ├─ SvgStage.tsx      # React: static SVG scaffold (defs, layers, pools)
   ├─ raf-loop.ts       # single rAF driver: engine.tick() + imperative paint
   ├─ pool.ts           # node pools (rifts, particles, score popups)
   ├─ effects.ts        # hit burst / shake / popups (CSS-class fire-and-forget)
   └─ background.ts     # parallax battlefield layers + embers

apps/web/src/app/trainer/clicker/page.tsx   # route, HUD overlay, wires input→engine
```

### 4.1 The 60fps SVG pattern (this is the crux)

SVG can absolutely hold 60fps for an APM clicker (≤~12 rifts + a pooled
few-hundred particles) **if** you follow three rules:

1. **React renders structure once; a rAF loop mutates per-frame.** Never
   `setState` per frame — that re-renders the tree and dies. React builds the
   SVG scaffold and a fixed pool of reusable `<g>` nodes; the rAF loop reads
   engine state and writes `transform` on those nodes via refs.
2. **Animate `transform: translate()/scale()`, not geometry attrs.** Mutating
   `cx/cy/r/width` triggers SVG layout. Mutating `transform` on a wrapper `<g>`
   (ideally CSS transform so the compositor can help) is cheap. Units are drawn
   once at unit-radius and *scaled*, never re-pathed.
3. **Pool everything; allocate nothing in the loop.** Pre-create N rift nodes
   and M particle nodes hidden; show/reuse on spawn, hide on death. No
   `createElement`/`removeChild` churn → no GC spikes.

Decoupling: the **engine** advances on the real clock (deterministic logic); the
**renderer** interpolates rift size/position each frame for buttery motion.
Pointer input maps screen→SVG user units via `getScreenCTM().inverse()`, then
calls `engine.handleClick(x, y, clock())` — hit-testing happens in engine space.

### 4.2 Cheap glow without per-frame filters

SVG `feGaussianBlur` per frame is the classic SVG perf trap. Instead:
- Glow = 2–3 stacked translucent circles with a **static** radial-gradient fill
  (defined once in `<defs>`), scaled with the rift. No runtime filtering.
- Reserve `filter` for static background haze only, never on moving nodes.

### 4.3 Fire-and-forget effects via CSS

Hit bursts, score popups, ring expansions: grab a pooled node, set its position,
add a CSS animation class, and let the compositor run the keyframes; remove the
class on `animationend` and return the node to the pool. Keeps the rAF loop lean
and offloads short effects to the browser.

---

## 5. Game feel / juice checklist

Echoing the mechanic — cleaner/faster play → brighter/faster feedback.

**Spawn:** scale from 0 with `easeOutBack` overshoot pop; quick fade-in; faint
ground shadow so it sits in the world.

**Charging (idle):** gentle pulse/bob; hue warms and motion quickens as it nears
unleash, telegraphing danger.

**Telegraph (last ~150 ms):** flare + jitter + a "wind-up" — the fair warning.

**Dispel (hit):**
- ~30–50 ms **hitstop** (freeze the swell for a frame beat) — makes clicks feel
  like they *land*.
- White flash on the node, radial **spark burst** (pooled particles), expanding
  ring.
- **Score popup** rises + fades (`+100`, bigger/brighter at high combo).
- **Combo counter** punch-scales; SFX pitch steps up per combo tier.
- **Screenshake:** short (60–150 ms), eased decay, amplitude scaled by combo,
  mixed H/V. Respect `prefers-reduced-motion` (swap shake for a flash).

**Escape (miss):** red vignette flash, harder shake, combo-break shatter, low
"whoom" SFX. The sting that makes you not want to miss again.

**Background:** parallax battlefield — far sky with fel/amber gradient + drifting
fog, mid silhouetted ruins/banners, near foreground with flickering torch glow;
**embers** as a pooled particle drift. Intensity subtly rises with combo. All
vector + gradients, no raster, no per-frame filters.

**Audio (optional, asset-dependent):** WebAudio; layered dispel tick with
combo-pitch, escape thud, ambient battlefield bed. Can be synth-generated to
avoid asset hunting; flagged as its own milestone.

---

## 6. Art direction (stylized original, pure SVG)

- **Rifts** = arcane vector sigils: a glowing core orb + 2–3 rotating rune rings,
  color-coded by kind. "Charging" = the rings spin up and the core brightens.
  Built from circles/paths + static radial gradients; entirely scalable.
- **Palette** maps to the app's existing design tokens where possible (warm
  amber/crimson for danger, cool teal/blue for swift/ward), on a dark fel-lit
  field.
- **Battlefield** = layered vector silhouettes + gradient sky + particle embers.
  Painterly *feel* via shape + gradient, not via raster textures.
- Crisp at any DPI/resolution for free (SVG `viewBox`), trivially responsive.

---

## 7. Coaching value (why this belongs in WC3 Coach)

Maps to real ladder mechanics and the project's **working loop** (5 games →
analyze → 5–10 min targeted drills):

- **Reaction (`reactionMs`)** → how fast you acquire and act on a new threat.
- **Precision (`accuracy`)** → clicking the right small target under pressure.
- **Throughput (`apm`/`epm`)** → sustaining meaningful actions, not spam.
- **Prioritization** (Swift > Standard, never click Ward) → focus-firing the
  correct unit instead of the nearest one.

Sessions persist as `DrillResult` → `apm_sessions`, feeding the same history/
trend surfaces as the hotkey drills. The analyzer can later recommend this drill
when a replay shows slow reactions or low effective-action density.

---

## 8. Milestones (incremental — each independently demoable)

- **M1 — Engine core.** `ClickEngine` + `spawner` + `types`: spawn, lifecycle,
  unleash/escape, hit-test, combo. Injected clock + seeded RNG. Vitest golden
  tests (spawn schedule, hit-test priority, points curve, combo/escape, miss
  detection). *Demoable with debug rectangles on a bare SVG.*
- **M2 — Scoring + results.** `scoring.ts` + `DrillResult` mapping + a results
  screen (points, max combo, reaction, accuracy, 0–1000 score).
- **M3 — SVG renderer.** `SvgStage` scaffold + node pools + rAF loop + pointer
  mapping; rifts as real sigils with the size/age visuals at a **measured 60fps**
  (profile early).
- **M4 — Juice pass.** Hitstop, spark bursts, score popups, combo punch,
  screenshake, escape sting. `prefers-reduced-motion` honored.
- **M5 — Battlefield background.** Parallax vector layers + ember particles +
  combo-reactive intensity.
- **M6 — Ramp, kinds, persistence.** Difficulty curve, Swift/Brute/Ward,
  `apm_sessions` real persistence (promotes T4.6).
- **M7 — Polish + perf gate.** Frame-time budget verified on the target machine,
  accessibility, audio (optional), tuning pass on all constants.

Route lands at **`/trainer/clicker`**, linked from the existing Trainer nav.

---

## 9. Risks & open questions

- **SVG node budget.** Stay within ~12 rifts + a few hundred pooled particles;
  if a juice idea needs thousands of particles, fake it with a few larger
  animated shapes rather than raising node count. Profile at M3, not at the end.
- **Per-frame filters / geometry attrs** are the two SVG perf traps — banned in
  the moving layers by design (section 4.2/4.1).
- **Next.js/SSR.** The rAF loop and refs are client-only (`'use client'`); the
  SVG scaffold itself can still server-render fine.
- **Reduced motion.** Screenshake/flash must degrade gracefully.
- **Audio assets.** Synthesize via WebAudio to stay dependency- and asset-free,
  or defer audio entirely (M7).
- **Tuning is the real work.** All the numbers in §2 are starting points; the
  game lives or dies on the feel pass once it's clickable.

---

## 10. Definition of done (per project conventions)

- Complies with the principles (esp. #1 — this is an offline drill, no live-game
  interaction whatsoever).
- Engine/scoring covered by deterministic vitest tests (fake clock + fixed seed),
  matching the existing trainer's test discipline.
- Emits canonical `DrillResult`; any new shared field added in
  `packages/shared-types`, not duplicated.
- Holds 60fps on the target machine with a documented frame-time measurement.
- `docs/` updated; route wired into the Trainer nav.
