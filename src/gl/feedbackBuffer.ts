import { linkProgram } from "./glContext";
import {
  fullscreenVertexSource,
  decayFragmentSource,
  blitFragmentSource,
} from "./shaders/feedbackShaders";

// Ping-pong pair of offscreen render targets holding the accumulated trail.
// Each frame: decay the buffer holding the last completed frame into the
// other one (beginFrame), the caller then draws this frame's strands on
// top of that same target, then blitToScreen() copies it to the visible
// canvas. Replaces the old background(0,0,0,alpha) percentage fade.
export class FeedbackBuffer {
  #gl: WebGL2RenderingContext;
  #useFloat: boolean;
  #textures: [WebGLTexture, WebGLTexture];
  #fbos: [WebGLFramebuffer, WebGLFramebuffer];
  #currentIndex = 0;
  #width = 0;
  #height = 0;
  #decayProgram: WebGLProgram;
  #blitProgram: WebGLProgram;
  #emptyVao: WebGLVertexArrayObject;
  #decayAmountLoc: WebGLUniformLocation;
  #decayTextureLoc: WebGLUniformLocation;
  #blitTextureLoc: WebGLUniformLocation;

  constructor(
    gl: WebGL2RenderingContext,
    useFloat: boolean,
    width: number,
    height: number,
  ) {
    this.#gl = gl;
    this.#useFloat = useFloat;

    this.#decayProgram = linkProgram(
      gl,
      fullscreenVertexSource,
      decayFragmentSource,
    );
    this.#blitProgram = linkProgram(
      gl,
      fullscreenVertexSource,
      blitFragmentSource,
    );

    const emptyVao = gl.createVertexArray();
    if (!emptyVao) throw new Error("gl.createVertexArray returned null");
    this.#emptyVao = emptyVao;

    const decayAmountLoc = gl.getUniformLocation(
      this.#decayProgram,
      "uDecayAmount",
    );
    if (!decayAmountLoc) throw new Error("uDecayAmount uniform not found");
    this.#decayAmountLoc = decayAmountLoc;

    const decayTextureLoc = gl.getUniformLocation(
      this.#decayProgram,
      "uPrevFrame",
    );
    if (!decayTextureLoc) throw new Error("uPrevFrame uniform not found");
    this.#decayTextureLoc = decayTextureLoc;

    const blitTextureLoc = gl.getUniformLocation(this.#blitProgram, "uTexture");
    if (!blitTextureLoc) throw new Error("uTexture uniform not found");
    this.#blitTextureLoc = blitTextureLoc;

    this.#textures = [this.#createTexture(), this.#createTexture()];
    this.#fbos = [
      this.#createFbo(this.#textures[0]),
      this.#createFbo(this.#textures[1]),
    ];

    this.resize(width, height);
  }

  #createTexture(): WebGLTexture {
    const gl = this.#gl;
    const texture = gl.createTexture();
    if (!texture) throw new Error("gl.createTexture returned null");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  #createFbo(texture: WebGLTexture): WebGLFramebuffer {
    const gl = this.#gl;
    const fbo = gl.createFramebuffer();
    if (!fbo) throw new Error("gl.createFramebuffer returned null");
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return fbo;
  }

  resize(width: number, height: number): void {
    const gl = this.#gl;
    this.#width = width;
    this.#height = height;

    const internalFormat = this.#useFloat ? gl.RGBA16F : gl.RGBA8;
    const type = this.#useFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

    for (const texture of this.#textures) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        internalFormat,
        width,
        height,
        0,
        gl.RGBA,
        type,
        null,
      );
    }
    gl.bindTexture(gl.TEXTURE_2D, null);

    // A resize means the strand grid itself gets rebuilt from scratch (see
    // StrandGrid recreation in sketch.ts's windowResized()), so there's no
    // "old trail" worth preserving across a resize anyway - clear both
    // buffers rather than leaving stale/undefined texture memory at the
    // new size.
    for (const fbo of this.#fbos) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.#currentIndex = 0;
  }

  // Runs the decay pass and leaves the destination FBO bound - the caller
  // (Renderer) draws this frame's strands directly on top of it next, with
  // blending enabled, before calling blitToScreen().
  beginFrame(decayAmount: number): void {
    const gl = this.#gl;
    const nextIndex = this.#currentIndex === 0 ? 1 : 0;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.#fbos[nextIndex]);
    gl.viewport(0, 0, this.#width, this.#height);

    gl.disable(gl.BLEND);
    gl.useProgram(this.#decayProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.#textures[this.#currentIndex]);
    gl.uniform1i(this.#decayTextureLoc, 0);
    gl.uniform1f(this.#decayAmountLoc, decayAmount);
    gl.bindVertexArray(this.#emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    this.#currentIndex = nextIndex;
  }

  blitToScreen(): void {
    const gl = this.#gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

    gl.disable(gl.BLEND);
    gl.useProgram(this.#blitProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.#textures[this.#currentIndex]);
    gl.uniform1i(this.#blitTextureLoc, 0);
    gl.bindVertexArray(this.#emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }
}
