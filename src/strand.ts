import { Point } from "./point";
import { BezierCurve } from "./bezier/bezierCurve";

// Standard HSB->RGB conversion (h: 0-360, s/b: 0-100), returning r/g/b as
// 0-1 floats for a vertex color attribute. This must run here, on the CPU,
// before the result reaches the GPU - not as a per-fragment conversion of
// an interpolated hue. #segmentHueAlpha's hue is only continuous *before*
// its final `% 360` wrap (needed so the value stays in a sane range); that
// wrap reintroduces a discontinuity in the raw hue number wherever it
// crosses a multiple of 360 (e.g. 359 -> 1 between two adjacent mesh
// vertices as the gradient drifts). Canvas2D never showed this because
// CanvasGradient interpolates the final RGB, not the hue - but uploading
// the wrapped hue itself as a GPU vertex attribute and letting the GPU
// linearly interpolate it between vertices takes the wrong (long) way
// around at that seam, producing a stray-colored band. Converting to RGB
// first sidesteps this entirely: RGB has no cyclic wraparound, so
// interpolating between two vertices' colors is always correct regardless
// of what the underlying hue numbers were.
function hsbToRgb(
  h: number,
  s: number,
  b: number,
): [r: number, g: number, bl: number] {
  s /= 100;
  b /= 100;
  const k = (n: number) => (n + h / 60) % 6;
  const f = (n: number) => b - b * s * Math.max(0, Math.min(k(n), 4 - k(n), 1));
  return [f(5), f(3), f(1)];
}

export class Strand {
  pointsArray: Point[];
  initArray: Point[];
  initX: number;
  #bezierCurve: BezierCurve;
  #interpolationPoints: number;
  #startHue: number;
  #endHue: number;
  #fadePerc = 0.45;
  #colorSpeed: number;
  #minColorSpeed = 0.1;
  #mode: "Normal" | "Entering" | "Exiting" | "NoShow" = "Normal";
  #travelDirection: "Top" | "Bottom" = "Top";
  #travelTrailSize = 40;
  #travelSpeed = 0.01;
  #travelPos!: number;
  #peakProbability = 0.01;
  #enteringProbability = this.#peakProbability;
  #exitingProbability = 0;
  #probabilityPhaseShift = Math.PI / 2;
  #loopDuration: number;
  #loopTimestamp = 0;

  // Exposed for the WebGL mesh tessellator (src/gl/strandMesh.ts), which
  // needs the raw centerline positions to build the thick-line triangle
  // strip - the bezier curve itself stays a private implementation detail.
  get vertices(): readonly Point[] {
    return this.#bezierCurve.vertices;
  }

  get interpolationPoints(): number {
    return this.#interpolationPoints;
  }

  constructor(
    pointsArray: Point[],
    interpolationPoints: number,
    startHue: number,
    endHue: number,
    loopDuration: number,
  ) {
    this.pointsArray = pointsArray.map((p) => new Point(p.x, p.y));
    this.initArray = pointsArray.map((p) => new Point(p.x, p.y));
    this.initX = pointsArray[0].x;
    this.#interpolationPoints = interpolationPoints;
    this.#bezierCurve = new BezierCurve(pointsArray, interpolationPoints);
    this.#startHue = startHue;
    this.#endHue = endHue;
    this.#loopDuration = loopDuration * 1000;
    const n = Math.max(Math.floor(loopDuration * this.#minColorSpeed), 1);
    this.#colorSpeed = (360 * n) / (loopDuration * 1000);

    const travelSpeedFactor = (loopDuration * 90) / (50 * interpolationPoints);
    this.#travelSpeed =
      (loopDuration * interpolationPoints) / (travelSpeedFactor * 1000000);
  }

  // Per-frame CPU state update - mode switching (Normal/Entering/Exiting/
  // NoShow), the travel-reveal position, and hue drift. Used to run inside
  // the old Canvas2D draw() (which also built gradients and stroked the
  // path); now that rendering happens via the WebGL renderer reading
  // vertices/getVertexColor() directly, this is the only per-frame work
  // Strand itself still needs to do.
  update(deltaTime: number): void {
    //this.#switchMode();
    this.#updateTravel(deltaTime);
    this.#updateHue(deltaTime);
  }

  // Per-vertex RGB + alpha for the WebGL mesh tessellator - full
  // 150-vertex resolution now that there's no CanvasGradient/addColorStop
  // cost to avoid (that was the entire reason for the old colorStopStride
  // sampling); per-vertex color is just floats written into a typed array
  // here, no strings, no gradient objects. Profiled directly (Stage 2 of
  // the WebGL port) to confirm full resolution is affordable. Returns
  // final RGB, not hue - see hsbToRgb's comment for why.
  getVertexColor(
    index: number,
  ): [r: number, g: number, b: number, alpha: number] {
    const lastIndex = this.#interpolationPoints - 1;
    const heightPerc = index / lastIndex;
    const [hue, alpha] = this.#segmentHueAlpha(heightPerc);
    const vertex = this.#bezierCurve.vertices[index];
    // #highlightFactor's own clamp keeps this bounded rather than
    // unbounded, but its max (~2x) still overshoots HSB brightness's
    // defined 0-100 domain - clamped here too so a value outside that
    // domain never reaches hsbToRgb, regardless of exactly how large the
    // highlight multiplier gets.
    const brightness = Math.min(
      100 *
        this.#highlightFactor(vertex, vertex) *
        this.#segmentBrightness(index),
      100,
    );
    const [r, g, b] = hsbToRgb(hue, 100, brightness);
    return [r, g, b, alpha];
  }

  #updateHue(deltaTime: number): void {
    this.#startHue += this.#colorSpeed * deltaTime;
    this.#startHue %= 360;
    this.#endHue += this.#colorSpeed * deltaTime;
    this.#endHue %= 360;
  }

  #updateTravel(deltaTime: number): void {
    this.#loopTimestamp += deltaTime;
    this.#loopTimestamp %= this.#loopDuration;

    const animationProgress = this.#loopTimestamp / this.#loopDuration;
    this.#exitingProbability =
      this.#peakProbability * Math.sin(animationProgress * Math.PI);
    this.#enteringProbability =
      this.#peakProbability *
      Math.sin(animationProgress * Math.PI + this.#probabilityPhaseShift);

    if (this.#mode === "Normal" || this.#mode === "NoShow") return;

    if (this.#travelDirection === "Top") {
      this.#travelPos += this.#travelSpeed * deltaTime;
      if (this.#travelPos >= this.#interpolationPoints + this.#travelTrailSize)
        this.#mode = this.#mode === "Entering" ? "Normal" : "NoShow";
    } else if (this.#travelDirection === "Bottom") {
      this.#travelPos -= this.#travelSpeed * deltaTime;
      if (this.#travelPos <= -this.#travelTrailSize)
        this.#mode = this.#mode === "Entering" ? "Normal" : "NoShow";
    }
  }

  #segmentBrightness(index: number): number {
    switch (this.#mode) {
      case "NoShow":
        return 0;
      case "Normal":
        return 1;
      case "Entering": {
        let factor =
          this.#travelDirection === "Top"
            ? this.#travelPos - index
            : index - this.#travelPos;
        factor /= this.#travelTrailSize;
        return Math.min(Math.max(factor, 0), 1);
      }
      case "Exiting": {
        let factor =
          this.#travelDirection === "Top"
            ? index - this.#travelPos
            : this.#travelPos - index;
        factor /= this.#travelTrailSize;
        return Math.min(Math.max(factor, 0), 1);
      }
      default:
        return 1;
    }
  }

  // Diverges to Infinity as middleX approaches initX - a strand's own
  // wavy motion regularly carries a vertex back arbitrarily close to its
  // neutral rest position, hitting this singularity for real (not just a
  // theoretical edge case). The distance clamp below bounds that spike to
  // a finite (~2x) peak instead of unbounded.
  //
  // That bounded peak is still visible as a distinct flash once captured
  // by the trail buffer, though: stiffnessEffect (stiffness.ts) is a
  // spring-like restoring force pulling each point back toward initX, so
  // - exactly like any spring-restored oscillator - a strand's crossing
  // speed through its own rest position is naturally *highest* right where
  // this highlight also peaks. A fast crossing still spends a couple of
  // frames very near that column, and the trail persists whatever
  // brightness was there - a ~3x swing between the near-center peak and
  // the away-from-center baseline (~0.6x-2x, verified directly) reads as a
  // clear blip against the surrounding steadier trail. Damping the swing
  // toward a neutral 1x keeps the "brighter near center" character (an
  // intentional highlight, not being removed) while shrinking it to a
  // subtle variation that doesn't stand out once captured in the trail.
  #highlightFactor(p1: Point, p2: Point): number {
    const middleX = (p1.x + p2.x) / 2.0;
    const distance = Math.max(Math.abs(this.initX - middleX), 0.002);
    const rawFactor = 1.0 / Math.pow(distance, 1 / 9);
    const highlightDamping = 0.2;
    return 1 + (rawFactor - 1) * highlightDamping;
  }

  // Saturation/brightness are always 100 at both ends here, so only hue and
  // alpha actually need interpolating. The hue lerp matches p5's own
  // lerpColor() behavior in HSB mode, verified directly: it interpolates
  // along the *shortest angular path*, not naive linear - e.g. hue 250 to
  // hue 30 at amt=0.5 lands on 320 (the 100-degree way around through
  // 360/0), not 140 (the 220-degree way through the middle). This must stay
  // a CPU computation resolved to a real hue value before upload - naive
  // GPU-side interpolation of the raw start/end hues across a triangle
  // would not reproduce the shortest-path behavior.
  #segmentHueAlpha(heightPerc: number): [hue: number, alpha: number] {
    const startAlpha =
      heightPerc < this.#fadePerc ? heightPerc / this.#fadePerc : 1;
    const endAlpha =
      1 - heightPerc < this.#fadePerc ? (1 - heightPerc) / this.#fadePerc : 1;

    let hueDelta = this.#endHue - this.#startHue;
    if (hueDelta > 180) hueDelta -= 360;
    if (hueDelta < -180) hueDelta += 360;
    let gradHue = this.#startHue + hueDelta * heightPerc;
    gradHue = ((gradHue % 360) + 360) % 360;

    const gradAlpha = startAlpha + (endAlpha - startAlpha) * heightPerc;

    return [gradHue, gradAlpha];
  }

  #switchMode(): void {
    if (this.#mode === "Normal" && Math.random() < this.#exitingProbability) {
      this.#mode = "Exiting";
      if (Math.random() > 0.5) {
        this.#travelDirection = "Top";
        this.#travelPos = -this.#travelTrailSize;
      } else {
        this.#travelDirection = "Bottom";
        this.#travelPos = this.#interpolationPoints + this.#travelTrailSize;
      }
    } else if (
      this.#mode === "NoShow" &&
      Math.random() < this.#enteringProbability
    ) {
      this.#mode = "Entering";
      if (Math.random() > 0.5) {
        this.#travelDirection = "Top";
        this.#travelPos = 0;
      } else {
        this.#travelDirection = "Bottom";
        this.#travelPos = this.#interpolationPoints;
      }
    }
  }

  move(effects: Array<(strand: Strand, index: number) => number>): void {
    for (let index = 0; index < this.pointsArray.length; index++) {
      effects.forEach((effect) => {
        this.pointsArray[index].x += effect(this, index);
      });
    }

    this.#bezierCurve.updateControlPoints(this.pointsArray);
  }
}
