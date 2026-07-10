import {
  convertToModelMessages,
  createIdGenerator,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { withOrgAuth } from "@/lib/api/handler";
import { ASSISTANT_MODEL } from "@/lib/integrations/ai-gateway/model";
import { buildSystemPrompt } from "@/lib/services/ai/assistant";
import { buildAssistantTools } from "@/lib/services/ai/tools";
import { saveNewMessages } from "@/lib/services/ai/conversations";

export const maxDuration = 30;

const generateAssistantMessageId = createIdGenerator({ prefix: "asst", size: 16 });

export const POST = withOrgAuth(async (req, ctx) => {
  const { messages, conversationId } = (await req.json()) as {
    messages: UIMessage[];
    conversationId: string;
  };

  if (!conversationId) {
    return Response.json({ error: "missing conversationId" }, { status: 400 });
  }

  const tools = buildAssistantTools(ctx.supabase, ctx.orgId);

  const { data: org, error: orgError } = await ctx.supabase
    .from("organizations")
    .select("name")
    .eq("id", ctx.orgId)
    .single();
  if (orgError || !org) {
    return Response.json({ error: "organization not found" }, { status: 404 });
  }

  const result = streamText({
    model: ASSISTANT_MODEL,
    system: buildSystemPrompt(org.name, ctx.role),
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(5),
  });

  // Ensures the response is saved even if the client disconnects mid-stream.
  result.consumeStream();

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      generateMessageId: generateAssistantMessageId,
      onEnd: async ({ messages: finalMessages }) => {
        await saveNewMessages(ctx.supabase, conversationId, ctx.orgId, finalMessages);
      },
    }),
  });
});
