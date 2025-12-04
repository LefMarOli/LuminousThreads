let strandGrid;
let p5bezier;
let canvas;

function setup() {
  frameRate(24);
  canvas = createCanvas(window.innerWidth, window.innerHeight);
  p5bezier = initBezier(canvas);
  strandGrid = new StrandGrid(
    p5bezier,
    window.innerWidth,
    window.innerHeight
  );
}

function draw() {
  background(0, 0, 0);

  stroke(255, 255, 255);
  strokeWeight(2);
  noFill();

  strandGrid.move();
  strandGrid.draw();
}

function windowResized() {
  resizeCanvas(window.innerWidth, window.innerHeight);
  p5bezier = initBezier(canvas);
  strandGrid = new StrandGrid(
    p5bezier,
    window.innerWidth,
    window.innerHeight
  );
}

function keyPressed() {
  if (key === "f") {
    let fs = fullscreen();
    fullscreen(!fs);
  }
}
