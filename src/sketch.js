p5.disableFriendlyErrors = true; // disables FES

let strandGrid;
let canvas;

function setup() {
  frameRate(60);
  canvas = createCanvas(window.outerWidth, window.outerHeight);
  strandGrid = new StrandGrid(window.outerWidth, window.outerHeight);
}

function draw() {
  background(0, 0, 0);
  noiseSeed();

  strandGrid.move();
  strandGrid.draw();
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
