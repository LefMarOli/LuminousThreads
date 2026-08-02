import type { Strand } from "../strand";

// position (vec2) + cross-line coordinate (-1 at the left rail to +1 at the
// right rail, drives the fragment shader's glow falloff) + final RGB +
// alpha (already resolved to real per-vertex values on the CPU - see
// Strand#getVertexColor - not something the GPU interpolates from raw hue
// endpoints, since hue is cyclic and a naive linear interpolation between
// two vertices can take the wrong way around the color wheel; RGB has no
// such wraparound).
const FLOATS_PER_VERTEX = 7;

// Thick-line-as-triangle-mesh: each of a strand's centerline vertices gets
// two side-vertices (offset by the per-vertex normal), so N centerline
// points become a 2N-vertex strip. Per-vertex normals use the averaged
// tangent (central difference) - a standard approximation, not a true
// miter join. Verified via the wireframe view (toggle with 'w') that this
// doesn't visibly bulge/overlap at the curvature this app's noise-warped
// strands actually produce.
export class StrandMesh {
  readonly vertexData: Float32Array;
  readonly indexData: Uint32Array;
  readonly wireframeIndexData: Uint32Array;
  readonly indexCount: number;
  readonly wireframeIndexCount: number;

  #numStrands: number;
  #interpolationPoints: number;
  #halfWidth: number;

  constructor(
    numStrands: number,
    interpolationPoints: number,
    halfWidth: number,
  ) {
    this.#numStrands = numStrands;
    this.#interpolationPoints = interpolationPoints;
    this.#halfWidth = halfWidth;

    const vertsPerStrand = interpolationPoints * 2;
    this.vertexData = new Float32Array(
      numStrands * vertsPerStrand * FLOATS_PER_VERTEX,
    );

    const segmentsPerStrand = interpolationPoints - 1;
    const trianglesPerStrand = segmentsPerStrand * 2;
    this.indexData = new Uint32Array(numStrands * trianglesPerStrand * 3);
    this.indexCount = this.indexData.length;

    // 3 edges/triangle * 2 indices/edge, but the two triangles in a quad
    // share one edge - de-duplicated below so the diagonal isn't drawn
    // twice in wireframe view.
    this.wireframeIndexData = new Uint32Array(
      numStrands * segmentsPerStrand * 8,
    );
    this.wireframeIndexCount = this.wireframeIndexData.length;

    this.#buildIndices();
  }

  #buildIndices(): void {
    const vertsPerStrand = this.#interpolationPoints * 2;
    let o = 0;
    let w = 0;

    for (let s = 0; s < this.#numStrands; s++) {
      const base = s * vertsPerStrand;
      for (let i = 0; i < this.#interpolationPoints - 1; i++) {
        const left0 = base + i * 2;
        const right0 = left0 + 1;
        const left1 = left0 + 2;
        const right1 = left0 + 3;

        this.indexData[o++] = left0;
        this.indexData[o++] = right0;
        this.indexData[o++] = left1;

        this.indexData[o++] = right0;
        this.indexData[o++] = right1;
        this.indexData[o++] = left1;

        // Quad outline (4 edges) - left0-right0, right0-right1, right1-left1,
        // left1-left0. Skips the left0-right1/right0-left1 diagonal on
        // purpose (that's the shared edge between the two fill triangles,
        // not a mesh boundary).
        this.wireframeIndexData[w++] = left0;
        this.wireframeIndexData[w++] = right0;
        this.wireframeIndexData[w++] = right0;
        this.wireframeIndexData[w++] = right1;
        this.wireframeIndexData[w++] = right1;
        this.wireframeIndexData[w++] = left1;
        this.wireframeIndexData[w++] = left1;
        this.wireframeIndexData[w++] = left0;
      }
    }
  }

  update(strands: readonly Strand[]): void {
    const vertsPerStrand = this.#interpolationPoints * 2;
    const lastIndex = this.#interpolationPoints - 1;

    for (let s = 0; s < strands.length; s++) {
      const vertices = strands[s].vertices;
      const strandBase = s * vertsPerStrand * FLOATS_PER_VERTEX;

      for (let i = 0; i <= lastIndex; i++) {
        const prev = vertices[Math.max(0, i - 1)];
        const next = vertices[Math.min(lastIndex, i + 1)];
        const curr = vertices[i];

        let tx = next.x - prev.x;
        let ty = next.y - prev.y;
        const len = Math.hypot(tx, ty) || 1;
        tx /= len;
        ty /= len;

        // Normal = tangent rotated 90 degrees.
        const nx = -ty * this.#halfWidth;
        const ny = tx * this.#halfWidth;

        const [r, g, b, alpha] = strands[s].getVertexColor(i);

        const o = strandBase + i * 2 * FLOATS_PER_VERTEX;
        this.vertexData[o + 0] = curr.x + nx;
        this.vertexData[o + 1] = curr.y + ny;
        this.vertexData[o + 2] = -1;
        this.vertexData[o + 3] = r;
        this.vertexData[o + 4] = g;
        this.vertexData[o + 5] = b;
        this.vertexData[o + 6] = alpha;
        this.vertexData[o + 7] = curr.x - nx;
        this.vertexData[o + 8] = curr.y - ny;
        this.vertexData[o + 9] = 1;
        this.vertexData[o + 10] = r;
        this.vertexData[o + 11] = g;
        this.vertexData[o + 12] = b;
        this.vertexData[o + 13] = alpha;
      }
    }
  }
}

export { FLOATS_PER_VERTEX };
