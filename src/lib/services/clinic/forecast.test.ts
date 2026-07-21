import { describe, expect, it } from "vitest";
import { linearFit, forecastSeries, detectAnomalies, movingAverage } from "./forecast";

describe("linearFit", () => {
  it("recovers a perfect line (slope 2, intercept 1, R²=1)", () => {
    const fit = linearFit([1, 3, 5, 7, 9]);
    expect(fit.slope).toBeCloseTo(2);
    expect(fit.intercept).toBeCloseTo(1);
    expect(fit.r2).toBeCloseTo(1);
  });

  it("flat series has zero slope", () => {
    const fit = linearFit([5, 5, 5, 5]);
    expect(fit.slope).toBeCloseTo(0);
    expect(fit.intercept).toBeCloseTo(5);
  });

  it("degenerate single point does not throw", () => {
    expect(linearFit([42])).toEqual({ slope: 0, intercept: 42, r2: 0 });
  });
});

describe("forecastSeries", () => {
  it("projects an upward trend and reports direction up", () => {
    const f = forecastSeries([10, 20, 30, 40], 2);
    expect(f.direction).toBe("up");
    expect(f.predictions[0]).toBeCloseTo(50, -1);
    expect(f.predictions).toHaveLength(2);
  });

  it("floors predictions at zero for a steep decline", () => {
    const f = forecastSeries([100, 60, 20], 3);
    expect(f.direction).toBe("down");
    expect(Math.min(...f.predictions)).toBeGreaterThanOrEqual(0);
  });

  it("reads a nearly-flat series as flat", () => {
    const f = forecastSeries([100, 101, 99, 100, 100], 1);
    expect(f.direction).toBe("flat");
  });
});

describe("detectAnomalies", () => {
  it("flags an obvious spike beyond 2 sigma", () => {
    const points = [10, 11, 9, 10, 50, 10, 9].map((v, i) => ({ label: `m${i}`, value: v }));
    const anomalies = detectAnomalies(points);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].value).toBe(50);
    expect(anomalies[0].z).toBeGreaterThan(2);
  });

  it("returns nothing for a stable series", () => {
    const points = [10, 10, 11, 9, 10, 10].map((v, i) => ({ label: `m${i}`, value: v }));
    expect(detectAnomalies(points)).toEqual([]);
  });

  it("needs at least 4 points", () => {
    expect(detectAnomalies([{ label: "a", value: 1 }, { label: "b", value: 99 }])).toEqual([]);
  });
});

describe("movingAverage", () => {
  it("computes a trailing window and nulls the warmup", () => {
    expect(movingAverage([2, 4, 6, 8], 2)).toEqual([null, 3, 5, 7]);
  });
});
