import type { Strand } from "../strand";

let stiffnessCoefficient = 0.0005;

export function setStiffnessCoefficient(value: number): void {
  stiffnessCoefficient = value;
}

export function stiffnessEffect(strand: Strand, index: number): number {
  const x = strand.pointsArray[index].x;
  const xinit = strand.initArray[index].x;

  const distance = Math.abs(x - xinit);
  const sign = Math.sign(x - xinit);

  return -sign * distance * distance * stiffnessCoefficient;
}
