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

// Shared across all strands (rather than per-instance fields) so the
// controls panel's sliders take effect on every strand immediately,
// not just ones constructed after a change.
let fadePercentage = 0.45;
let colorSpeedMultiplier = 1;

export function setFadePercentage(value: number): void {
  fadePercentage = value;
}

export function setColorSpeedMultiplier(value: number): void {
  colorSpeedMultiplier = value;
}

// Amplitude driving #switchMode()'s random Normal<->Exiting/NoShow<->Entering
// rolls (see #updateTravel) - shared across strands so a slider change
// takes effect on every strand immediately, same reasoning as fadePercentage.
// Zero by default - strands stay present until the Vanish Frequency slider
// is raised, matching its own default in sketch.ts.
let peakProbability = 0;

export function setPeakProbability(value: number): void {
  peakProbability = value;
}

// How many vertices' worth of travel it takes for a strand to fully
// fade in/out once Entering/Exiting - see #segmentBrightness. Shared across
// strands for the same live-tuning reason as peakProbability.
let travelTrailSize = 40;

export function setTravelTrailSize(value: number): void {
  travelTrailSize = value;
}

// Multiplies each strand's own #travelSpeed (computed once in the
// constructor from loopDuration/interpolationPoints) - a single shared knob
// to speed up or slow down the travel-reveal motion without needing to
// recompute every strand's base speed.
let travelSpeedMultiplier = 1;

export function setTravelSpeedMultiplier(value: number): void {
  travelSpeedMultiplier = value;
}

// Offsets the Entering probability's sine wave from the Exiting probability's
// (see #updateTravel) - at the default PI/2 they're a quarter-cycle apart, so
// strands tend to exit and re-enter at different points in the loop rather
// than in lockstep.
let probabilityPhaseShift = Math.PI / 2;

export function setProbabilityPhaseShift(value: number): void {
  probabilityPhaseShift = value;
}

// Chance a newly-Exiting/Entering strand travels via "Top" rather than
// "Bottom" (see #switchMode) - 0.5 is an even split; shared so a slider
// change re-biases every strand's next roll immediately. Separate knobs for
// each direction since a strand exiting toward the top vs. entering from
// the top are independent creative choices (e.g. "always exit downward,
// but enter from either end").
let enteringDirectionBias = 0.5;
let exitingDirectionBias = 0.5;

export function setEnteringDirectionBias(value: number): void {
  enteringDirectionBias = value;
}

export function setExitingDirectionBias(value: number): void {
  exitingDirectionBias = value;
}

// Selects what #segmentHueAlpha uses as its 0-1 position along the
// startHue->endHue gradient - "Gradient" (the original behavior) uses
// heightPerc, i.e. a vertex's position along the strand's length;
// "Proportional" instead uses how far the vertex has swayed sideways from
// its rest x position (see displacementColorRange below), so color tracks
// the strand's own wind-driven motion rather than a fixed vertical ramp.
let colorMode: "Gradient" | "Proportional" = "Gradient";

export function setColorMode(mode: "Gradient" | "Proportional"): void {
  colorMode = mode;
}

// How far a vertex must sway from its rest x position, in either direction,
// to reach the full startHue/endHue gradient in Proportional mode - there's
// no natural fixed bound on sway distance (it settles wherever the noise
// forcing and stiffness spring's restoring force balance out), so this is
// exposed as a live-tunable knob rather than derived.
let displacementColorRange = 40;

export function setDisplacementColorRange(value: number): void {
  displacementColorRange = value;
}

// How much #highlightFactor brightens a vertex as it nears its strand's
// rest position - exposed live (Near-Center Highlight Strength slider)
// rather than the fixed 0.2 introduced during the WebGL port to tame the
// singularity at full per-vertex resolution, which incidentally damped the
// highlight down to a ~0.93x-1.2x swing, imperceptible in practice.
let highlightDamping = 0.2;

export function setHighlightDamping(value: number): void {
  highlightDamping = value;
}

// Far-Center Boost: the opposite of #highlightFactor - brightens a vertex
// the *further* it has swayed from its strand's rest position, saturating
// linearly instead of diverging (no singularity guard needed). Scaled by
// beatEnvelope (see setBeatEnvelope below), so with no trigger source
// enabled this contributes nothing regardless of Strength/Range.
let farBoostStrength = 1;
let farBoostRange = 40;

export function setFarBoostStrength(value: number): void {
  farBoostStrength = value;
}

export function setFarBoostRange(value: number): void {
  farBoostRange = value;
}

// How far Far-Center Boost's pulse also desaturates a point toward white
// (0 = hue unaffected, 1 = fully white at peak boost) - rides the exact same
// distance-ratio/beatEnvelope drive as farExcess above, so a point only
// shifts toward white exactly when and as much as it's already brightening.
// Defaults to 0 (off) - ships conservative like every other new knob here.
let farWhiteShiftStrength = 0;

export function setFarWhiteShiftStrength(value: number): void {
  farWhiteShiftStrength = value;
}

// Pushed once per frame from sketch.ts (after strandGrid.move(), so it
// reflects the current frame's envelope with no lag) - the combined
// (via max()) 0-1 value of whichever of Far-Center Boost's "React to Gust"/
// "React to Beat" sources are enabled.
let beatEnvelope = 0;

export function setBeatEnvelope(value: number): void {
  beatEnvelope = value;
}

// Flat multiplier applied before the final 100-brightness clamp - pulling
// this down creates headroom so Far-Center Boost's beat-triggered pulse
// reads as a visible brightening instead of instantly clipping at the
// existing ceiling.
let masterBrightness = 1;

export function setMasterBrightness(value: number): void {
  masterBrightness = value;
}

export class Strand {
  pointsArray: Point[];
  initArray: Point[];
  initX: number;
  #bezierCurve: BezierCurve;
  #interpolationPoints: number;
  #startHue: number;
  #endHue: number;
  #colorSpeed: number;
  #minColorSpeed = 0.1;
  #mode: "Normal" | "Entering" | "Exiting" | "NoShow" = "Normal";
  #travelDirection: "Top" | "Bottom" = "Top";
  #travelSpeed = 0.01;
  #travelPos!: number;
  #enteringProbability = peakProbability;
  #exitingProbability = 0;
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

  // Per-frame CPU state update - the travel-reveal position and hue drift.
  // Used to run inside the old Canvas2D draw() (which also built gradients
  // and stroked the path); now that rendering happens via the WebGL
  // renderer reading vertices/getVertexColor() directly, this is the only
  // per-frame work Strand itself still needs to do.
  //
  // #switchMode() rolls the dice (amplitude set by the controls panel's
  // Vanish Frequency slider, see peakProbability above) on whether this
  // strand starts traveling off-screen and reappearing elsewhere in its
  // cycle - #updateTravel and #segmentBrightness's Entering/Exiting/NoShow
  // branches only ever trigger once this call sets #mode away from Normal.
  update(deltaTime: number): void {
    this.#switchMode();
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
    const vertex = this.#bezierCurve.vertices[index];
    const [hue, alpha] = this.#segmentHueAlpha(heightPerc, vertex.x);

    // Near-Center Highlight and Far-Center Boost are combined additively as
    // "excess over 1" rather than multiplied together - multiplying two
    // independently-tunable boosts risks compounding into a flat, clipped
    // look when both are pushed high at once; additive combination is
    // inherently bounded by each term's own bound. #highlightFactor's own
    // distance clamp keeps its excess finite rather than diverging at the
    // singularity; the 100-brightness clamp below still catches the
    // combined result regardless of exactly how large either term gets.
    const distance = Math.abs(this.initX - vertex.x);
    const nearExcess = this.#highlightFactor(distance) - 1;
    // Shared by Far-Center Boost's brightness excess and its optional white
    // shift below - both should only appear exactly when and as much as a
    // point is currently boosted, not on independent timing.
    const farDrive = Math.min(distance / farBoostRange, 1) * beatEnvelope;
    const farExcess = farBoostStrength * farDrive;
    const whiteShiftAmount = Math.min(farWhiteShiftStrength * farDrive, 1);
    const saturation = 100 * (1 - whiteShiftAmount);

    const brightness = Math.min(
      100 *
        masterBrightness *
        (1 + nearExcess + farExcess) *
        this.#segmentBrightness(index),
      100,
    );
    const [r, g, b] = hsbToRgb(hue, saturation, brightness);
    return [r, g, b, alpha];
  }

  #updateHue(deltaTime: number): void {
    this.#startHue += this.#colorSpeed * colorSpeedMultiplier * deltaTime;
    this.#startHue %= 360;
    this.#endHue += this.#colorSpeed * colorSpeedMultiplier * deltaTime;
    this.#endHue %= 360;
  }

  #updateTravel(deltaTime: number): void {
    this.#loopTimestamp += deltaTime;
    this.#loopTimestamp %= this.#loopDuration;

    const animationProgress = this.#loopTimestamp / this.#loopDuration;
    this.#exitingProbability =
      peakProbability * Math.sin(animationProgress * Math.PI);
    this.#enteringProbability =
      peakProbability *
      Math.sin(animationProgress * Math.PI + probabilityPhaseShift);

    if (this.#mode === "Normal" || this.#mode === "NoShow") return;

    const travelSpeed = this.#travelSpeed * travelSpeedMultiplier;
    if (this.#travelDirection === "Top") {
      this.#travelPos += travelSpeed * deltaTime;
      if (this.#travelPos >= this.#interpolationPoints + travelTrailSize)
        this.#mode = this.#mode === "Entering" ? "Normal" : "NoShow";
    } else if (this.#travelDirection === "Bottom") {
      this.#travelPos -= travelSpeed * deltaTime;
      if (this.#travelPos <= -travelTrailSize)
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
        factor /= travelTrailSize;
        return Math.min(Math.max(factor, 0), 1);
      }
      case "Exiting": {
        let factor =
          this.#travelDirection === "Top"
            ? index - this.#travelPos
            : this.#travelPos - index;
        factor /= travelTrailSize;
        return Math.min(Math.max(factor, 0), 1);
      }
      default:
        return 1;
    }
  }

  // Diverges to Infinity as distance approaches 0 - a strand's own wavy
  // motion regularly carries a vertex back arbitrarily close to its neutral
  // rest position, hitting this singularity for real (not just a
  // theoretical edge case). The distance clamp below bounds that spike to a
  // finite (~2x) raw peak instead of unbounded; highlightDamping (a live
  // slider - see setHighlightDamping above) then scales that raw swing down
  // to whatever's visually appropriate.
  //
  // That peak is still visible as a distinct flash once captured by the
  // trail buffer: stiffnessEffect (stiffness.ts) is a spring-like restoring
  // force pulling each point back toward initX, so - exactly like any
  // spring-restored oscillator - a strand's crossing speed through its own
  // rest position is naturally *highest* right where this highlight also
  // peaks. A fast crossing still spends a couple of frames very near that
  // column, and the trail persists whatever brightness was there.
  #highlightFactor(distance: number): number {
    const clampedDistance = Math.max(distance, 0.002);
    const rawFactor = 1.0 / Math.pow(clampedDistance, 1 / 9);
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
  //
  // Alpha always fades by heightPerc (position along the strand's length)
  // regardless of colorMode - only the hue's 0-1 position along the
  // startHue->endHue gradient switches to vertexX's sideways displacement
  // in Proportional mode (see colorMode above).
  #segmentHueAlpha(
    heightPerc: number,
    vertexX: number,
  ): [hue: number, alpha: number] {
    const startAlpha =
      heightPerc < fadePercentage ? heightPerc / fadePercentage : 1;
    const endAlpha =
      1 - heightPerc < fadePercentage ? (1 - heightPerc) / fadePercentage : 1;

    const gradPerc =
      colorMode === "Proportional"
        ? Math.min(
            Math.max(
              (vertexX - this.initX + displacementColorRange) /
                (2 * displacementColorRange),
              0,
            ),
            1,
          )
        : heightPerc;

    let hueDelta = this.#endHue - this.#startHue;
    if (hueDelta > 180) hueDelta -= 360;
    if (hueDelta < -180) hueDelta += 360;
    let gradHue = this.#startHue + hueDelta * gradPerc;
    gradHue = ((gradHue % 360) + 360) % 360;

    const gradAlpha = startAlpha + (endAlpha - startAlpha) * heightPerc;

    return [gradHue, gradAlpha];
  }

  #switchMode(): void {
    if (this.#mode === "Normal" && Math.random() < this.#exitingProbability) {
      this.#mode = "Exiting";
      if (Math.random() < exitingDirectionBias) {
        this.#travelDirection = "Top";
        this.#travelPos = -travelTrailSize;
      } else {
        this.#travelDirection = "Bottom";
        this.#travelPos = this.#interpolationPoints + travelTrailSize;
      }
    } else if (
      this.#mode === "NoShow" &&
      Math.random() < this.#enteringProbability
    ) {
      this.#mode = "Entering";
      if (Math.random() < enteringDirectionBias) {
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
