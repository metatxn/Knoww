export interface Observation {
  x: number;
  y: number;
}
export interface Estimate {
  m: number;
  s: number;
}
export const truth = (x: number) =>
  Math.sin(2 * Math.PI * (x * 0.95 + 0.12)) * 0.85 + 0.15 * Math.sin(9 * x);
export function seedPoints(): Observation[] {
  return [0.05, 0.16, 0.27, 0.71, 0.83, 0.94].map((x) => ({ x, y: truth(x) }));
}
const kernel = (a: number, b: number) => Math.exp(-((a - b) ** 2) / 0.02);

// Cholesky solves keep the illustrative GP stable when observations are close together.
export function posterior(points: Observation[], xs: number[]): Estimate[] {
  const n = points.length;
  if (!n) return xs.map(() => ({ m: 0, s: 1 }));
  const matrix: number[][] = Array.from({ length: n }, () =>
    Array<number>(n).fill(0)
  );
  for (let i = 0; i < n; i++)
    for (let j = 0; j <= i; j++) {
      let value = kernel(points[i].x, points[j].x) + (i === j ? 0.0025 : 0);
      for (let k = 0; k < j; k++) value -= matrix[i][k] * matrix[j][k];
      matrix[i][j] =
        i === j ? Math.sqrt(Math.max(value, 1e-12)) : value / matrix[j][j];
    }
  function forward(values: number[]) {
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      let value = values[i];
      for (let j = 0; j < i; j++) value -= matrix[i][j] * out[j];
      out[i] = value / matrix[i][i];
    }
    return out;
  }
  const y = forward(points.map((point) => point.y));
  const alpha: number[] = [];
  for (let i = n - 1; i >= 0; i--) {
    let value = y[i];
    for (let j = i + 1; j < n; j++) value -= matrix[j][i] * alpha[j];
    alpha[i] = value / matrix[i][i];
  }
  return xs.map((x) => {
    const ks = points.map((point) => kernel(x, point.x));
    const variance = forward(ks).reduce((sum, value) => sum + value * value, 0);
    return {
      m: ks.reduce((sum, value, i) => sum + value * alpha[i], 0),
      s: Math.sqrt(Math.max(1 - variance, 0) + 0.0025),
    };
  });
}
