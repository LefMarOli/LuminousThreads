# Proposal: WebGL renderer (Tier 1 performance work)

## Status

Not started. This document records the current measurement and the
reasoning behind whether it's worth doing — implementation has not begun.

**Update:** a cheaper, lower-risk fix (gradient color-stop sampling —
see below) landed first and shrank the addressable baseline
significantly. The original measurement is kept below for context, but
the "What Tier 1 would fix" and "Recommendation" sections have been
revised against the new, post-fix numbers.

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

| Bucket                                                                                  | ms/frame | % of frame |
| --------------------------------------------------------------------------------------- | -------: | ---------: |
| `move()` — bezier curve rebuild (control points → 150 vertices/strand)                  |      5.5 |      23.5% |
| `move()` — noise/stiffness effects                                                      |      0.4 |       1.6% |
| `draw()` — per-vertex math + `rgba(...)` color-string building                          |      8.8 |      37.8% |
| `draw()` — canvas API calls (`addColorStop` alone is 5.65ms; rest is `lineTo`/`stroke`) |     7.75 |      33.1% |
| `draw()` — misc per-strand overhead                                                     |     0.75 |       3.2% |

`addColorStop` is the single biggest canvas-API cost: each strand calls it
300 times/frame (150 vertices × 2 gradients) × 94 strands = 28,200 calls/frame.

## Update: gradient stop sampling fix (new baseline)

The two-pass glow/sharp stroke technique doesn't need a color stop per
vertex — a `CanvasGradient` linearly interpolates between stops, and the
underlying color signal (hue drift + the fade envelope + warp-driven
brightness) is smooth and low-frequency. 150 stops was oversampling it far
beyond what's visible. `Strand.draw()` now keeps full 150-vertex resolution
for the path geometry (`moveTo`/`lineTo`, so the curve shape is unaffected)
but samples color at a fixed target of ~20 stops per gradient instead of
150 — same 2 `stroke()` calls, same visual result, verified with no
visible banding.

Re-measured with the same method, same conditions (94 strands, 1728×1080):

Total: **~13.2ms/frame** (~76fps synthetic), down from ~23.4ms/frame — a
**~44% reduction**, entirely from this one change.

| Metric                     | Before |  After |
| -------------------------- | -----: | -----: |
| `addColorStop` calls/frame | 28,200 |  3,760 |
| `addColorStop` ms/frame    |   5.65 |   0.80 |
| Total canvas-API ms/frame  |   7.75 |   2.82 |
| Total frame time           | 23.4ms | 13.2ms |

The per-vertex math and color-string building (previously 8.8ms/frame) also
dropped substantially since it now only runs for the ~20 sampled stops per
gradient instead of all 150 vertices, though this wasn't re-profiled at the
same fine grain as the canvas-API numbers above.

**This changes Tier 1's math.** The bezier curve rebuild (5.5ms) — which
Tier 1 cannot touch — didn't shrink, so it's now proportionally the
_largest_ single remaining cost (~42% of the new 13.2ms total, up from
23.5% of the old 23.4ms total). Meanwhile the canvas-API cost Tier 1 would
eliminate has already dropped from 7.75ms to 2.82ms, most of that gap
already closed by this fix.

## What Tier 1 would and wouldn't fix (revised against new baseline)

**Would largely eliminate:**

- The remaining canvas-API cost (~2.8ms/frame, ~21% of the new total) — one
  GPU buffer upload + a handful of draw calls instead of ~4,000
  `addColorStop`/`lineTo`/`stroke` calls.
- Some remaining color-string-building cost — writing raw hue/alpha/
  brightness floats into a vertex buffer avoids `rgba(...)` string
  construction; the HSB→RGB conversion could move into the fragment shader.

**Would not touch:**

- The bezier curve rebuild (~5.5ms/frame, now ~42% of the frame) — CPU-side
  geometry that has to happen regardless of renderer. This is now the
  dominant cost, and a WebGL rewrite does nothing for it; it would need
  fewer interpolation points, incremental rebuilds, or moving curve
  evaluation onto the GPU.

**Rough net effect now:** reclaiming maybe 15–25% of the _new_ 13.2ms
total (down from the 45–55% estimated against the old baseline) — a
meaningfully smaller win than before this fix landed, because the cheap
fix already captured most of what was easy to capture.

## Implementation cost / risk

WebGL has no native variable-width, round-capped stroke primitive. The
current look — a 6px glow stroke plus a 2px sharp stroke, both with round
caps and joins — has no equivalent to `ctx.lineWidth` + `lineCap: 'round'`
in WebGL. Reproducing it requires manually tessellating each strand into a
triangle strip (a "thick line" mesh) per frame, which is a real rendering
technique to implement and verify pixel-for-pixel against the current
output, not a mechanical swap of API calls. Rough estimate: a solid day of
focused work, plus verification against the existing visual output (color
gradient behavior, glow blending, no new seam artifacts) — unchanged by
the baseline shift above.

## Recommendation

Lower priority than before this fix landed: Tier 1's addressable cost
shrank from 33% of the frame to ~21%, while its implementation cost (a
solid day, plus the thick-line tessellation risk) didn't change. If more
performance is wanted next, the bezier curve rebuild — now the single
largest remaining cost and untouched by Tier 1 — is the higher-leverage
target. Not a blocker for current visual-refinement work either way.
