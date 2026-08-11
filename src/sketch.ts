import p5 from "p5";

import {
  StrandGrid,
  DEFAULT_BASE_START_HUE,
  DEFAULT_BASE_END_HUE,
  type NoiseLayerInfo,
} from "./strandGrid";
import { DisplayAudioSource } from "./audio/input/displayAudioSource";
import { AudioAnalysis } from "./audio/audioAnalyzer";
import { acquireGlContext } from "./gl/glContext";
import { Renderer, DEFAULT_TRAIL_DECAY_AMOUNT } from "./gl/renderer";
import {
  ControlsPanel,
  type SliderHandle,
  type ButtonHandle,
  type ReadoutHandle,
  type RemovableGroupHandle,
} from "./ui/controlsPanel";
import { FftOverlay } from "./ui/fftOverlay";
import { userStartAudio, getAudioContext } from "./audio/p5Sound";
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
// AudioAnalysis's output below only ever gets console.logged. Needs to stay
// on to prototype DisplayAudioSource (press "a" once the sketch is running -
// see p.keyPressed below): p5.sound itself (FFT/AudioIn/loadSound) only
// loads when this is true, and getDisplayMedia can't be requested until a
// real keypress fires anyway, so nothing forces it eagerly at startup.
const AUDIO_ENABLED = true;

// Bounds for the controls panel's trail-length slider. The underlying
// renderer parameter is a decay *rate* (smaller = slower fade = longer
// trail) - the inverse of how "trail length" reads as a slider, so the
// mapping is inverted in the slider's onChange below rather than exposing
// that inversion as part of ControlsPanel itself.
const MIN_TRAIL_DECAY = 0.002; // longest trail
const MAX_TRAIL_DECAY = 0.08; // shortest/crispest trail

// Shared with the Rendering tab's Strand Width slider bounds below, so
// treble-driven width (see p.draw) always stays in the same range manual
// dragging would.
const MIN_STRAND_WIDTH = 1;
const MAX_STRAND_WIDTH = 8;

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
  let displaySource: DisplayAudioSource | undefined;
  let audioAnalyzer: AudioAnalysis | undefined;
  let fftOverlay: FftOverlay | undefined;
  let maxVal = 0;
  let gl: WebGL2RenderingContext;
  let renderer: Renderer;
  let controlsPanel: ControlsPanel;
  let colorSpeedSlider: SliderHandle;
  let syncColorSpeedToNoise = false;

  // Audio reactivity's target - the Rendering tab's Strand Width slider
  // (treble). Assigned once in setup(), then driven every frame from
  // p.draw() while audioAnalyzer is active (see setAudioReactive below).
  let strandWidthSlider: SliderHandle;
  // Disabled (not driven) while audio reactivity is active - Gust Frequency
  // governs the random gust timer, which setAudioReactive turns off
  // entirely in that mode, so the slider would otherwise sit there having
  // no observable effect.
  let gustFrequencySlider: SliderHandle;
  // Rebuilds the Noise tab's layer cards from whatever layers the current
  // strandGrid actually has - assigned once in setup() (where the card-
  // creation machinery lives, scoped to the Noise tab's GroupHandle), then
  // called from rebuildStrandGrid() below. A fresh StrandGrid always starts
  // with exactly one layer at id 0, so without this, any extra layers
  // added via "+ Add Layer" would leave stale cards pointing at ids that no
  // longer exist on the new grid after a resize (or any other rebuild-
  // triggering slider).
  let reconcileNoiseLayers: () => void;

  // BeatDetector lives inside whatever AudioAnalysis the "a" key last
  // constructed (see p.keyPressed) - a fresh one every capture session, with
  // its own defaults. This persists the controls panel's chosen sensitivity
  // across that churn, reapplied to each new AudioAnalysis right after it's
  // constructed, so adjusting Beat Sensitivity before ever pressing "a"
  // still takes effect on the very first capture. Cooldown is no longer a
  // manual value - AudioAnalysis derives it every frame from its own
  // TempoEstimator, falling back to a fixed internal constant while
  // unconfident (see tempoEstimator.ts).
  let beatSensitivity = 1.3;
  // Read-only BPM/confidence display, driven from p.draw() below - not a
  // parameter the user sets, so it doesn't get the beatSensitivity/
  // beatCooldown treatment above.
  let bpmReadout: ReadoutHandle;

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

  // Gust/global-noise sliders' current values - unlike gapX etc. above,
  // these aren't StrandGrid constructor args, they're pushed into the
  // *existing* instance via setGustIntensity() and friends. A rebuild
  // replaces that instance with one built from its own hardcoded defaults
  // (WindGust's own fields, #warpProbability, #loopDuration/#pathRadius),
  // so without reapplying these afterward, every dragged Gust/Noise value
  // would silently snap back to default on any resize (or Strand Spacing/
  // Control Points/Interpolation Points/Start Hue/End Hue change) - which
  // reads as gusts suddenly not matching whatever shape they'd been tuned
  // to, e.g. a beat-triggered gust reverting to a multi-second ramp after
  // being tuned down to a snappy one.
  let gustIntensity = 1.5;
  let gustFrequency = 0.5;
  let gustDuration = 3000;
  let gustAttackFraction = 0.15;
  let gustAttackSharpness = 4;
  let gustDecaySharpness = 4;
  let noiseLoopDuration = 50;
  let noisePathRadius = 2;

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

    // A fresh StrandGrid starts every Gust/global-noise parameter at its
    // own hardcoded default - reapply whatever the controls panel had
    // last set, or a resize (or any other rebuild-triggering slider) would
    // silently undo all of this tuning, e.g. a gust tuned down to a snappy
    // 50ms reverting to its 3000ms default right as the next beat fires.
    strandGrid.setGustIntensity(gustIntensity);
    strandGrid.setGustFrequency(gustFrequency);
    strandGrid.setGustDuration(gustDuration);
    strandGrid.setGustAttackFraction(gustAttackFraction);
    strandGrid.setGustAttackSharpness(gustAttackSharpness);
    strandGrid.setGustDecaySharpness(gustDecaySharpness);
    strandGrid.setNoiseLoopDuration(noiseLoopDuration);
    strandGrid.setNoisePathRadius(noisePathRadius);

    // Every fresh StrandGrid also starts with its random gust timer
    // running, regardless of whether audio reactivity had turned it off on
    // the instance just destroyed above - reapply the current mode so
    // random gusts don't come back alongside beat-triggered ones while
    // capture is active.
    setAudioReactive(audioAnalyzer !== undefined);

    // The new StrandGrid also always starts with exactly one noise layer -
    // rebuild the Noise tab's layer cards to match it, rather than leaving
    // stale cards around for layers that no longer exist.
    reconcileNoiseLayers();
  }

  // Hands gust triggering and Strand Width over to audio analysis (beat ->
  // gust, treble -> Strand Width) while capture is active - disables the
  // random gust timer so beats are the only thing triggering gusts, and
  // disables+syncs Strand Width the same way "Sync to Noise" already does
  // for Color Speed, so it's clear it's driven, not stale.
  function setAudioReactive(active: boolean): void {
    strandGrid.setRandomGustEnabled(!active);
    strandWidthSlider.setEnabled(!active);
    gustFrequencySlider.setEnabled(!active);
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

    const motion = controlsPanel.addGroup("Motion");
    const { General, Noise, Gust } = motion.addSubTabs([
      "General",
      "Noise",
      "Gust",
    ]);

    General.addSlider({
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

    // Each noise layer gets its own removable card (Amplitude/Frequency/
    // Speed); Layer 1 is pre-populated from strandGrid's actual defaults so
    // the panel never drifts from the model. Seed differs per layer but
    // isn't exposed here - see strandGrid.addNoiseLayer().
    const MAX_NOISE_LAYERS = 6;
    const layerCards = new Map<
      number,
      { group: RemovableGroupHandle; removeButton: ButtonHandle }
    >();
    function updateLayerButtonStates(): void {
      addLayerButton.setEnabled(layerCards.size < MAX_NOISE_LAYERS);
      const canRemove = layerCards.size > 1;
      layerCards.forEach(({ removeButton }) =>
        removeButton.setEnabled(canRemove),
      );
    }

    function createLayerCard(info: NoiseLayerInfo): void {
      const group = Noise.addRemovableGroup(`Layer ${info.id + 1}`);
      group.addSlider({
        label: "Amplitude",
        min: 0,
        max: 30,
        step: 1,
        initialValue: info.amplitude,
        description:
          "How strongly this layer wobbles strands sideways from the noise-driven wind effect.",
        onChange: (value) => strandGrid.setLayerAmplitude(info.id, value),
      });
      group.addSlider({
        label: "Frequency",
        min: 0.001,
        max: 0.02,
        step: 0.001,
        initialValue: info.frequency,
        decimals: 3,
        description:
          "How tightly packed this layer's noise pattern looks along each strand, independent of its Amplitude.",
        onChange: (value) => strandGrid.setLayerFrequency(info.id, value),
      });
      group.addSlider({
        label: "Speed",
        min: 0,
        max: 3,
        step: 0.1,
        initialValue: info.speed,
        description:
          "How fast this layer's own noise pattern evolves over time, independent of its Frequency's spatial scale.",
        onChange: (value) => strandGrid.setLayerSpeed(info.id, value),
      });
      const removeButton = group.addButton({
        label: "Remove Layer",
        onClick: () => {
          strandGrid.removeNoiseLayer(info.id);
          group.remove();
          layerCards.delete(info.id);
          updateLayerButtonStates();
        },
      });

      layerCards.set(info.id, { group, removeButton });
      updateLayerButtonStates();
    }

    const addLayerButton = Noise.addButton({
      label: "+ Add Layer",
      onClick: () => createLayerCard(strandGrid.addNoiseLayer()),
    });

    // Ahead of the initial layer-card population (and of reconcileNoiseLayers
    // below, which always re-appends cards at the end of Noise's container)
    // so layer cards consistently render below these, both on first load and
    // after every rebuild-triggered reconciliation - rather than above them
    // initially and below them from the first resize onward.
    Noise.addSlider({
      label: "Noise Loop Duration",
      min: 10,
      max: 120,
      step: 5,
      initialValue: noiseLoopDuration,
      decimals: 0,
      description:
        "How many seconds every layer's noise pattern takes to complete one full cycle through its own space, independent of each layer's Speed.",
      onChange: (value) => {
        noiseLoopDuration = value;
        strandGrid.setNoiseLoopDuration(value);
      },
    });
    Noise.addSlider({
      label: "Noise Path Radius",
      min: 0.5,
      max: 10,
      step: 0.5,
      initialValue: noisePathRadius,
      description:
        "How large a circular path every layer's noise pattern travels along in its own space - larger values sample more varied noise per cycle.",
      onChange: (value) => {
        noisePathRadius = value;
        strandGrid.setNoisePathRadius(value);
      },
    });

    strandGrid.getNoiseLayers().forEach(createLayerCard);

    reconcileNoiseLayers = () => {
      layerCards.forEach(({ group }) => group.remove());
      layerCards.clear();
      strandGrid.getNoiseLayers().forEach(createLayerCard);
    };

    Gust.addSlider({
      label: "Gust Intensity",
      min: 1,
      max: 3,
      step: 0.1,
      initialValue: gustIntensity,
      description:
        "How much the periodic random gusts amplify every layer's sway on top of its base amount.",
      onChange: (value) => {
        gustIntensity = value;
        strandGrid.setGustIntensity(value);
      },
    });
    gustFrequencySlider = Gust.addSlider({
      label: "Gust Frequency",
      min: 0,
      max: 1,
      step: 0.05,
      initialValue: gustFrequency,
      description:
        "How likely a random gust is to kick in every few seconds, independent of Gust Intensity's strength. Has no effect while audio capture is driving gusts from detected beats instead.",
      onChange: (value) => {
        gustFrequency = value;
        strandGrid.setGustFrequency(value);
      },
    });
    Gust.addSlider({
      label: "Gust Duration",
      min: 50,
      max: 8000,
      step: 50,
      initialValue: gustDuration,
      decimals: 0,
      description:
        "How long a gust takes overall, in milliseconds - it rises fast to peak intensity, then decays back down, with no flat hold in between.",
      onChange: (value) => {
        gustDuration = value;
        strandGrid.setGustDuration(value);
      },
    });
    Gust.addSlider({
      label: "Gust Attack",
      min: 0.05,
      max: 0.9,
      step: 0.05,
      initialValue: gustAttackFraction,
      description:
        "How much of Gust Duration is spent rising to peak intensity - the rest is spent decaying back down. Low values feel like a sudden gust that lingers as it fades.",
      onChange: (value) => {
        gustAttackFraction = value;
        strandGrid.setGustAttackFraction(value);
      },
    });
    Gust.addSlider({
      label: "Gust Attack Sharpness",
      min: 0.5,
      max: 10,
      step: 0.5,
      initialValue: gustAttackSharpness,
      decimals: 1,
      description:
        "How much a gust's rise accelerates into its peak - low values ramp up almost steadily, high values stay slow at first then rush the last stretch to peak intensity.",
      onChange: (value) => {
        gustAttackSharpness = value;
        strandGrid.setGustAttackSharpness(value);
      },
    });
    Gust.addSlider({
      label: "Gust Decay Sharpness",
      min: 0.5,
      max: 10,
      step: 0.5,
      initialValue: gustDecaySharpness,
      decimals: 1,
      description:
        "How sharply a gust drops right after its peak before trailing off - higher values feel snappier, lower values feel more gradual all the way down.",
      onChange: (value) => {
        gustDecaySharpness = value;
        strandGrid.setGustDecaySharpness(value);
      },
    });

    controlsPanel.addGroup("Presence");
    controlsPanel.addSlider({
      label: "Vanish Frequency",
      min: 0,
      max: 0.05,
      step: 0.002,
      initialValue: 0,
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
    strandWidthSlider = controlsPanel.addSlider({
      label: "Strand Width",
      min: MIN_STRAND_WIDTH,
      max: MAX_STRAND_WIDTH,
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
      // Capture itself starts from the "a" key (see p.keyPressed) rather
      // than here - getDisplayMedia() must run inside a real user gesture,
      // and setup() runs on page load, not a click/keypress.
      fftOverlay = new FftOverlay();

      const Audio = controlsPanel.addGroup("Audio");
      Audio.addSlider({
        label: "Beat Sensitivity",
        min: 1,
        max: 3,
        step: 0.05,
        initialValue: beatSensitivity,
        decimals: 2,
        description:
          "How far above its own recent rolling average bass needs to jump to register as a beat - 1.3 means 30% above what's currently normal. Lower values catch more (subtler) beats; higher values only catch strong accents.",
        onChange: (value) => {
          beatSensitivity = value;
          audioAnalyzer?.setBeatSensitivity(value);
        },
      });
      bpmReadout = Audio.addReadout({
        label: "Tempo",
        initialValue: "—",
        description:
          "Estimated BPM and lock confidence, from onset autocorrelation - drives the beat detector's cooldown automatically instead of a fixed value. Takes a few seconds of confident signal to lock onto a tempo.",
      });
    }
  };

  p.draw = () => {
    if (audioAnalyzer) {
      audioAnalyzer.update();

      bpmReadout?.setValue(
        audioAnalyzer.bpm
          ? `${audioAnalyzer.bpm.toFixed(1)} BPM (${Math.round(
              Math.min(1, audioAnalyzer.bpmConfidence) * 100,
            )}%)`
          : "—",
      );

      if (audioAnalyzer.bass > maxVal) {
        maxVal = audioAnalyzer.bass;
        console.log(maxVal);
      }

      if (audioAnalyzer.beat) {
        console.log("beat");
        strandGrid.triggerGust();
      }

      // Treble -> Strand Width - already 0-1 normalized (see AudioAnalysis),
      // remapped onto the slider's own range so audio-driven values read
      // the same as manual ones. The slider is disabled while this runs
      // (setAudioReactive) but still updated so it visibly tracks what's
      // actually happening.
      const trebleWidth =
        MIN_STRAND_WIDTH +
        audioAnalyzer.treble * (MAX_STRAND_WIDTH - MIN_STRAND_WIDTH);
      renderer.setStrandWidth(trebleWidth);
      strandWidthSlider.setValue(trebleWidth);

      fftOverlay?.draw(audioAnalyzer.spectrum, audioAnalyzer.beat);
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
    fftOverlay?.resize(window.innerWidth);
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
    } else if (p.key === "g" && AUDIO_ENABLED) {
      fftOverlay?.toggle();
    } else if (p.key === "a" && AUDIO_ENABLED) {
      // Toggles DisplayAudioSource capture - pressing "a" again while
      // active stops it (and drops the browser's "sharing" indicator)
      // rather than requiring a reload.
      if (audioAnalyzer) {
        displaySource?.stop();
        displaySource = undefined;
        audioAnalyzer = undefined;
        setAudioReactive(false);
      } else {
        displaySource = new DisplayAudioSource(getAudioContext(p), () => {
          // Picker denied/cancelled - undo the optimistic assignment below
          // so "a" is a clean retry rather than "stop" a capture that
          // never actually started.
          displaySource = undefined;
          audioAnalyzer = undefined;
          setAudioReactive(false);
        });
        audioAnalyzer = new AudioAnalysis(displaySource);
        // A fresh BeatDetector defaults every time - reapply whatever the
        // controls panel had set, even if that happened before this very
        // first capture. Cooldown isn't reapplied here - AudioAnalysis
        // derives it internally from its own TempoEstimator every frame.
        audioAnalyzer.setBeatSensitivity(beatSensitivity);
        audioAnalyzer.start();
        setAudioReactive(true);
      }
    }
  };
});
