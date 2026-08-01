export interface GlCapabilities {
  hasFloatColorBuffer: boolean;
}

export interface GlAcquisition {
  gl: WebGL2RenderingContext;
  capabilities: GlCapabilities;
}

// p5's `drawingContext` is whatever context type createCanvas() requested -
// WebGL2RenderingContext here since sketch.ts passes the WEBGL mode flag.
// This is the same "grab the raw context and bypass p5's own drawing API"
// pattern already established for Canvas2D in strand.ts, just for gl.* calls
// instead of ctx.* calls.
export function acquireGlContext(): GlAcquisition {
  const ctx = drawingContext;
  if (!(ctx instanceof WebGL2RenderingContext)) {
    throw new Error(
      "Expected drawingContext to be a WebGL2RenderingContext - was createCanvas() called with the WEBGL mode flag?",
    );
  }

  // EXT_color_buffer_float is what makes RGBA16F/RGBA32F renderable as FBO
  // color attachments in WebGL2 (there's no separate half-float-only
  // extension the way WebGL1 needed EXT_color_buffer_half_float). Detected
  // once here so the feedback buffer can pick RGBA16F vs an RGBA8 fallback.
  const hasFloatColorBuffer =
    ctx.getExtension("EXT_color_buffer_float") !== null;

  return { gl: ctx, capabilities: { hasFloatColorBuffer } };
}

export function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("gl.createShader returned null");

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${info}`);
  }

  return shader;
}

export function linkProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

  const program = gl.createProgram();
  if (!program) throw new Error("gl.createProgram returned null");

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  // Shaders are flagged for deletion here but only actually freed once
  // detached from the program (which linkProgram already did via
  // attachShader) - deleting after link, not before, avoids invalidating
  // the link.
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link failed: ${info}`);
  }

  return program;
}
