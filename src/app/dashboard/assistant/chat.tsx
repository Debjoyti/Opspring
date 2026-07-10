"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart, type UIMessage } from "ai";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AssistantChat({
  orgId,
  conversationId,
  initialMessages,
}: {
  orgId: string;
  conversationId: string;
  initialMessages: UIMessage[];
}) {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error } = useChat({
    id: conversationId,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/v1/assistant",
      headers: { "x-org-id": orgId },
      body: { conversationId },
    }),
  });

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto rounded-lg border p-4">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Ask about this organization&apos;s members, roles, or recent activity.
          </p>
        )}
        {messages.map((message) => (
          <div key={message.id} className="space-y-1">
            <div className="text-xs font-medium capitalize text-muted-foreground">
              {message.role}
            </div>
            {message.parts.map((part, index) => {
              if (part.type === "text") {
                return (
                  <p key={index} className="whitespace-pre-wrap text-sm">
                    {part.text}
                  </p>
                );
              }
              if (isToolUIPart(part)) {
                return (
                  <div
                    key={index}
                    className="rounded-md bg-secondary px-2 py-1 text-xs text-secondary-foreground"
                  >
                    tool: {part.type.replace("tool-", "")} ({part.state})
                  </div>
                );
              }
              return null;
            })}
          </div>
        ))}
        {error && <p className="text-sm text-destructive">Something went wrong.</p>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim()) {
            sendMessage({ text: input });
            setInput("");
          }
        }}
        className="mt-3 flex gap-2"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the assistant..."
          disabled={status !== "ready"}
        />
        <Button type="submit" disabled={status !== "ready" || !input.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}
