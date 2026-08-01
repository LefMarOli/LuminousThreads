import p5 from "p5";

import { StrandGrid } from "./strandGrid";
import { MicAudioSource } from "./audio/input/micAudioSource";
import { FileAudioSource } from "./audio/input/fileAudioSource";
import { AudioAnalysis } from "./audio/audioAnalyzer";

// Importing p5 as a real ES module (rather than loading the browser <script>
// build) skips p5's own "no module system detected, auto-bootstrap global
// mode" trick, so it has to be done by hand here:
//  1. expose the constructor on `window` - the p5.sound addon (and any bare
//     `p5.FFT`/`p5.AudioIn` reference elsewhere) looks it up as a global.
//  2. load the sound addon, which extends the p5 prototype/statics, only
//     after `window.p5` exists.
//  3. `new p5()` with no sketch function is what actually makes p5 enter
//     global mode - that's what attaches createCanvas/background/etc. to
//     `window` and makes p5 start looking for window.setup/draw itself.
(window as any).p5 = p5;
await import("p5/lib/addons/p5.sound");

// @types/p5 declares disableFriendlyErrors as an instance property, but p5's
// real runtime API sets it directly on the constructor - narrow escape hatch
// for that types-package gap, not a real `any`.
(p5 as any).disableFriendlyErrors = true; // disables FES

let strandGrid!: StrandGrid;
let canvas!: p5.Renderer;
let source!: MicAudioSource | FileAudioSource;
let audioAnalyzer!: AudioAnalysis;
let maxVal = 0;

function setup(): void {
  frameRate(60);
  canvas = createCanvas(window.outerWidth, window.outerHeight);
  strandGrid = new StrandGrid(window.outerWidth, window.outerHeight);

  userStartAudio();

  source = new MicAudioSource();
  // source = new FileAudioSource("music.mp3");

  audioAnalyzer = new AudioAnalysis(source);
  audioAnalyzer.start();
}

function draw(): void {
  background(0, 0, 0);
  audioAnalyzer.update();
  // @ts-expect-error - real p5 accepts calling this with no seed (re-seeds
  // randomly); @types/p5 requires an argument that isn't actually mandatory.
  noiseSeed();
  //noCursor();

  strandGrid.move();
  strandGrid.draw();

  if (audioAnalyzer.bass > maxVal) {
    maxVal = audioAnalyzer.bass;
    console.log(maxVal);
  }

  if (audioAnalyzer.beat) console.log("beat");
}

function windowResized(): void {
  resizeCanvas(window.outerWidth, window.outerHeight);
  strandGrid = new StrandGrid(window.outerWidth, window.outerHeight);
}

function keyPressed(): void {
  if (key === "f") {
    let fs = fullscreen();
    fullscreen(!fs);
  }
}

// p5's global-mode bootstrap looks for these as properties of `window`. As an ES
// module, top-level function declarations here are scoped to this module, not
// attached to `window` automatically the way classic <script> tags used to do it
// - so without this, p5 never finds them and the canvas never renders.
Object.assign(window, { setup, draw, windowResized, keyPressed });

// Must run after the assignment above: this is what makes p5 actually enter
// global mode and look for window.setup/draw (see the comment near the top).
// @types/p5's constructor type requires a sketch function, but the real
// runtime constructor treats a no-argument call as "run in global mode".
new (p5 as any)();
