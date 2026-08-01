// Maps top-left-origin, Y-down pixel space (the convention already used by
// Point/BezierCurve/StrandGrid) directly to WebGL clip space, instead of
// adopting p5's own WEBGL-mode center-origin/Y-up camera - we bypass p5's
// camera entirely (see glContext.ts), so this is the only projection that
// exists for our draw calls. Column-major, as gl.uniformMatrix4fv expects.
export function createOrthoProjection(
  width: number,
  height: number,
): Float32Array {
  return new Float32Array([
    2 / width,
    0,
    0,
    0,
    0,
    -2 / height,
    0,
    0,
    0,
    0,
    1,
    0,
    -1,
    1,
    0,
    1,
  ]);
}
