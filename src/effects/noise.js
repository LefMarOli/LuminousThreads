const noiseScaleX = 0.005;
const noiseScaleY = 0.005;
const noiseLevel = 10;
const TWO_PI = Math.PI * 2;
let z;
let w;
let R;

class PerlinNoise {
  #speedRadians;
  #angle;

  constructor(loopTime) {
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
    const point = strand.getPointAt(index);

    const x = point.x * noiseScaleX;
    const y = point.y * noiseScaleY;

    /*
    const nt = 0.01 * frameCount;
    const noise1 = noise(x, y, z);
    const noise2 = noise(x, y, z);
    const noise3 = noise(x, z, w);
    const noise4 = noise(y, z, w);
    */
    //const noiseValue = (noise1 + noise2 + noise3 + noise4) / 4;

    const noiseValue = fractalPerlinNoise4d(x, y, z, w);

    return noiseLevel * (noiseValue - 0.5);
  }
}
