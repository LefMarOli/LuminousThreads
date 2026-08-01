# Proposal: WebGL renderer (Tier 1 performance work)

## Status

Not started. This document records the current measurement and the
reasoning behind whether it's worth doing — implementation has not begun.

## Background

Rendering in `Strand.draw()` currently goes through the Canvas 2D API
directly (bypassing p5's `stroke()`/`line()` wrappers — see the "Tier 0"
rewrite already in place): each strand builds two `CanvasGradient` objects
and strokes one continuous path once per gradient. This already replaced an
earlier per-segment approach (~300 draw calls/strand) and fixed a rendering
seam artifact in the process.

"Tier 1" refers to going a step further: replacing the Canvas 2D draw calls
with a WebGL renderer that batches every strand's geometry into one (or a
few) GPU buffers and draws the whole grid in a small, fixed number of draw
calls, doing the per-vertex color math in a shader instead of JavaScript.

## Measured current cost

Profiled directly (wrapping the real `CanvasRenderingContext2D`/
`CanvasGradient` prototype methods and timing `move()`/`draw()` in
isolation) at a realistic window size — 94 strands, 1728×1080 — with audio
disabled:

Total: **~23.4ms/frame** (~43fps synthetic; the on-screen target is 60fps).

| Bucket | ms/frame | % of frame |
|---|---:|---:|
| `move()` — bezier curve rebuild (control points → 150 vertices/strand) | 5.5 | 23.5% |
| `move()` — noise/stiffness effects | 0.4 | 1.6% |
| `draw()` — per-vertex math + `rgba(...)` color-string building | 8.8 | 37.8% |
| `draw()` — canvas API calls (`addColorStop` alone is 5.65ms; rest is `lineTo`/`stroke`) | 7.75 | 33.1% |
| `draw()` — misc per-strand overhead | 0.75 | 3.2% |

`addColorStop` is the single biggest canvas-API cost: each strand calls it
300 times/frame (150 vertices × 2 gradients) × 94 strands = 28,200 calls/frame.

## What Tier 1 would and wouldn't fix

**Would largely eliminate:**
- The canvas-API bucket (33.1%) — one GPU buffer upload + a handful of draw
  calls replaces tens of thousands of `addColorStop`/`lineTo`/`stroke` calls.
- A meaningful chunk of the color-math bucket (37.8%) — writing raw
  hue/alpha/brightness floats into a vertex buffer avoids building and then
  re-parsing `"rgba(r, g, b, a)"` strings entirely; the HSB→RGB conversion
  itself could move into the fragment shader.

**Would not touch:**
- The bezier curve rebuild (23.5%) — this is CPU-side geometry (control
  points → interpolated vertex positions) that has to happen regardless of
  which renderer draws the result. A WebGL rewrite doesn't remove this cost;
  it would need a separate change (fewer interpolation points, incremental
  rebuilds, or moving the curve evaluation itself onto the GPU) to address.

**Rough net effect:** reclaiming roughly 45–55% of current frame time,
i.e. ~23ms/frame down to somewhere around ~11–13ms/frame. In practice this
mostly buys back headroom against the 60fps target (and room for more
strands) rather than an uncapped frame-rate win, since `frameRate(60)` is
already the ceiling.

## Implementation cost / risk

WebGL has no native variable-width, round-capped stroke primitive. The
current look — a 6px glow stroke plus a 2px sharp stroke, both with round
caps and joins — has no equivalent to `ctx.lineWidth` + `lineCap: 'round'`
in WebGL. Reproducing it requires manually tessellating each strand into a
triangle strip (a "thick line" mesh) per frame, which is a real rendering
technique to implement and verify pixel-for-pixel against the current
output, not a mechanical swap of API calls. Rough estimate: a solid day of
focused work, plus verification against the existing visual output (color
gradient behavior, glow blending, no new seam artifacts).

## Recommendation

Worth doing if the goal is comfortable 60fps headroom or a higher strand
count. Not a blocker for current visual-refinement work — the app already
runs acceptably at today's density. Pair it with addressing the bezier
rebuild cost (23.5%, untouched by this change) for a bigger combined win
rather than treating Tier 1 alone as the finish line.
