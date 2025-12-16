function stiffnessEffect(strand, index) {
  const x = strand.pointsArray[index].x;
  const xinit = strand.initArray[index].x;

  const distance = Math.abs(x - xinit);
  const sign = Math.sign(x - xinit);

  return -sign * distance * distance * 0.0005;
}
