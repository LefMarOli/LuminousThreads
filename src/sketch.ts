import p5 from "p5";

import { StrandGrid } from "./strandGrid";
import { MicAudioSource } from "./audio/input/micAudioSource";
import { FileAudioSource } from "./audio/input/fileAudioSource";
import { AudioAnalysis } from "./audio/audioAnalyzer";
import { acquireGlContext } from "./gl/glContext";
import { Renderer, DEFAULT_TRAIL_DECAY_AMOUNT } from "./gl/renderer";
import { ControlsPanel } from "./ui/controlsPanel";
import { userStartAudio } from "./audio/p5Sound";
import { setStiffnessCoefficient } from "./effects/stiffness";
import { setColorSpeedMultiplier, setFadePercentage } from "./strand";

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

  p.setup = () => {
    p.frameRate(60);
    p.createCanvas(window.innerWidth, window.innerHeight, p.WEBGL);
    strandGrid = new StrandGrid(window.innerWidth, window.innerHeight);

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

    controlsPanel.addGroup("Color");
    controlsPanel.addSlider({
      label: "Color Speed",
      min: 0,
      max: 3,
      step: 0.1,
      initialValue: 1,
      description: "How fast each strand's hue drifts and cycles over time.",
      onChange: (value) => setColorSpeedMultiplier(value),
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
    renderer.render(strandGrid);
  };

  p.windowResized = () => {
    p.resizeCanvas(window.innerWidth, window.innerHeight);
    strandGrid.destroy();
    strandGrid = new StrandGrid(window.innerWidth, window.innerHeight);
    renderer.resize(window.innerWidth, window.innerHeight, strandGrid);
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
