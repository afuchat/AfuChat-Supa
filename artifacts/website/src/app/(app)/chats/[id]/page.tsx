import ChatsClient from "../ChatsClient";

export default async function ChatConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChatsClient activeChatId={id} />;
}
