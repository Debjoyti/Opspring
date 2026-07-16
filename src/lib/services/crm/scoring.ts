import { generateObject } from "ai";
import { z } from "zod";
import { ASSISTANT_MODEL } from "@/lib/integrations/ai-gateway/model";

export type LeadForScoring = {
  name: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  source?: string | null;
  status?: string | null;
  activityCount?: number;
};

export type LeadScore = { score: number; reason: string; source: "ai" | "rules" };

const FREE_MAIL = new Set([
  "gmail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
]);

const SENIOR_TITLE = /\b(ceo|cto|cfo|coo|chief|vp|vice president|head|director|founder|owner|president)\b/i;

/**
 * Deterministic rule-based score, always available. Used directly when no AI
 * Gateway key is configured, and as the fallback when the AI call fails.
 */
export function scoreLeadWithRules(lead: LeadForScoring): { score: number; reason: string } {
  let score = 10;
  const reasons: string[] = [];

  if (lead.email) {
    const domain = lead.email.split("@")[1]?.toLowerCase() ?? "";
    if (domain && !FREE_MAIL.has(domain)) {
      score += 25;
      reasons.push("business email");
    } else {
      score += 15;
      reasons.push("has email");
    }
  }
  if (lead.phone) {
    score += 10;
    reasons.push("has phone");
  }
  if (lead.company) {
    score += 15;
    reasons.push("company known");
  }
  if (lead.title) {
    if (SENIOR_TITLE.test(lead.title)) {
      score += 15;
      reasons.push("senior title");
    } else {
      score += 5;
      reasons.push("title known");
    }
  }

  const source = (lead.source ?? "").toLowerCase();
  if (source.includes("referral")) {
    score += 15;
    reasons.push("referral source");
  } else if (source.includes("event") || source.includes("webinar")) {
    score += 8;
    reasons.push("event source");
  } else if (source) {
    score += 4;
    reasons.push(`source: ${source}`);
  }

  if (lead.status === "qualified") {
    score += 15;
    reasons.push("already qualified");
  } else if (lead.status === "contacted") {
    score += 5;
    reasons.push("contacted");
  } else if (lead.status === "unqualified") {
    score -= 40;
    reasons.push("marked unqualified");
  }

  const activityBonus = Math.min(10, (lead.activityCount ?? 0) * 2);
  if (activityBonus > 0) {
    score += activityBonus;
    reasons.push(`${lead.activityCount} logged activities`);
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    reason: reasons.length > 0 ? reasons.join(", ") : "little information on record",
  };
}

const aiScoreSchema = z.object({
  score: z.number().int().min(0).max(100),
  reason: z.string().max(300),
});

async function scoreLeadWithAI(lead: LeadForScoring): Promise<{ score: number; reason: string }> {
  const { object } = await generateObject({
    model: ASSISTANT_MODEL,
    schema: aiScoreSchema,
    prompt: [
      "You are a B2B sales analyst. Score this lead from 0 (worthless) to 100 (hot) for sales-readiness and give a one-sentence reason.",
      "Consider seniority, company presence, contactability, source quality, and engagement.",
      `Lead: ${JSON.stringify({
        name: lead.name,
        company: lead.company ?? null,
        email: lead.email ?? null,
        phone: lead.phone ?? null,
        title: lead.title ?? null,
        source: lead.source ?? null,
        status: lead.status ?? null,
        logged_activities: lead.activityCount ?? 0,
      })}`,
    ].join("\n"),
  });
  return object;
}

/** AI score when the gateway is configured, rules otherwise (or on AI failure). */
export async function scoreLead(lead: LeadForScoring): Promise<LeadScore> {
  if (process.env.AI_GATEWAY_API_KEY) {
    try {
      const result = await scoreLeadWithAI(lead);
      return { ...result, source: "ai" };
    } catch {
      // fall through to rules
    }
  }
  return { ...scoreLeadWithRules(lead), source: "rules" };
}
