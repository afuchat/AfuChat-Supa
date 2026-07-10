"use client";

import ClientAuthGuard from "../../../../components/ClientAuthGuard";
import ChatsClient from "../ChatsClient";

export default function ChatConversationClient({ activeChatId }: { activeChatId: string }) {
  return (
    <ClientAuthGuard>
      <ChatsClient activeChatId={activeChatId} />
    </ClientAuthGuard>
  );
}
