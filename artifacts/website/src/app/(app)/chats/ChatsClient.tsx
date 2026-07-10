"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { createClient } from "../../../lib/supabase/client";
import { useAuth } from "../../../contexts/AuthContext";

type ChatListItem = {
  id: string;
  name: string | null;
  is_group: boolean | null;
  avatar_url: string | null;
  updated_at: string;
  chat_members: {
    user_id: string;
    profiles: { id: string; display_name: string | null; avatar_url: string | null } | null;
  }[];
};

type Message = {
  id: string;
  chat_id: string;
  sender_id: string;
  encrypted_content: string | null;
  sent_at: string;
};

function chatTitle(chat: ChatListItem, myId: string | undefined): string {
  if (chat.name) return chat.name;
  const other = chat.chat_members.find((m) => m.user_id !== myId)?.profiles;
  return other?.display_name ?? "Direct message";
}

export default function ChatsClient({ activeChatId }: { activeChatId?: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    (async () => {
      const { data: memberRows } = await supabase
        .from("chat_members")
        .select("chat_id")
        .eq("user_id", user.id);
      const chatIds = (memberRows ?? []).map((r) => r.chat_id);
      if (chatIds.length === 0) {
        if (mounted) setChats([]);
        return;
      }
      const { data, error } = await supabase
        .from("chats")
        .select(
          `id, name, is_group, avatar_url, updated_at,
           chat_members(user_id, profiles(id, display_name, avatar_url))`,
        )
        .in("id", chatIds)
        .eq("is_archived", false)
        .order("updated_at", { ascending: false });
      if (!mounted) return;
      if (!error && data) setChats(data as unknown as ChatListItem[]);
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!activeChatId) {
      setMessages([]);
      return;
    }
    let mounted = true;
    (async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, chat_id, sender_id, encrypted_content, sent_at")
        .eq("chat_id", activeChatId)
        .order("sent_at", { ascending: true })
        .limit(200);
      if (!mounted) return;
      if (!error && data) setMessages(data as Message[]);
    })();

    const channel = supabase
      .channel(`room:${activeChatId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${activeChatId}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChatId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const text = draft.trim();
    if (!text || !activeChatId || !user) return;
    setDraft("");
    await supabase.from("messages").insert({
      chat_id: activeChatId,
      sender_id: user.id,
      encrypted_content: text,
    });
  }

  const activeChat = chats.find((c) => c.id === activeChatId);

  return (
    <div className="flex h-full">
      <div className="w-80 flex-none overflow-y-auto border-r border-black/5 bg-white">
        <div className="border-b border-black/5 px-4 py-4">
          <h1 className="text-lg font-semibold text-[#14161a]">Chats</h1>
        </div>
        {chats.length === 0 && <p className="px-4 py-6 text-sm text-[#6b7280]">No conversations yet.</p>}
        {chats.map((chat) => {
          const title = chatTitle(chat, user?.id);
          const isActive = chat.id === activeChatId;
          return (
            <button
              key={chat.id}
              onClick={() => router.push(`/chats/${chat.id}`)}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${
                isActive ? "bg-brand/10" : "hover:bg-black/[0.03]"
              }`}
            >
              <div className="flex h-10 w-10 flex-none items-center justify-center overflow-hidden rounded-full bg-black/5 text-sm font-semibold text-[#4b5563]">
                {chat.avatar_url ? (
                  <img src={chat.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  title.slice(0, 1).toUpperCase()
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[#14161a]">{title}</p>
                <p className="truncate text-xs text-[#6b7280]">
                  {new Date(chat.updated_at).toLocaleDateString()}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-1 flex-col">
        {!activeChatId && (
          <div className="flex flex-1 items-center justify-center text-sm text-[#6b7280]">
            Select a conversation to start chatting.
          </div>
        )}

        {activeChatId && (
          <>
            <div className="border-b border-black/5 bg-white px-5 py-4">
              <p className="text-sm font-medium text-[#14161a]">
                {activeChat ? chatTitle(activeChat, user?.id) : "Conversation"}
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="space-y-2">
                {messages.map((m) => {
                  const mine = m.sender_id === user?.id;
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-md rounded-2xl px-3.5 py-2 text-sm ${
                          mine ? "bg-brand text-white" : "bg-white text-[#14161a] shadow-sm"
                        }`}
                      >
                        {m.encrypted_content}
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
            </div>

            <div className="border-t border-black/5 bg-white px-5 py-4">
              <div className="flex items-center gap-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSend();
                  }}
                  placeholder="Message…"
                  className="flex-1 rounded-full border border-black/10 px-4 py-2.5 text-sm outline-none focus:border-brand"
                />
                <button
                  onClick={handleSend}
                  className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-brand text-white transition hover:opacity-90"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
