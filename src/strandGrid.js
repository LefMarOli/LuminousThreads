class StrandGrid {
  #perlinNoise;
  #warpState = "Decreasing"; //Increasing, Decreasing
  #warpProbability = 0.5;

  constructor(
    width,
    height,
    gapX = 20,
    margin = 10,
    numPoints = 30,
    interpolationPoints = 150,
    loopDuration = 50
  ) {
    colorMode(HSB, 360, 100, 100);
    this.startColor = color("#380ef3ff");
    this.endColor = color("#db680aff");

    this.numStrands = Math.floor((width + 8 * gapX) / gapX);
    this.strands = Array(this.numStrands);

    const anchorY = height + margin;
    this.numPoints = numPoints;
    mapCoefficients(numPoints, interpolationPoints);
    const gapY = Math.ceil((anchorY - margin) / (this.numPoints - 1));
    const dataPoints = Array(this.numPoints);
    for (let y = 0; y < this.numPoints; y++) {
      dataPoints[y] = new Point();
    }

    for (let row = 0; row < this.numStrands; row++) {
      const anchorX = -2 * margin + row * gapX;
      for (let column = 0; column < this.numPoints; column++) {
        dataPoints[column].x = anchorX;
        dataPoints[column].y = anchorY - column * gapY;
      }

      const amt = (row / this.numStrands) * 360;
      const startHue = (hue(this.startColor) + amt) % 360;
      const endHue = (hue(this.endColor) + amt) % 360;

      this.strands[row] = new Strand(
        dataPoints,
        interpolationPoints,
        startHue,
        endHue,
        loopDuration
      );
    }

    this.#perlinNoise = new PerlinNoise(17, loopDuration);

    setInterval(() => {
      if (Math.random() < this.#warpProbability) {
        this.#warpState = "Increasing";
        setTimeout(() => (this.#warpState = "Decreasing"), 3000);
      }
    }, 3 * 1000);
  }

  draw() {
    this.strands.forEach((strand) => strand.draw());
  }

  move() {
    this.#perlinNoise.noiseStep(this.#warpState);
    this.strands.forEach((strand) =>
      strand.move([this.#perlinNoise.noiseEffect, stiffnessEffect])
    );
  }
}
