/**
 * Model id resolved through the Vercel AI Gateway (the default global
 * provider for the `ai` package — no provider-specific SDK package needed).
 * Requires AI_GATEWAY_API_KEY in the environment. Fetched from
 * https://ai-gateway.vercel.sh/v1/models at build time of this file —
 * re-check that list before bumping, never guess a model id from memory.
 */
export const ASSISTANT_MODEL = "anthropic/claude-sonnet-5";
