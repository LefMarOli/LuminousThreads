export const strandVertexSource = /* glsl */ `#version 300 es

layout(location = 0) in vec2 aPosition;
layout(location = 1) in float aCross;
layout(location = 2) in vec3 aColor;
layout(location = 3) in float aAlpha;

uniform mat4 uProjection;

out float vCross;
out vec3 vColor;
out float vAlpha;

void main() {
  vCross = aCross;
  vColor = aColor;
  vAlpha = aAlpha;
  gl_Position = uProjection * vec4(aPosition, 0.0, 1.0);
}
`;

export const strandFragmentSource = /* glsl */ `#version 300 es
precision highp float;

in float vCross;
in vec3 vColor;
in float vAlpha;

out vec4 fragColor;

void main() {
  // Continuous glow falloff from the centerline (vCross = 0) to the mesh
  // edge (vCross = +/-1) - replaces the old 2-3 discrete stroke-width
  // passes with one smooth core-to-edge curve.
  float d = abs(vCross);
  float falloff = pow(smoothstep(1.0, 0.0, d), 2.0);

  // vColor is already final RGB (converted from HSB on the CPU - see
  // Strand#getVertexColor/hsbToRgb) rather than an interpolated hue angle.
  // Hue is cyclic, so linearly interpolating the raw hue number between
  // two mesh vertices could take the wrong way around the color wheel at
  // a 360-degree wraparound; RGB has no such discontinuity.
  float a = vAlpha * falloff;

  // Premultiplied output - paired with gl.blendFunc(ONE, ONE_MINUS_SRC_ALPHA)
  // in the renderer, the closest match to the old Canvas2D source-over look.
  fragColor = vec4(vColor * a, a);
}
`;

// Reuses the same vertex shader (position/aCross are identical) with a
// distinct solid color, so the mesh outline reads clearly against the
// filled/glowing strand for the Stage 1 joint-artifact check ('w' toggle).
export const wireframeFragmentSource = /* glsl */ `#version 300 es
precision highp float;

out vec4 fragColor;

void main() {
  fragColor = vec4(0.0, 1.0, 0.3, 1.0);
}
`;
