import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/handler";
import { enrollInCadence } from "@/lib/services/crm/cadences";
import { enrollInput } from "@/lib/services/crm/types";

/** The [id] segment sits before the /enroll suffix. */
function cadenceId(req: Request): string {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  return parts[parts.length - 2];
}

export const POST = withOrgAuth(async (req, ctx) => {
  const body = await req.json().catch(() => ({}));
  const parsed = enrollInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const result = await enrollInCadence(
    ctx.supabase,
    ctx.orgId,
    ctx.userId,
    cadenceId(req),
    parsed.data,
  );
  if (!result.ok) {
    const status =
      result.error === "already_enrolled"
        ? 409
        : ["cadence_not_found", "entity_not_found"].includes(result.error)
          ? 404
          : result.error === "cadence_inactive"
            ? 422
            : 500;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ data: result }, { status: 201 });
});
