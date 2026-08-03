import p5 from "p5";

import {
  StrandGrid,
  DEFAULT_BASE_START_HUE,
  DEFAULT_BASE_END_HUE,
} from "./strandGrid";
import { MicAudioSource } from "./audio/input/micAudioSource";
import { FileAudioSource } from "./audio/input/fileAudioSource";
import { AudioAnalysis } from "./audio/audioAnalyzer";
import { acquireGlContext } from "./gl/glContext";
import { Renderer, DEFAULT_TRAIL_DECAY_AMOUNT } from "./gl/renderer";
import { ControlsPanel, type SliderHandle } from "./ui/controlsPanel";
import { userStartAudio } from "./audio/p5Sound";
import { setStiffnessCoefficient } from "./effects/stiffness";
import {
  setColorSpeedMultiplier,
  setFadePercentage,
  setPeakProbability,
  setTravelTrailSize,
  setTravelSpeedMultiplier,
  setProbabilityPhaseShift,
  setEnteringDirectionBias,
  setExitingDirectionBias,
  setColorMode,
  setDisplacementColorRange,
} from "./strand";

// Sound-reactive visuals aren't actually wired into any rendering yet -
// AudioAnalysis's output below only ever gets console.logged. Turned off
// while focusing on visual work: running the full audio pipeline (mic
// permission prompt, FFT, loading Tone.js) has its own real cost and isn't
// needed for that right now. Flip back to true to re-enable.
const AUDIO_ENABLED = false;

// Bounds for the controls panel's trail-length slider. The underlying
// renderer parameter is a decay *rate* (smaller = slower fade = longer
// trail) - the inverse of how "trail length" reads as a slider, so the
// mapping is inverted in the slider's onChange below rather than exposing
// that inversion as part of ControlsPanel itself.
const MIN_TRAIL_DECAY = 0.002; // longest trail
const MAX_TRAIL_DECAY = 0.08; // shortest/crispest trail

// This is unrelated to instance vs global *sketch* mode below - it's how the
// p5.sound addon package itself is implemented (a side-effect import that
// extends the p5 prototype/statics), and it looks up the constructor via
// `window.p5` regardless of which mode the sketch itself runs in.
if (AUDIO_ENABLED) {
  // p5's own types declare `Window.p5` as a p5 *instance*, but the addon
  // needs the constructor there (p5.FFT/p5.AudioIn etc. are static members
  // of the constructor) - narrow escape hatch for that gap.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).p5 = p5;
  await import("p5.sound");
}

p5.disableFriendlyErrors = true; // disables FES

// Instance mode - the sketch's functions/state live inside this callback and
// reach p5 only through `p`, instead of p5 attaching createCanvas/draw/key/
// etc. onto `window` and this module reading/assigning window globals.
new p5((p: p5) => {
  let strandGrid: StrandGrid;
  let source: MicAudioSource | FileAudioSource | undefined;
  let audioAnalyzer: AudioAnalysis | undefined;
  let maxVal = 0;
  let gl: WebGL2RenderingContext;
  let renderer: Renderer;
  let controlsPanel: ControlsPanel;
  let colorSpeedSlider: SliderHandle;
  let syncColorSpeedToNoise = false;

  // Constructor args the controls panel can change (Strand Spacing/Start
  // Hue/End Hue/Control Points/Interpolation Points) - unlike most sliders
  // these can't be pushed into an existing StrandGrid/Strand, so a change
  // re-runs the same rebuild sequence a window resize already does (see
  // rebuildStrandGrid below).
  let gapX = 20;
  let baseStartHue = DEFAULT_BASE_START_HUE;
  let baseEndHue = DEFAULT_BASE_END_HUE;
  let numControlPoints = 30;
  let numInterpolationPoints = 150;

  // StrandGrid's own default, unexposed in the controls panel - kept as a
  // named constant here only because passing numControlPoints/
  // numInterpolationPoints positionally means this argument must be passed
  // too.
  const MARGIN = 10;

  function rebuildStrandGrid(): void {
    strandGrid.destroy();
    strandGrid = new StrandGrid(
      window.innerWidth,
      window.innerHeight,
      gapX,
      baseStartHue,
      baseEndHue,
      MARGIN,
      numControlPoints,
      numInterpolationPoints,
    );
    renderer.resize(window.innerWidth, window.innerHeight, strandGrid);
  }

  p.setup = () => {
    p.frameRate(60);
    p.createCanvas(window.innerWidth, window.innerHeight, p.WEBGL);
    strandGrid = new StrandGrid(
      window.innerWidth,
      window.innerHeight,
      gapX,
      baseStartHue,
      baseEndHue,
      MARGIN,
      numControlPoints,
      numInterpolationPoints,
    );

    // Grab the raw context and bypass p5's own WEBGL-mode 3D drawing API
    // entirely - box()/sphere()/its camera are never used, this is the same
    // "escape hatch to the real context" pattern strand.ts used for Canvas2D
    // before rendering moved to src/gl/.
    const { gl: acquiredGl, capabilities } = acquireGlContext(p);
    gl = acquiredGl;

    // The projection matrix must map the same coordinate space strand
    // vertices are authored in - window.innerWidth/innerHeight (CSS pixels,
    // the actual viewport content area - outerWidth/outerHeight include
    // browser chrome and don't track the visible canvas real estate),
    // matching StrandGrid/BezierCurve/Point - not gl.drawingBufferWidth/Height
    // (confirmed in Stage 0 to differ under a non-1:1 pixelDensity: passing
    // the drawing-buffer size here compressed the whole scene into a quarter
    // of the canvas, since vertex positions only span the smaller CSS range).
    // The viewport itself is still set to the full drawing-buffer resolution
    // (in Renderer.render()) so rendering stays sharp on high-DPI displays.
    renderer = new Renderer(
      gl,
      window.innerWidth,
      window.innerHeight,
      strandGrid,
      capabilities.hasFloatColorBuffer,
    );

    controlsPanel = new ControlsPanel();

    controlsPanel.addGroup("Motion");
    controlsPanel.addSlider({
      label: "Sway Amount",
      min: 0,
      max: 30,
      step: 1,
      initialValue: 10,
      description:
        "How strongly strands wobble sideways from the noise-driven wind effect.",
      onChange: (value) => strandGrid.setNoiseLevel(value),
    });
    controlsPanel.addSlider({
      label: "Gust Intensity",
      min: 1,
      max: 3,
      step: 0.1,
      initialValue: 1.5,
      description:
        "How much the periodic random gusts amplify the sway on top of the base amount.",
      onChange: (value) => strandGrid.setGustIntensity(value),
    });
    controlsPanel.addSlider({
      label: "Spring Stiffness",
      min: 0.0001,
      max: 0.0015,
      step: 0.0001,
      initialValue: 0.0005,
      decimals: 4,
      description:
        "How snappy vs. loose strands spring back toward their resting position.",
      onChange: (value) => setStiffnessCoefficient(value),
    });
    controlsPanel.addSlider({
      label: "Wave Frequency",
      min: 0.001,
      max: 0.02,
      step: 0.001,
      initialValue: 0.005,
      decimals: 3,
      description:
        "How tightly packed the noise-driven wave pattern looks along each strand, independent of Sway Amount's intensity.",
      onChange: (value) => strandGrid.setWaveFrequency(value),
    });
    controlsPanel.addSlider({
      label: "Gust Frequency",
      min: 0,
      max: 1,
      step: 0.05,
      initialValue: 0.5,
      description:
        "How likely a random gust is to kick in every few seconds, independent of Gust Intensity's strength.",
      onChange: (value) => strandGrid.setGustFrequency(value),
    });
    controlsPanel.addSlider({
      label: "Gust Duration",
      min: 500,
      max: 8000,
      step: 250,
      initialValue: 3000,
      decimals: 0,
      description:
        "How long a gust stays at its peak intensity, in milliseconds, before it starts easing back down.",
      onChange: (value) => strandGrid.setGustDuration(value),
    });
    controlsPanel.addSlider({
      label: "Gust Acceleration",
      min: 0.0002,
      max: 0.005,
      step: 0.0002,
      initialValue: 0.001,
      decimals: 4,
      description:
        "How quickly a gust ramps up to its peak intensity (and eases back down) - higher values feel snappier, lower values feel more gradual.",
      onChange: (value) => strandGrid.setGustRampRate(value),
    });
    controlsPanel.addSlider({
      label: "Noise Speed",
      min: 0,
      max: 3,
      step: 0.1,
      initialValue: 1,
      description:
        "How fast the underlying noise pattern itself evolves over time, independent of Wave Frequency's spatial scale.",
      onChange: (value) => strandGrid.setNoiseSpeedMultiplier(value),
    });
    controlsPanel.addSlider({
      label: "Noise Loop Duration",
      min: 10,
      max: 120,
      step: 5,
      initialValue: 50,
      decimals: 0,
      description:
        "How many seconds the underlying noise pattern takes to complete one full cycle through its own space, independent of Noise Speed's multiplier.",
      onChange: (value) => strandGrid.setNoiseLoopDuration(value),
    });
    controlsPanel.addSlider({
      label: "Noise Path Radius",
      min: 0.5,
      max: 10,
      step: 0.5,
      initialValue: 2,
      description:
        "How large a circular path the noise pattern travels along in its own space - larger values sample more varied noise per cycle.",
      onChange: (value) => strandGrid.setNoisePathRadius(value),
    });
    controlsPanel.addGroup("Presence");
    controlsPanel.addSlider({
      label: "Vanish Frequency",
      min: 0,
      max: 0.05,
      step: 0.002,
      initialValue: 0.01,
      decimals: 3,
      description:
        "How often a strand randomly travels off-screen and reappears elsewhere in its cycle. Zero keeps every strand always present.",
      onChange: (value) => setPeakProbability(value),
    });
    controlsPanel.addSlider({
      label: "Travel Trail Size",
      min: 5,
      max: 100,
      step: 5,
      initialValue: 40,
      description:
        "How many vertices it takes a strand to fully fade in/out while entering or exiting - larger values make the reveal/vanish more gradual.",
      onChange: (value) => setTravelTrailSize(value),
    });
    controlsPanel.addSlider({
      label: "Travel Speed",
      min: 0.25,
      max: 3,
      step: 0.05,
      initialValue: 1,
      description:
        "Multiplier on how fast a strand travels across the screen once it starts entering or exiting.",
      onChange: (value) => setTravelSpeedMultiplier(value),
    });
    controlsPanel.addSlider({
      label: "Enter/Exit Phase Offset",
      min: 0,
      max: Math.PI * 2,
      step: 0.05,
      initialValue: Math.PI / 2,
      description:
        "Offsets the entering-probability cycle from the exiting-probability cycle - at 0 they're in lockstep, so a strand tends to re-enter right as another exits.",
      onChange: (value) => setProbabilityPhaseShift(value),
    });
    controlsPanel.addSlider({
      label: "Entering Direction Bias",
      min: 0,
      max: 1,
      step: 0.05,
      initialValue: 0.5,
      endLabels: ["Bottom", "Top"],
      description:
        "Chance a newly-entering strand grows upward from the bottom rather than downward from the top - 0.5 is an even split.",
      onChange: (value) => setEnteringDirectionBias(value),
    });
    controlsPanel.addSlider({
      label: "Exiting Direction Bias",
      min: 0,
      max: 1,
      step: 0.05,
      initialValue: 0.5,
      endLabels: ["Bottom", "Top"],
      description:
        "Chance an exiting strand vanishes upward from the bottom rather than downward from the top - 0.5 is an even split.",
      onChange: (value) => setExitingDirectionBias(value),
    });

    controlsPanel.addGroup("Color");
    colorSpeedSlider = controlsPanel.addSlider({
      label: "Color Speed",
      min: 0,
      max: 3,
      step: 0.1,
      initialValue: 1,
      description: "How fast each strand's hue drifts and cycles over time.",
      onChange: (value) => setColorSpeedMultiplier(value),
    });
    controlsPanel.addToggle({
      label: "Sync to Noise",
      initialValue: false,
      description:
        "Locks Color Speed to the noise pattern's actual current rate - including gust bursts - so hue drift always tracks how fast the wind pattern itself is moving.",
      onChange: (value) => {
        syncColorSpeedToNoise = value;
        colorSpeedSlider.setEnabled(!value);
      },
    });
    controlsPanel.addSlider({
      label: "Fade Length",
      min: 0.1,
      max: 1,
      step: 0.05,
      initialValue: 0.45,
      description:
        "How much of a strand's length fades in and out at its top and bottom ends.",
      onChange: (value) => setFadePercentage(value),
    });
    controlsPanel.addSlider({
      label: "Start Hue",
      min: 0,
      max: 360,
      step: 1,
      initialValue: DEFAULT_BASE_START_HUE,
      swatch: true,
      description:
        "The base hue each strand's bottom end drifts from - in Proportional color mode, this is the hue at the leftmost sway extreme instead.",
      onChange: (value) => {
        baseStartHue = value;
        rebuildStrandGrid();
      },
    });
    controlsPanel.addSlider({
      label: "End Hue",
      min: 0,
      max: 360,
      step: 1,
      initialValue: DEFAULT_BASE_END_HUE,
      swatch: true,
      description:
        "The base hue each strand's top end drifts from - in Proportional color mode, this is the hue at the rightmost sway extreme instead.",
      onChange: (value) => {
        baseEndHue = value;
        rebuildStrandGrid();
      },
    });
    controlsPanel.addToggle({
      label: "Proportional Color Mode",
      initialValue: false,
      description:
        "Colors each point by how far it has swayed sideways from its rest position (Start Hue on the left, End Hue on the right), instead of by its position along the strand's length.",
      onChange: (value) => setColorMode(value ? "Proportional" : "Gradient"),
    });
    controlsPanel.addSlider({
      label: "Displacement Range",
      min: 5,
      max: 100,
      step: 5,
      initialValue: 40,
      description:
        "In Proportional color mode, how far a point needs to sway sideways from rest to reach the full Start Hue/End Hue range.",
      onChange: (value) => setDisplacementColorRange(value),
    });

    controlsPanel.addGroup("Rendering");
    controlsPanel.addSlider({
      label: "Strand Width",
      min: 1,
      max: 8,
      step: 0.5,
      initialValue: 3,
      description: "How thick the glowing strands render.",
      onChange: (value) => renderer.setStrandWidth(value),
    });
    const defaultTrailLengthFraction =
      (MAX_TRAIL_DECAY - DEFAULT_TRAIL_DECAY_AMOUNT) /
      (MAX_TRAIL_DECAY - MIN_TRAIL_DECAY);
    controlsPanel.addSlider({
      label: "Trail Length",
      min: 0,
      max: 1,
      step: 0.01,
      initialValue: defaultTrailLengthFraction,
      description:
        "How long the fading light trail lingers behind each strand.",
      onChange: (fraction) => {
        const decayAmount =
          MAX_TRAIL_DECAY - fraction * (MAX_TRAIL_DECAY - MIN_TRAIL_DECAY);
        renderer.setTrailDecayAmount(decayAmount);
      },
    });
    controlsPanel.addSlider({
      label: "Strand Spacing",
      min: 10,
      max: 40,
      step: 1,
      initialValue: gapX,
      description:
        "Horizontal gap between strands - lower values pack more strands onto the screen.",
      onChange: (value) => {
        gapX = value;
        rebuildStrandGrid();
      },
    });
    controlsPanel.addSlider({
      label: "Control Points",
      min: 4,
      max: 60,
      step: 1,
      initialValue: numControlPoints,
      decimals: 0,
      description:
        "How many control points define each strand's underlying curve, top to bottom - more points allow finer bends but cost more to simulate.",
      onChange: (value) => {
        numControlPoints = value;
        rebuildStrandGrid();
      },
    });
    controlsPanel.addSlider({
      label: "Interpolation Points",
      min: 20,
      max: 300,
      step: 10,
      initialValue: numInterpolationPoints,
      decimals: 0,
      description:
        "How many vertices each strand's curve is tessellated into for rendering - more points look smoother but cost more to draw.",
      onChange: (value) => {
        numInterpolationPoints = value;
        rebuildStrandGrid();
      },
    });

    if (AUDIO_ENABLED) {
      userStartAudio(p);

      source = new MicAudioSource();
      // source = new FileAudioSource(p, "music.mp3");

      audioAnalyzer = new AudioAnalysis(source);
      audioAnalyzer.start();
    }
  };

  p.draw = () => {
    if (audioAnalyzer) {
      audioAnalyzer.update();

      if (audioAnalyzer.bass > maxVal) {
        maxVal = audioAnalyzer.bass;
        console.log(maxVal);
      }

      if (audioAnalyzer.beat) console.log("beat");
    }

    // @ts-expect-error - real p5 accepts calling this with no seed (re-seeds
    // randomly); p5's own types require an argument that isn't actually mandatory.
    p.noiseSeed();
    //p.noCursor();

    strandGrid.move(p.deltaTime);
    strandGrid.update(p.deltaTime);

    // Polled every frame (rather than only when the Noise Speed slider
    // moves) so Color Speed keeps tracking the noise's actual current rate
    // through a gust's ramp up/down too, not just its resting value.
    if (syncColorSpeedToNoise) {
      const noiseSpeed = strandGrid.getNoiseCurrentSpeed();
      setColorSpeedMultiplier(noiseSpeed);
      colorSpeedSlider.setValue(noiseSpeed);
    }
    renderer.render(strandGrid);
  };

  p.windowResized = () => {
    p.resizeCanvas(window.innerWidth, window.innerHeight);
    rebuildStrandGrid();
  };

  p.keyPressed = () => {
    if (p.key === "f") {
      const fs = p.fullscreen();
      p.fullscreen(!fs);
      p.windowResized();
    } else if (p.key === "w") {
      renderer.toggleWireframe();
    } else if (p.key === "m") {
      controlsPanel.toggle();
    }
  };
});
