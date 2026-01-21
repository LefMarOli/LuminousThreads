p5.disableFriendlyErrors = true; // disables FES

let strandGrid;
let canvas;
let source;
let audioAnalyzer;
let maxVal = 0;

function setup() {
  frameRate(60);
  canvas = createCanvas(window.outerWidth, window.outerHeight);
  strandGrid = new StrandGrid(window.outerWidth, window.outerHeight);

  userStartAudio();

  source = new MicAudioSource();
  // source = new FileAudioSource("music.mp3");

  audioAnalyzer = new AudioAnalysis(source);
  audioAnalyzer.start();
}

function draw() {
  background(0, 0, 0);
  audioAnalyzer.update();
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

function windowResized() {
  resizeCanvas(window.outerWidth, window.outerHeight);
  strandGrid = new StrandGrid(window.outerWidth, window.outerHeight);
}

function keyPressed() {
  if (key === "f") {
    let fs = fullscreen();
    fullscreen(!fs);
  }
}
