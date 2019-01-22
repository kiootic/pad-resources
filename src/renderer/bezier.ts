export function bezier(t: number, a: number, b: number, c: number, d: number) {
  return a * Math.pow(1 - t, 3) + (3 * b * Math.pow(1 - t, 2) + (3 * c * (1 - t) + d * t) * t) * t;
}

function bezierD(t: number, a: number, b: number, c: number, d: number) {
  return 3 * Math.pow(1 - t, 2) * (b - a) + 6 * (1 - t) * t * (c - b) + 3 * t * t * (d - c);
}

export function solveBezier(x: number, a: number, b: number, c: number, d: number) {
  let t = x;
  t -= (bezier(t, a, b, c, d) - x) / bezierD(t, a, b, c, d);
  t -= (bezier(t, a, b, c, d) - x) / bezierD(t, a, b, c, d);
  t -= (bezier(t, a, b, c, d) - x) / bezierD(t, a, b, c, d);
  t -= (bezier(t, a, b, c, d) - x) / bezierD(t, a, b, c, d);
  t -= (bezier(t, a, b, c, d) - x) / bezierD(t, a, b, c, d);
  return t;
}
