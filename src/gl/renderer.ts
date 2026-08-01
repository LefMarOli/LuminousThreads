import type { StrandGrid } from "../strandGrid";
import { linkProgram } from "./glContext";
import { createOrthoProjection } from "./orthoProjection";
import { StrandMesh, FLOATS_PER_VERTEX } from "./strandMesh";
import { FeedbackBuffer } from "./feedbackBuffer";
import {
  strandVertexSource,
  strandFragmentSource,
  wireframeFragmentSource,
} from "./shaders/strandShader";

// Matches the ~6px total width of the old glow stroke as a starting
// reference point - not tuned further yet.
const STRAND_HALF_WIDTH = 3;

// Normalized (0-1 texture value) brightness subtracted from the trail
// buffer every frame. Chosen to land in the same ballpark as the trail
// length the old background(0,0,0,0.06) gave a bright pixel (~4/255 in the
// equivalent 8-bit terms) - verified directly (pixel-tracing across many
// frames) to converge to exactly zero with no residual tint or flicker,
// which was the whole point of this rewrite.
const TRAIL_DECAY_AMOUNT = 4 / 255;

export class Renderer {
  #gl: WebGL2RenderingContext;
  #program: WebGLProgram;
  #wireframeProgram: WebGLProgram;
  #vao: WebGLVertexArrayObject;
  #vbo: WebGLBuffer;
  #ibo: WebGLBuffer;
  #wireframeIbo: WebGLBuffer;
  #projectionLoc: WebGLUniformLocation;
  #wireframeProjectionLoc: WebGLUniformLocation;
  #mesh!: StrandMesh;
  #projection!: Float32Array;
  #wireframeEnabled = false;
  #feedbackBuffer: FeedbackBuffer;

  constructor(
    gl: WebGL2RenderingContext,
    width: number,
    height: number,
    strandGrid: StrandGrid,
    hasFloatColorBuffer: boolean,
  ) {
    this.#gl = gl;
    this.#program = linkProgram(gl, strandVertexSource, strandFragmentSource);
    this.#wireframeProgram = linkProgram(
      gl,
      strandVertexSource,
      wireframeFragmentSource,
    );

    const vao = gl.createVertexArray();
    if (!vao) throw new Error("gl.createVertexArray returned null");
    this.#vao = vao;

    const vbo = gl.createBuffer();
    if (!vbo) throw new Error("gl.createBuffer returned null (vbo)");
    this.#vbo = vbo;

    const ibo = gl.createBuffer();
    if (!ibo) throw new Error("gl.createBuffer returned null (ibo)");
    this.#ibo = ibo;

    const wireframeIbo = gl.createBuffer();
    if (!wireframeIbo)
      throw new Error("gl.createBuffer returned null (wireframeIbo)");
    this.#wireframeIbo = wireframeIbo;

    const projectionLoc = gl.getUniformLocation(this.#program, "uProjection");
    if (!projectionLoc) throw new Error("uProjection uniform not found");
    this.#projectionLoc = projectionLoc;

    const wireframeProjectionLoc = gl.getUniformLocation(
      this.#wireframeProgram,
      "uProjection",
    );
    if (!wireframeProjectionLoc)
      throw new Error("uProjection uniform not found (wireframe)");
    this.#wireframeProjectionLoc = wireframeProjectionLoc;

    this.#feedbackBuffer = new FeedbackBuffer(
      gl,
      hasFloatColorBuffer,
      gl.drawingBufferWidth,
      gl.drawingBufferHeight,
    );

    this.#buildMeshAndBuffers(strandGrid);
    this.#projection = createOrthoProjection(width, height);
  }

  #buildMeshAndBuffers(strandGrid: StrandGrid): void {
    const gl = this.#gl;
    this.#mesh = new StrandMesh(
      strandGrid.numStrands,
      strandGrid.strands[0].interpolationPoints,
      STRAND_HALF_WIDTH,
    );

    gl.bindVertexArray(this.#vao);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.#vbo);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      this.#mesh.vertexData.byteLength,
      gl.DYNAMIC_DRAW,
    );

    const stride = FLOATS_PER_VERTEX * 4;
    gl.enableVertexAttribArray(0); // aPosition
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1); // aCross
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, stride, 2 * 4);
    gl.enableVertexAttribArray(2); // aColor
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 3 * 4);
    gl.enableVertexAttribArray(3); // aAlpha
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 6 * 4);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.#ibo);
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      this.#mesh.indexData,
      gl.STATIC_DRAW,
    );

    gl.bindVertexArray(null);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.#wireframeIbo);
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      this.#mesh.wireframeIndexData,
      gl.STATIC_DRAW,
    );
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
  }

  toggleWireframe(): void {
    this.#wireframeEnabled = !this.#wireframeEnabled;
  }

  resize(width: number, height: number, strandGrid: StrandGrid): void {
    this.#buildMeshAndBuffers(strandGrid);
    this.#projection = createOrthoProjection(width, height);
    this.#feedbackBuffer.resize(
      this.#gl.drawingBufferWidth,
      this.#gl.drawingBufferHeight,
    );
  }

  render(strandGrid: StrandGrid): void {
    const gl = this.#gl;
    this.#mesh.update(strandGrid.strands);

    gl.bindVertexArray(this.#vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.#mesh.vertexData);

    // Runs the decay pass and leaves its destination FBO bound - strands
    // draw directly on top of that same target next. This also rebinds
    // the *default* VAO internally (its own fullscreen-triangle pass needs
    // no vertex attributes), so the strand mesh's VAO must be rebound
    // afterward - a real bug caught here on first run: without this, the
    // strand draw call below silently used the feedback buffer's empty
    // VAO instead, rendering nothing.
    this.#feedbackBuffer.beginFrame(TRAIL_DECAY_AMOUNT);
    gl.bindVertexArray(this.#vao);

    // Fragment shader outputs premultiplied color (rgb*a, a) - paired with
    // this blend func, the closest match to the old Canvas2D source-over
    // look (a straight-alpha ONE/ONE_MINUS_SRC_ALPHA blend would double up
    // the alpha term).
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(this.#program);
    gl.uniformMatrix4fv(this.#projectionLoc, false, this.#projection);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.#ibo);
    gl.drawElements(gl.TRIANGLES, this.#mesh.indexCount, gl.UNSIGNED_INT, 0);

    this.#feedbackBuffer.blitToScreen();

    // Wireframe debug overlay is drawn straight onto the visible canvas,
    // after the blit, rather than into the trail buffer - it's a debug aid
    // for the current frame's mesh, not something that should itself leave
    // a fading trail.
    if (this.#wireframeEnabled) {
      // blitToScreen() also rebinds its own empty VAO internally - same
      // rebind needed here as after beginFrame() above.
      gl.bindVertexArray(this.#vao);
      gl.disable(gl.BLEND);
      gl.useProgram(this.#wireframeProgram);
      gl.uniformMatrix4fv(
        this.#wireframeProjectionLoc,
        false,
        this.#projection,
      );
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.#wireframeIbo);
      gl.drawElements(
        gl.LINES,
        this.#mesh.wireframeIndexCount,
        gl.UNSIGNED_INT,
        0,
      );
    }

    gl.bindVertexArray(null);
  }
}
