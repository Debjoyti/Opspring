#!/usr/bin/env node
// Fails the build if an /app/api/** route.ts has no recognized auth guard
// and isn't explicitly allow-listed as public. Run as `prebuild`.

import { globSync, readFileSync } from "node:fs";

const PUBLIC_ROUTES = new Set([
  // "src/app/api/v1/health/route.ts",
]);

const GUARD_MARKERS = ["withOrgAuth("];

const files = globSync("src/app/api/**/route.ts").map((f) => f.replace(/\\/g, "/"));
const violations = [];

for (const file of files) {
  if (PUBLIC_ROUTES.has(file)) continue;

  const contents = readFileSync(file, "utf8");
  const hasGuard = GUARD_MARKERS.some((marker) => contents.includes(marker));
  if (!hasGuard) violations.push(file);
}

if (violations.length > 0) {
  console.error("\n[check-route-guards] Unguarded API route(s) found:\n");
  for (const v of violations) console.error(`  - ${v}`);
  console.error(
    "\nWrap the handler with withOrgAuth(...) from @/lib/api/handler, or add it to PUBLIC_ROUTES in scripts/check-route-guards.mjs if it's intentionally public.\n",
  );
  process.exit(1);
}

console.log(`[check-route-guards] ${files.length} route(s) checked, all guarded.`);
