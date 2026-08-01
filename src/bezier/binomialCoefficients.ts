const MAX_DEGREE = 160;
const _binomialCoefficients: Record<number, Record<number, number>> = [];
const _factorials: number[] = [1];

function _fillFactorials(n: number): void {
  const prevLen = _factorials.length;

  for (let i = prevLen; i <= n; i++) _factorials[i] = i * _factorials[i - 1];
}

function _f(i: number): number {
  return _factorials[i];
}

function _fillCoefficients(_n: number): void {
  for (let n = 2; n <= _n; n++) {
    _binomialCoefficients[n] = {};

    for (let i = 1; i < n; i++) {
      _binomialCoefficients[n][i] = _f(n) / (_f(i) * _f(n - i));
    }
  }
}

export function binomialCoefficient(n: number, i: number): number {
  if (i === 0 || i === n) return 1;
  return _binomialCoefficients[n][i];
}

_fillFactorials(MAX_DEGREE + 1);
_fillCoefficients(MAX_DEGREE + 1);
