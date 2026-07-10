export const dynamic = "force-static";
export function generateStaticParams() { return []; }

import ChatConversationClient from "./ChatConversationClient";

export default async function ChatConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChatConversationClient activeChatId={id} />;
}
