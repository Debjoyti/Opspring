// Small, dependency-free forecasting + anomaly-detection primitives used by the
// analytics dashboard. Pure functions — unit tested in forecast.test.ts — so the
// "AI" numbers on the dashboard are deterministic and verifiable, not vibes.

export type Point = { label: string; value: number };

export type LinearFit = {
  slope: number;
  intercept: number;
  /** Coefficient of determination R² in [0,1]; how well the line fits. */
  r2: number;
};

/** Ordinary least-squares fit of y = slope·x + intercept over indices 0..n-1. */
export function linearFit(values: number[]): LinearFit {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0, r2: 0 };

  const xs = values.map((_, i) => i);
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;

  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = values[i] - meanY;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }

  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = meanY - slope * meanX;
  const r2 = syy === 0 ? 1 : Math.max(0, Math.min(1, (sxy * sxy) / (sxx * syy)));
  return { slope, intercept, r2 };
}

export type Forecast = {
  fit: LinearFit;
  /** Projected next values, length = periods. */
  predictions: number[];
  /** % change of the first projected period vs. the last actual. */
  nextChangePct: number | null;
  direction: "up" | "down" | "flat";
};

/**
 * Projects the next `periods` values from a least-squares trend. Predictions are
 * floored at 0 (a clinic can't bill negative revenue). `direction` uses the
 * slope relative to the series mean so tiny wobble reads as "flat".
 */
export function forecastSeries(values: number[], periods = 3): Forecast {
  const fit = linearFit(values);
  const n = values.length;
  const predictions = Array.from({ length: periods }, (_, k) =>
    Math.max(0, Math.round(fit.slope * (n + k) + fit.intercept)),
  );

  const mean = n ? values.reduce((a, b) => a + b, 0) / n : 0;
  const last = values[n - 1];
  const nextChangePct =
    last && predictions[0] != null ? ((predictions[0] - last) / last) * 100 : null;

  const rel = mean === 0 ? 0 : fit.slope / mean;
  const direction = rel > 0.02 ? "up" : rel < -0.02 ? "down" : "flat";

  return { fit, predictions, nextChangePct, direction };
}

export type Anomaly = { index: number; label: string; value: number; z: number };

/**
 * Flags points whose z-score exceeds `threshold` (default 2σ). Uses a sample
 * standard deviation; needs at least 4 points to be meaningful.
 */
export function detectAnomalies(points: Point[], threshold = 2): Anomaly[] {
  const n = points.length;
  if (n < 4) return [];
  const values = points.map((p) => p.value);
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  const sd = Math.sqrt(variance);
  if (sd === 0) return [];

  const out: Anomaly[] = [];
  points.forEach((p, index) => {
    const z = (p.value - mean) / sd;
    if (Math.abs(z) >= threshold) {
      out.push({ index, label: p.label, value: p.value, z: Math.round(z * 100) / 100 });
    }
  });
  return out;
}

/** Simple trailing moving average, aligned to the right edge of each window. */
export function movingAverage(values: number[], window: number): (number | null)[] {
  return values.map((_, i) => {
    if (i < window - 1) return null;
    let sum = 0;
    for (let k = 0; k < window; k++) sum += values[i - k];
    return sum / window;
  });
}
