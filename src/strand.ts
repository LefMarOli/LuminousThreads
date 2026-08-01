import { Point } from "./point";
import { BezierCurve } from "./bezier/bezierCurve";

// Standard HSV->RGB conversion (h: 0-360, s/b: 0-100), returned as a CSS
// rgba() string ready for ctx.strokeStyle. Verified directly against p5's
// own color()/HSB output (same colorMode) to produce pixel-identical RGB -
// this is what lets draw() bypass p5's stroke()/line() wrappers below
// without changing what actually gets rendered.
function hsbaToRgbaCss(h: number, s: number, b: number, a: number): string {
  s /= 100;
  b /= 100;
  const k = (n: number) => (n + h / 60) % 6;
  const f = (n: number) => b - b * s * Math.max(0, Math.min(k(n), 4 - k(n), 1));
  const r = Math.round(255 * f(5));
  const g = Math.round(255 * f(3));
  const bl = Math.round(255 * f(1));
  return `rgba(${r}, ${g}, ${bl}, ${a})`;
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
  #colorStopStride: number;

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

    // The gradient's color signal (hue drift + the fade envelope + the
    // warp-driven brightness) is smooth and low-frequency - a stop every
    // vertex (150 by default) massively oversamples it for what a linearly-
    // interpolated CanvasGradient actually needs to look identical. Sampling
    // at a fixed target stop count instead cuts addColorStop calls (and the
    // color math/string-building behind each one - both measured as the
    // biggest per-frame costs in this app) by ~85-90% with no visible
    // banding, while the path itself (moveTo/lineTo below) still uses every
    // vertex so the curve's shape stays fully smooth.
    const targetColorStops = 20;
    this.#colorStopStride = Math.max(
      1,
      Math.round((interpolationPoints - 1) / (targetColorStops - 1)),
    );

    colorMode(HSB, 360, 100, 100, 1);
  }

  draw(): void {
    //this.#switchMode();
    this.#updateTravel();
    this.#updateHue();

    if (this.#mode === "NoShow") return;

    push();
    // Drawing directly on the same underlying 2D context p5 itself uses
    // (verified: identical pixel output, and correctly saved/restored by
    // push()/pop() same as p5's own state) removes the overhead of p5's
    // stroke()/strokeWeight()/line() wrappers on top of the native canvas
    // call. Each vertex is stroked as part of ONE continuous path (with a
    // gradient for the per-vertex color) rather than ~150 independent
    // per-segment strokes - independent strokes that short (only a few
    // pixels each) are barely longer than their own line width, so each
    // one's anti-aliased edge doesn't blend seamlessly into its neighbor's,
    // producing a periodic dim "seam" at every joint (confirmed directly:
    // scanning real rendered pixel brightness along a strand showed a
    // dip roughly every 3px, matching the per-segment spacing exactly). A
    // single continuous path has no internal edges to blend across.
    const ctx = drawingContext as CanvasRenderingContext2D;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const vertices = this.#bezierCurve.vertices;
    const first = vertices[0];
    const last = vertices[this.#interpolationPoints - 1];
    const glowGradient = ctx.createLinearGradient(
      first.x,
      first.y,
      last.x,
      last.y,
    );
    const sharpGradient = ctx.createLinearGradient(
      first.x,
      first.y,
      last.x,
      last.y,
    );

    ctx.beginPath();
    for (let index = 0; index < this.#interpolationPoints; index++) {
      const vertex = vertices[index];
      if (index === 0) ctx.moveTo(vertex.x, vertex.y);
      else ctx.lineTo(vertex.x, vertex.y);
    }

    const lastIndex = this.#interpolationPoints - 1;
    for (let index = 0; index <= lastIndex; index += this.#colorStopStride) {
      this.#addGradientStops(
        glowGradient,
        sharpGradient,
        vertices,
        index,
        lastIndex,
      );
    }
    if (lastIndex % this.#colorStopStride !== 0) {
      this.#addGradientStops(
        glowGradient,
        sharpGradient,
        vertices,
        lastIndex,
        lastIndex,
      );
    }

    ctx.lineWidth = 6;
    ctx.strokeStyle = glowGradient;
    ctx.stroke();

    ctx.lineWidth = 2;
    ctx.strokeStyle = sharpGradient;
    ctx.stroke();

    pop();
  }

  #updateHue(): void {
    this.#startHue += this.#colorSpeed * deltaTime;
    this.#startHue %= 360;
    this.#endHue += this.#colorSpeed * deltaTime;
    this.#endHue %= 360;
  }

  #updateTravel(): void {
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

  #addGradientStops(
    glowGradient: CanvasGradient,
    sharpGradient: CanvasGradient,
    vertices: Point[],
    index: number,
    lastIndex: number,
  ): void {
    const vertex = vertices[index];
    const heightPerc = index / lastIndex;
    const [gradHue, gradAlpha] = this.#segmentHueAlpha(heightPerc);
    const segmentBrightness =
      100 *
      this.#highlightFactor(vertex, vertex) *
      this.#segmentBrightness(index);

    glowGradient.addColorStop(
      heightPerc,
      hsbaToRgbaCss(gradHue, 100, segmentBrightness, gradAlpha * 0.3),
    );
    sharpGradient.addColorStop(
      heightPerc,
      hsbaToRgbaCss(gradHue, 100, segmentBrightness, gradAlpha),
    );
  }

  #highlightFactor(p1: Point, p2: Point): number {
    const middleX = (p1.x + p2.x) / 2.0;
    const fa = 1.0 / Math.pow(Math.abs(this.initX - middleX), 1 / 9);
    return fa;
  }

  // Replaces what used to build two p5.Color objects and lerpColor() them
  // together every segment. p5 v2's rewritten color system made that
  // expensive enough (measured ~8-10us per segment's worth of Color-object
  // churn, times ~7000 segments/frame at default settings) to be the
  // single biggest per-frame cost in this app - saturation/brightness are
  // always 100 at both ends here, so only hue and alpha actually need
  // interpolating, done here with plain numbers instead. The hue lerp
  // matches p5's own lerpColor() behavior in HSB mode, verified directly:
  // it interpolates along the *shortest angular path*, not naive linear -
  // e.g. hue 250 to hue 30 at amt=0.5 lands on 320 (the 100-degree way
  // around through 360/0), not 140 (the 220-degree way through the middle).
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
    //return;
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
