const noiseScaleX = 0.005;
const noiseScaleY = 0.005;
const noiseLevel = 10;
const TWO_PI = Math.PI * 2;
let z;
let w;
let R;
let Simplex;
const maxWarpFactor = 1.5;
const minWarpFactor = 1.0;
const warpDelay = 1 / 1000;
let warpFactor = 1;
let blip = 'Off';

class PerlinNoise {
  #speedRadians;
  #angle;
  #warpProgress = 0;

  constructor(seed, loopTime) {
    Simplex = new SimplexNoise(seed ?? Math.random);

    this.#speedRadians = TWO_PI / (loopTime * 1000);
    this.#angle = 0;
    R = loopTime / 25.0;
    z = 0;
    w = R;
  }

  noiseStep(flag) {
    if (flag === "Increasing" && warpFactor < maxWarpFactor) {
      const current = sigmoid(this.#warpProgress);
      this.#warpProgress += deltaTime * warpDelay;
      const next = sigmoid(this.#warpProgress);
      warpFactor += next - current;
    } else if (flag === "Decreasing" && warpFactor > minWarpFactor) {
      const current = sigmoid(this.#warpProgress);
      this.#warpProgress -= deltaTime * warpDelay;
      const next = sigmoid(this.#warpProgress);
      warpFactor -= current - next;
    }
    //warpFactor = 1;

    this.#angle += this.#speedRadians * deltaTime;
    this.#angle %= TWO_PI;
    z = R * Math.cos(this.#angle);
    w = R * Math.sin(this.#angle);
  }

  noiseEffect(strand, index) {
    const point = strand.pointsArray[index];

    const x = point.x * noiseScaleX;
    const y = point.y * noiseScaleY;

    let az = z * warpFactor;
    let aw = w * warpFactor;

    const noiseValue = Simplex.noise4D(x, y, az, aw);
    return (noiseLevel * noiseValue) / 2.0;
  }
}
