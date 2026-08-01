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

    colorMode(HSB, 360, 100, 100, 1);
  }

  draw(): void {
    //this.#switchMode();
    this.#updateTravel();
    this.#updateHue();

    if (this.#mode === "NoShow") return;

    push();
    // p5's stroke()/strokeWeight()/line() each add their own colorMode and
    // argument-handling overhead on top of the native canvas call - at
    // ~7000 segments x 2 stroke passes/frame (default settings), that
    // overhead alone measured ~90ms/frame. Drawing directly on the same
    // underlying 2D context p5 itself uses (verified: identical pixel
    // output, and correctly saved/restored by push()/pop() same as p5's
    // own state) removes that per-call overhead without changing what's
    // actually drawn.
    const ctx = drawingContext as CanvasRenderingContext2D;
    ctx.lineCap = "square";

    for (let index = 1; index < this.#interpolationPoints; index++) {
      // heightPerc must reach exactly 1 at the last segment (index ==
      // interpolationPoints - 1) for the gradient to fully reach its end
      // color there, matching how it fully reaches its start color at 0.
      const heightPerc = (index - 1) / (this.#interpolationPoints - 2);
      const [gradHue, gradAlpha] = this.#segmentHueAlpha(heightPerc);

      const p1 = this.#bezierCurve.vertices[index - 1];
      const p2 = this.#bezierCurve.vertices[index];

      const segmentBrightness =
        100 * this.#highlightFactor(p1, p2) * this.#segmentBrightness(index);

      ctx.lineWidth = 6;
      ctx.strokeStyle = hsbaToRgbaCss(
        gradHue,
        100,
        segmentBrightness,
        gradAlpha * 0.3,
      );
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      ctx.lineWidth = 2;
      ctx.strokeStyle = hsbaToRgbaCss(
        gradHue,
        100,
        segmentBrightness,
        gradAlpha,
      );
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

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
