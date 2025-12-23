p5.disableFriendlyErrors = true; // disables FES

let strandGrid;
let canvas;

function setup() {
  frameRate(60);
  canvas = createCanvas(window.innerWidth, window.innerHeight);
  strandGrid = new StrandGrid(window.innerWidth, window.innerHeight);
}

function draw() {
  background(0, 0, 0);
  noiseSeed();

  strandGrid.move();
  strandGrid.draw();
}

function windowResized() {
  resizeCanvas(window.innerWidth, window.innerHeight);
  strandGrid = new StrandGrid(window.innerWidth, window.innerHeight);
}

function keyPressed() {
  if (key === "f") {
    let fs = fullscreen();
    fullscreen(!fs);
  }
}
