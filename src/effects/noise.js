const noiseScaleX = 0.005;
const noiseScaleY = 0.005;
const noiseLevel = 10;
const TWO_PI = Math.PI * 2;
let z;
let w;
let R;
let Simplex;

class PerlinNoise {
  #speedRadians;
  #angle;

  constructor(seed, loopTime) {
    Simplex = new SimplexNoise(seed ?? Math.random);

    this.#speedRadians = TWO_PI / (loopTime * 1000);
    this.#angle = 0;
    R = loopTime / 25.0;
    z = 0;
    w = R;
  }

  noiseStep() {
    this.#angle += this.#speedRadians * deltaTime;
    this.#angle %= TWO_PI;
    z = R * Math.cos(this.#angle);
    w = R * Math.sin(this.#angle);
  }

  noiseEffect(strand, index) {
    const point = strand.pointsArray[index];

    const x = point.x * noiseScaleX;
    const y = point.y * noiseScaleY;

    const noiseValue = Simplex.noise4D(x, y, z, w);
    return noiseLevel * noiseValue / 2.0;
  }
}
