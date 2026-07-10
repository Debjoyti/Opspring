import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDashboardSession } from "@/lib/dashboard/session";
import { getOrCreateConversation, loadMessages } from "@/lib/services/ai/conversations";
import { AssistantChat } from "./chat";

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { user, organizations } = await getDashboardSession();
  if (!user) redirect("/login");
  if (organizations.length === 0) redirect("/onboarding");

  const { org: requestedOrgId } = await searchParams;
  const activeOrg = organizations.find((o) => o.id === requestedOrgId) ?? organizations[0];

  const supabase = await createClient();
  const conversation = await getOrCreateConversation(supabase, activeOrg.id, user.id);
  const initialMessages = await loadMessages(supabase, conversation.id);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">AI Assistant</h1>
        <p className="text-sm text-muted-foreground">Scoped to {activeOrg.name}.</p>
      </div>
      <AssistantChat
        orgId={activeOrg.id}
        conversationId={conversation.id}
        initialMessages={initialMessages}
      />
    </div>
  );
}
