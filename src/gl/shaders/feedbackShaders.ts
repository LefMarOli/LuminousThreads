// Fullscreen-triangle trick: 3 vertices derived purely from gl_VertexID, no
// vertex buffer needed. Covers NDC (-1,-1) to (3,3), which clips down to
// exactly the viewport - the standard way to run a per-pixel shader pass
// without any actual geometry.
export const fullscreenVertexSource = /* glsl */ `#version 300 es

out vec2 vUv;

void main() {
  vec2 pos = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = pos;
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
}
`;

// Subtracts a fixed amount (not a percentage) from the previous frame,
// clamped at zero - the fix for the trail-residue problem a percentage
// fade couldn't solve: percentage decay only removes a fixed *fraction* of
// whatever's there, so a dim residual glow in an area of little movement
// never fully clears in absolute terms. On a float/half-float target this
// converges to exactly zero with no rounding-driven flicker (the 'difference'
// blend-mode approach tried on Canvas2D reflected instead of clamping for
// values below the decay amount - verified directly to cause a real 30Hz
// flicker; max()-based clamping here has no such reflection).
export const decayFragmentSource = /* glsl */ `#version 300 es
precision highp float;

in vec2 vUv;

uniform sampler2D uPrevFrame;
uniform float uDecayAmount;

out vec4 fragColor;

void main() {
  vec4 prev = texture(uPrevFrame, vUv);
  fragColor = max(prev - vec4(uDecayAmount), 0.0);
}
`;

export const blitFragmentSource = /* glsl */ `#version 300 es
precision highp float;

in vec2 vUv;

uniform sampler2D uTexture;

out vec4 fragColor;

void main() {
  // The trail buffer's alpha is ~0 wherever nothing has been drawn recently
  // (background, fully decayed areas) - the canvas itself is created with
  // alpha:true (p5's default), so carrying that alpha straight through to
  // the default framebuffer made the *canvas element* transparent there,
  // letting the page's white background show through instead of black.
  // rgb is already the correct premultiplied color (0 for background), so
  // forcing full opacity here is the fix, not a workaround.
  vec4 c = texture(uTexture, vUv);
  fragColor = vec4(c.rgb, 1.0);
}
`;
