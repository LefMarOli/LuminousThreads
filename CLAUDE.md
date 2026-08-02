# LuminousThreads

Audio-reactive generative art piece: a vertical "light strand" visualization
built with p5.js v2 + TypeScript + WebGL2, bundled with Vite.

## Architecture

- `src/sketch.ts` — entry point. p5 instance-mode bootstrap
  (`new p5((p) => {...})`); key bindings: `f` fullscreen, `w` wireframe
  debug overlay, `m` toggles the controls panel.
- `src/strand.ts` / `src/strandGrid.ts` — per-strand CPU-side state
  (position, mode/travel, hue). Authoritative source of vertex data;
  drawing itself doesn't live here.
- `src/gl/` — WebGL2 renderer:
  - `renderer.ts` — draw orchestration (mesh draw + feedback buffer + optional wireframe overlay)
  - `strandMesh.ts` — thick-line-as-triangle-mesh tessellation
  - `feedbackBuffer.ts` — ping-pong float FBO trail/fade effect
  - `shaders/` — GLSL sources
  - `glContext.ts` / `orthoProjection.ts` — context acquisition + projection setup
- `src/effects/` — procedural motion (simplex noise warp, spring/stiffness
  restoring force).
- `src/audio/` — audio-reactive pipeline (FFT/beat detection). Currently
  **disabled** via `AUDIO_ENABLED = false` in `sketch.ts` — not wired to
  any rendering yet, and its energy-value bounds need retuning against
  real input. `src/audio/p5Sound.ts` holds typed wrapper functions for
  p5.sound's untyped `FFT`/`AudioIn`/`loadSound`/`userStartAudio` API
  (p5.sound ships zero TypeScript types).
- `src/ui/controlsPanel.ts` — generic DOM-based labeled-slider panel,
  toggled by `m`. Currently one slider (trail length).
- `docs/performance-tier1-webgl-proposal.md` — design/history doc for the
  WebGL rendering port (why it happened, measured results).

## Conventions

- No UI framework — plain DOM elements for the controls panel, no React/etc.
- p5 is used only as a canvas/context bootstrap; all actual drawing bypasses
  p5's own 2D/WEBGL drawing API via the raw `drawingContext` escape hatch
  (`gl.*` calls directly against the real WebGL2 context).
- Keep `npm run typecheck`, `npm run lint`, `npm run format`, and
  `npm run build` clean at all times.

## Working branch

Active development happens on `typescript-migration`, not yet merged into
`main` — check `git branch`/`git log` before assuming `main` reflects
current work.
