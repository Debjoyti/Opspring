import { generateText } from "ai";
import { ASSISTANT_MODEL } from "@/lib/integrations/ai-gateway/model";
import type { ClinicAnalytics } from "./analytics";

/**
 * Optional LLM executive summary, layered on top of the deterministic insights.
 * It is *grounded*: the model receives only the already-computed numbers (never
 * raw patient rows) and is told to summarize them, not invent — the classic
 * "facts in the context, no hallucination" pattern.
 *
 * Degrades gracefully: with no AI_GATEWAY_API_KEY the dashboard still ships the
 * rule-based insights, so this is enhancement, never a hard dependency.
 */
export async function generateNarrative(
  orgName: string,
  a: ClinicAnalytics,
): Promise<{ available: boolean; text: string | null }> {
  if (!process.env.AI_GATEWAY_API_KEY) {
    return { available: false, text: null };
  }

  const facts = {
    org: orgName,
    range: a.range,
    kpis: a.kpis,
    revenueByMonth: a.revenueByMonth,
    revenueForecastNext3: a.forecast.revenue.predictions,
    forecastDirection: a.forecast.revenue.direction,
    topProcedures: a.topProceduresByRevenue,
    practitionerLoad: a.practitionerLoad,
    anomalies: a.anomalies,
  };

  try {
    const { text } = await generateText({
      model: ASSISTANT_MODEL,
      system:
        "You are a clinic operations analyst. You are given pre-computed metrics as JSON. " +
        "Write a tight 3-4 sentence executive summary for the clinic owner: what's happening " +
        "with revenue, one operational risk, and one concrete recommendation. Use only the " +
        "numbers provided — never invent figures. Amounts are Indian Rupees (₹).",
      prompt: `Metrics:\n${JSON.stringify(facts)}`,
    });
    return { available: true, text };
  } catch {
    return { available: false, text: null };
  }
}
