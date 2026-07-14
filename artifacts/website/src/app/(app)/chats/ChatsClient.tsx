"use client";

import {
  useCallback, useEffect, useRef, useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  Send, Search, Phone, Video, MoreHorizontal, X,
  Smile, Paperclip, Mic, Check, CheckCheck,
  Pin, Users, Hash, ArrowLeft, ImageIcon,
  Reply, Info, ChevronDown,
} from "lucide-react";
import { createClient } from "../../../lib/supabase/client";
import { useAuth } from "../../../contexts/AuthContext";

/* ─── Types ───────────────────────────────────────────────────────────────── */

type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  handle: string | null;
  is_verified: boolean | null;
  current_grade: string | null;
  last_seen: string | null;
  show_online_status: boolean | null;
};

type ChatMember = {
  user_id: string;
  profiles: Profile | null;
};

type Message = {
  id: string;
  chat_id: string;
  sender_id: string;
  encrypted_content: string | null;
  sent_at: string;
  attachment_type: string | null;
  attachment_url: string | null;
  reply_to_message_id: string | null;
  profiles?: Profile | null;
  reactions?: { emoji: string; count: number; mine: boolean }[];
  _pending?: boolean;
};

type ChatListItem = {
  id: string;
  name: string | null;
  is_group: boolean | null;
  is_channel: boolean | null;
  is_pinned: boolean | null;
  avatar_url: string | null;
  updated_at: string;
  chat_members: ChatMember[];
  lastMessage?: Message | null;
  unreadCount?: number;
};

const COMMON_EMOJIS = ["❤️","😂","😮","😢","😡","👍","👎","🔥","🎉","✅"];

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "Yesterday";
  if (d < 7) return new Date(iso).toLocaleDateString([], { weekday: "short" });
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

function msgTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function dateHeader(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString([], { weekday: "long" });
  return d.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
}

function lastSeenLabel(ts: string | null | undefined, showStatus: boolean | null): string {
  if (!showStatus) return "";
  if (!ts) return "last seen recently";
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 2 * 60_000) return "Online";
  if (diff < 3600_000) return `last seen ${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `last seen ${Math.floor(diff / 3600_000)}h ago`;
  return `last seen ${new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" })}`;
}

function isOnline(ts: string | null | undefined, showStatus: boolean | null): boolean {
  if (!showStatus || !ts) return false;
  return Date.now() - new Date(ts).getTime() < 2 * 60_000;
}

function msgPreview(msg: Message | null | undefined, myId: string | undefined): string {
  if (!msg) return "";
  const mine = msg.sender_id === myId;
  const who = mine ? "You: " : "";
  const type = msg.attachment_type;
  if (type === "image") return `${who}📷 Photo`;
  if (type === "video") return `${who}🎥 Video`;
  if (type === "audio") return `${who}🎤 Voice message`;
  if (type === "file") return `${who}📎 File`;
  if (type === "sticker") return `${who}🎨 Sticker`;
  if (type === "payment") return `${who}💰 Payment`;
  if (type === "story_reply") return `${who}↩️ Replied to story`;
  return `${who}${msg.encrypted_content ?? ""}`;
}

function chatTitle(chat: ChatListItem, myId: string | undefined): string {
  if (chat.name) return chat.name;
  const other = chat.chat_members.find((m) => m.user_id !== myId)?.profiles;
  return other?.display_name ?? "Direct message";
}

function chatAvatar(chat: ChatListItem, myId: string | undefined): string | null {
  if (chat.avatar_url) return chat.avatar_url;
  if (chat.is_group || chat.is_channel) return null;
  return chat.chat_members.find((m) => m.user_id !== myId)?.profiles?.avatar_url ?? null;
}

function otherProfile(chat: ChatListItem, myId: string | undefined): Profile | null {
  return chat.chat_members.find((m) => m.user_id !== myId)?.profiles ?? null;
}

/* ─── Avatar ──────────────────────────────────────────────────────────────── */

function Avatar({
  url, name, size = 40, online = false, square = false,
}: {
  url?: string | null; name?: string | null; size?: number;
  online?: boolean; square?: boolean;
}) {
  return (
    <div className="relative flex-none" style={{ width: size, height: size }}>
      <div
        className={`flex h-full w-full items-center justify-center overflow-hidden font-bold text-[#5a5040] bg-gradient-to-br from-[#e8e2d6] to-[#d8d0c4] ${square ? "rounded-xl" : "rounded-full"}`}
        style={{ fontSize: Math.max(11, size * 0.38) }}
      >
        {url
          ? <img src={url} alt="" className="h-full w-full object-cover" />
          : (name ?? "?")[0].toUpperCase()}
      </div>
      {online && (
        <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#f5f0e8] bg-emerald-500" />
      )}
    </div>
  );
}

/* ─── Chat list item ──────────────────────────────────────────────────────── */

function ChatRow({
  chat, myId, active, onClick,
}: {
  chat: ChatListItem; myId: string | undefined; active: boolean; onClick: () => void;
}) {
  const title = chatTitle(chat, myId);
  const avatar = chatAvatar(chat, myId);
  const other = otherProfile(chat, myId);
  const online = !chat.is_group && !chat.is_channel && isOnline(other?.last_seen, other?.show_online_status);
  const unread = chat.unreadCount ?? 0;
  const preview = msgPreview(chat.lastMessage, myId);

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-all ${
        active
          ? "bg-[#1f95ff]/10 border-r-2 border-[#1f95ff]"
          : "hover:bg-[#e8e2d6]/60"
      }`}
    >
      <Avatar url={avatar} name={title} size={50} online={online} square={!!(chat.is_group || chat.is_channel)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1">
          <div className="flex min-w-0 items-center gap-1.5">
            {chat.is_pinned && <Pin size={10} className="flex-none text-[#8c7f6a]" />}
            {chat.is_channel && <Hash size={11} className="flex-none text-[#1f95ff]" />}
            {chat.is_group && !chat.is_channel && <Users size={11} className="flex-none text-[#8c7f6a]" />}
            <span className={`truncate text-[13.5px] font-semibold ${active ? "text-[#1f95ff]" : "text-[#000]"}`}>
              {title}
            </span>
          </div>
          {chat.lastMessage && (
            <span className="flex-none text-[11px] text-[#8c7f6a]">{timeAgo(chat.lastMessage.sent_at)}</span>
          )}
        </div>
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <p className={`truncate text-[12px] ${unread > 0 ? "font-semibold text-[#000]" : "text-[#8c7f6a]"}`}>
            {preview || <span className="italic text-[#b0a898]">No messages yet</span>}
          </p>
          {unread > 0 && (
            <span className="flex-none flex h-5 min-w-5 items-center justify-center rounded-full bg-[#1f95ff] px-1.5 text-[10px] font-bold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

/* ─── Date separator ──────────────────────────────────────────────────────── */

function DateSep({ label }: { label: string }) {
  return (
    <div className="my-4 flex items-center gap-3 px-4">
      <div className="flex-1 border-t border-[#e6e0d4]" />
      <span className="rounded-full bg-[#e8e2d6] px-3 py-1 text-[11px] font-semibold text-[#8c7f6a]">
        {label}
      </span>
      <div className="flex-1 border-t border-[#e6e0d4]" />
    </div>
  );
}

/* ─── Reply preview strip ─────────────────────────────────────────────────── */

function ReplyPreview({
  msg, onClear,
}: {
  msg: Message; onClear: () => void;
}) {
  return (
    <div className="flex items-start gap-2 border-l-4 border-[#1f95ff] bg-[#1f95ff]/8 px-4 py-2">
      <Reply size={14} className="mt-0.5 flex-none text-[#1f95ff]" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold text-[#1f95ff]">
          {msg.profiles?.display_name ?? "User"}
        </p>
        <p className="truncate text-[12px] text-[#5a5040]">
          {msg.attachment_type ? `📎 ${msg.attachment_type}` : (msg.encrypted_content ?? "")}
        </p>
      </div>
      <button onClick={onClear} className="flex-none text-[#8c7f6a] hover:text-[#000] transition">
        <X size={14} />
      </button>
    </div>
  );
}

/* ─── Message bubble ──────────────────────────────────────────────────────── */

function MsgBubble({
  msg, mine, showAvatar, isGroup, onReply, onReact, myId,
  allMessages,
}: {
  msg: Message; mine: boolean; showAvatar: boolean; isGroup: boolean;
  onReply: (m: Message) => void; onReact: (id: string, emoji: string) => void;
  myId: string | undefined; allMessages: Message[];
}) {
  const [showEmoji, setShowEmoji] = useState(false);
  const replyTo = msg.reply_to_message_id
    ? allMessages.find((m) => m.id === msg.reply_to_message_id)
    : null;

  const hasImage = msg.attachment_url && msg.attachment_type === "image";
  const hasAudio = msg.attachment_url && msg.attachment_type === "audio";
  const isSpecial = ["payment", "sticker"].includes(msg.attachment_type ?? "");

  return (
    <div
      className={`group flex items-end gap-2 px-4 mb-0.5 ${mine ? "flex-row-reverse" : "flex-row"}`}
    >
      {/* Avatar (group chats, other people, and only on last msg in run) */}
      {!mine && isGroup ? (
        <div className="flex-none" style={{ width: 32, height: 32 }}>
          {showAvatar && (
            <Avatar url={msg.profiles?.avatar_url} name={msg.profiles?.display_name} size={32} />
          )}
        </div>
      ) : null}

      <div className={`flex max-w-[72%] flex-col gap-0.5 ${mine ? "items-end" : "items-start"}`}>
        {/* Sender name in group */}
        {!mine && isGroup && showAvatar && (
          <span className="ml-1 text-[11px] font-semibold text-[#1f95ff]">
            {msg.profiles?.display_name ?? "User"}
          </span>
        )}

        {/* Reply strip inside bubble */}
        {replyTo && (
          <div className={`w-full rounded-t-xl border-l-4 border-[#1f95ff] px-3 py-1.5 text-[11px] ${
            mine ? "bg-[#1a7fd4] text-white/80" : "bg-[#e0ddd6] text-[#5a5040]"
          }`}>
            <p className="font-semibold text-[#1f95ff] text-[10px]">
              {replyTo.profiles?.display_name ?? "User"}
            </p>
            <p className="truncate">
              {replyTo.encrypted_content ?? `📎 ${replyTo.attachment_type}`}
            </p>
          </div>
        )}

        {/* Bubble */}
        <div
          className={`relative rounded-2xl px-3.5 py-2.5 shadow-sm ${
            mine
              ? "rounded-br-sm bg-[#1f95ff] text-white"
              : "rounded-bl-sm bg-white text-[#000] border border-[#e6e0d4]"
          } ${msg._pending ? "opacity-60" : ""}`}
        >
          {/* Image attachment */}
          {hasImage && (
            <div className="mb-1.5 overflow-hidden rounded-xl">
              <img
                src={msg.attachment_url!}
                alt="attachment"
                className="max-h-[260px] w-full max-w-[280px] cursor-pointer object-cover"
              />
            </div>
          )}

          {/* Audio placeholder */}
          {hasAudio && (
            <div className={`flex items-center gap-2 py-1 ${mine ? "text-white" : "text-[#5a5040]"}`}>
              <Mic size={16} />
              <div className="flex gap-0.5">
                {[3,5,8,5,3,7,4,6,3,5].map((h, i) => (
                  <div key={i} className={`w-0.5 rounded-full opacity-60 ${mine ? "bg-white" : "bg-[#8c7f6a]"}`}
                    style={{ height: h * 2.5 }} />
                ))}
              </div>
              <span className="text-[11px] opacity-70">0:07</span>
            </div>
          )}

          {/* Special bubble */}
          {isSpecial && (
            <div className={`text-xs italic ${mine ? "text-white/80" : "text-[#8c7f6a]"}`}>
              {msg.attachment_type === "payment" ? "💰 Payment" : "🎨 Sticker"}
            </div>
          )}

          {/* Text */}
          {msg.encrypted_content && (
            <p className="text-[14px] leading-[1.45] whitespace-pre-wrap break-words">
              {msg.encrypted_content}
            </p>
          )}

          {/* Time + ticks */}
          <div className={`mt-0.5 flex items-center justify-end gap-1 ${
            mine ? "text-white/60" : "text-[#b0a898]"
          }`}>
            <span className="text-[10px]">{msgTime(msg.sent_at)}</span>
            {mine && (
              msg._pending
                ? <Check size={12} />
                : <CheckCheck size={12} className="text-white/80" />
            )}
          </div>
        </div>

        {/* Reactions */}
        {(msg.reactions?.length ?? 0) > 0 && (
          <div className={`flex flex-wrap gap-1 ${mine ? "justify-end" : "justify-start"}`}>
            {msg.reactions!.map((r, i) => (
              <button
                key={i}
                onClick={() => onReact(msg.id, r.emoji)}
                className={`flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px] transition hover:bg-[#e8e2d6] ${
                  r.mine ? "border-[#1f95ff] bg-[#1f95ff]/10" : "border-[#e6e0d4] bg-white"
                }`}
              >
                {r.emoji} {r.count > 1 && <span className="text-[10px] text-[#5a5040]">{r.count}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Hover actions */}
      <div className={`hidden group-hover:flex items-center gap-0.5 mb-1 ${mine ? "flex-row-reverse" : "flex-row"}`}>
        <button
          onClick={() => onReply(msg)}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-[#e8e2d6] text-[#5a5040] transition hover:bg-[#ddd7c9]"
        >
          <Reply size={13} />
        </button>
        <div className="relative">
          <button
            onClick={() => setShowEmoji((v) => !v)}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-[#e8e2d6] text-[#5a5040] transition hover:bg-[#ddd7c9]"
          >
            <Smile size={13} />
          </button>
          {showEmoji && (
            <div className={`absolute bottom-9 z-20 flex gap-1 rounded-2xl border border-[#e6e0d4] bg-white p-2 shadow-lg ${mine ? "right-0" : "left-0"}`}>
              {COMMON_EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => { onReact(msg.id, e); setShowEmoji(false); }}
                  className="rounded-lg p-1 text-lg transition hover:bg-[#f0ebe2]"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Typing indicator ────────────────────────────────────────────────────── */

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2 px-4 pb-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e8e2d6]">
        <span className="text-xs font-bold text-[#5a5040]">…</span>
      </div>
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm border border-[#e6e0d4] bg-white px-3.5 py-2.5 shadow-sm">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2 w-2 rounded-full bg-[#8c7f6a] animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}

/* ─── Empty state ─────────────────────────────────────────────────────────── */

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#1f95ff]/10 text-[#1f95ff]">
        <Send size={36} strokeWidth={1.5} />
      </div>
      <div>
        <p className="text-[16px] font-bold text-[#000]">Your messages</p>
        <p className="mt-1 text-[13px] text-[#8c7f6a]">
          Select a conversation from the left to start chatting
        </p>
      </div>
    </div>
  );
}

/* ─── Main component ──────────────────────────────────────────────────────── */

export default function ChatsClient({ activeChatId }: { activeChatId?: string }) {
  const { user, profile } = useAuth();
  const router = useRouter();
  const supabase = createClient();
  const myId = user?.id;

  /* ── State ────────────────────────────────────────────────────────────── */
  const [chats, setChats]           = useState<ChatListItem[]>([]);
  const [messages, setMessages]     = useState<Message[]>([]);
  const [draft, setDraft]           = useState("");
  const [searchQ, setSearchQ]       = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [msgSearch, setMsgSearch]   = useState("");
  const [showMsgSearch, setShowMsgSearch] = useState(false);
  const [replyTo, setReplyTo]       = useState<Message | null>(null);
  const [typing, setTyping]         = useState(false);
  const [remoteTyping, setRemoteTyping] = useState(false);
  const [tab, setTab]               = useState<"all"|"unread"|"groups">("all");
  const [chatsLoading, setChatsLoading] = useState(true);
  const [msgsLoading, setMsgsLoading]   = useState(false);
  const [showInfo, setShowInfo]     = useState(false);

  const bottomRef    = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLTextAreaElement>(null);
  const typingTimer  = useRef<ReturnType<typeof setTimeout>>(null);

  /* ── Active chat helpers ──────────────────────────────────────────────── */
  const activeChat = chats.find((c) => c.id === activeChatId);
  const isGroup = !!(activeChat?.is_group || activeChat?.is_channel);
  const other = activeChat ? otherProfile(activeChat, myId) : null;
  const presenceStatus = other ? lastSeenLabel(other.last_seen, other.show_online_status) : "";
  const onlineNow = other ? isOnline(other.last_seen, other.show_online_status) : false;

  /* ── Load chat list ───────────────────────────────────────────────────── */
  useEffect(() => {
    if (!myId) return;
    let mounted = true;
    setChatsLoading(true);

    (async () => {
      // 1. Get chat IDs
      const { data: memberRows } = await supabase
        .from("chat_members")
        .select("chat_id")
        .eq("user_id", myId);
      const chatIds = (memberRows ?? []).map((r: any) => r.chat_id);
      if (!chatIds.length) { if (mounted) { setChats([]); setChatsLoading(false); } return; }

      // 2. Fetch chats + members + profiles
      const { data: chatData } = await supabase
        .from("chats")
        .select(`id, name, is_group, is_channel, is_pinned, avatar_url, updated_at,
          chat_members(user_id, profiles(id, display_name, avatar_url, handle, is_verified, current_grade, last_seen, show_online_status))`)
        .in("id", chatIds)
        .eq("is_archived", false)
        .order("updated_at", { ascending: false });
      if (!mounted || !chatData) { setChatsLoading(false); return; }

      // 3. Fetch latest messages (bulk — pick first per chat in JS)
      const { data: recentMsgs } = await supabase
        .from("messages")
        .select("id, chat_id, sender_id, encrypted_content, sent_at, attachment_type")
        .in("chat_id", chatIds)
        .order("sent_at", { ascending: false })
        .limit(chatIds.length * 3);

      // 4. Fetch unread counts
      const { data: statusRows } = await supabase
        .from("message_status")
        .select("message_id")
        .eq("user_id", myId)
        .not("read_at", "is", null);
      const readIds = new Set((statusRows ?? []).map((r: any) => r.message_id));

      // Build lastMessage map + unread
      const lastMsgMap: Record<string, Message> = {};
      const unreadMap: Record<string, number> = {};
      for (const m of (recentMsgs ?? []) as Message[]) {
        if (!lastMsgMap[m.chat_id]) lastMsgMap[m.chat_id] = m;
        if (m.sender_id !== myId && !readIds.has(m.id)) {
          unreadMap[m.chat_id] = (unreadMap[m.chat_id] ?? 0) + 1;
        }
      }

      const enriched = (chatData as unknown as ChatListItem[]).map((c) => ({
        ...c,
        lastMessage: lastMsgMap[c.id] ?? null,
        unreadCount: unreadMap[c.id] ?? 0,
      }));
      // Sort pinned first, then by updatedAt
      enriched.sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });

      if (mounted) { setChats(enriched); setChatsLoading(false); }
    })();

    // Real-time: listen for new messages to update list
    const listSub = supabase
      .channel(`chatlist:${myId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const nm = payload.new as Message;
          setChats((prev) => prev.map((c) => {
            if (c.id !== nm.chat_id) return c;
            return {
              ...c,
              lastMessage: nm,
              updated_at: nm.sent_at,
              unreadCount: nm.sender_id !== myId ? (c.unreadCount ?? 0) + 1 : c.unreadCount,
            };
          }).sort((a, b) => {
            if (a.is_pinned && !b.is_pinned) return -1;
            if (!a.is_pinned && b.is_pinned) return 1;
            return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
          }));
        })
      .subscribe();

    return () => { mounted = false; supabase.removeChannel(listSub); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId]);

  /* ── Load messages for active chat ───────────────────────────────────── */
  useEffect(() => {
    if (!activeChatId) { setMessages([]); return; }
    let mounted = true;
    setMsgsLoading(true);

    (async () => {
      const { data, error } = await supabase
        .from("messages")
        .select(`id, chat_id, sender_id, encrypted_content, sent_at,
          attachment_type, attachment_url, reply_to_message_id,
          profiles!sender_id(id, display_name, avatar_url, handle, is_verified, current_grade)`)
        .eq("chat_id", activeChatId)
        .order("sent_at", { ascending: true })
        .limit(200);
      if (!mounted) return;

      if (!error && data) {
        const msgs = data as unknown as Message[];
        // Fetch reactions
        if (msgs.length) {
          const { data: rxns } = await supabase
            .from("message_reactions")
            .select("message_id, reaction, user_id")
            .in("message_id", msgs.map((m) => m.id));
          if (rxns) {
            const rxMap: Record<string, { emoji: string; count: number; mine: boolean }[]> = {};
            for (const r of rxns as any[]) {
              if (!rxMap[r.message_id]) rxMap[r.message_id] = [];
              const existing = rxMap[r.message_id].find((x) => x.emoji === r.reaction);
              if (existing) { existing.count++; if (r.user_id === myId) existing.mine = true; }
              else rxMap[r.message_id].push({ emoji: r.reaction, count: 1, mine: r.user_id === myId });
            }
            msgs.forEach((m) => { m.reactions = rxMap[m.id] ?? []; });
          }
        }
        setMessages(msgs);
      }
      setMsgsLoading(false);

      // Mark messages as read
      if (myId && data) {
        const unreadIds = (data as any[])
          .filter((m) => m.sender_id !== myId)
          .map((m) => ({ message_id: m.id, user_id: myId, read_at: new Date().toISOString() }));
        if (unreadIds.length) {
          await supabase.from("message_status").upsert(unreadIds, { ignoreDuplicates: true });
          setChats((prev) => prev.map((c) =>
            c.id === activeChatId ? { ...c, unreadCount: 0 } : c
          ));
        }
      }
    })();

    // Real-time messages
    const msgSub = supabase
      .channel(`room:${activeChatId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${activeChatId}` },
        async (payload) => {
          const nm = payload.new as Message;
          // Fetch sender profile
          const { data: prof } = await supabase
            .from("profiles")
            .select("id, display_name, avatar_url, handle, is_verified, current_grade")
            .eq("id", nm.sender_id)
            .single();
          nm.profiles = prof as Profile;
          nm.reactions = [];
          setMessages((prev) => [...prev, nm]);
          // Mark as read immediately if not mine
          if (myId && nm.sender_id !== myId) {
            await supabase.from("message_status").upsert(
              [{ message_id: nm.id, user_id: myId, read_at: new Date().toISOString() }],
              { ignoreDuplicates: true }
            );
          }
        })
      .subscribe();

    // Typing indicator via broadcast
    const typingSub = supabase
      .channel(`typing:${activeChatId}`)
      .on("broadcast", { event: "typing" }, (payload) => {
        if (payload.payload?.userId !== myId) {
          setRemoteTyping(true);
          clearTimeout(typingTimer.current!);
          typingTimer.current = setTimeout(() => setRemoteTyping(false), 3000);
        }
      })
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(msgSub);
      supabase.removeChannel(typingSub);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChatId, myId]);

  /* ── Scroll to bottom on new messages ────────────────────────────────── */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, remoteTyping]);

  /* ── Typing broadcast ─────────────────────────────────────────────────── */
  function handleTyping(val: string) {
    setDraft(val);
    if (!activeChatId || !myId) return;
    if (!typing) {
      setTyping(true);
      supabase.channel(`typing:${activeChatId}`).send({
        type: "broadcast", event: "typing", payload: { userId: myId },
      });
    }
    clearTimeout(typingTimer.current!);
    typingTimer.current = setTimeout(() => setTyping(false), 2000);
  }

  /* ── Send message ─────────────────────────────────────────────────────── */
  async function handleSend() {
    const text = draft.trim();
    if (!text || !activeChatId || !myId) return;
    setDraft("");
    setReplyTo(null);

    // Optimistic
    const optimistic: Message = {
      id: `pending-${Date.now()}`,
      chat_id: activeChatId,
      sender_id: myId,
      encrypted_content: text,
      sent_at: new Date().toISOString(),
      attachment_type: null,
      attachment_url: null,
      reply_to_message_id: replyTo?.id ?? null,
      profiles: profile as unknown as Profile,
      reactions: [],
      _pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);

    await supabase.from("messages").insert({
      chat_id: activeChatId,
      sender_id: myId,
      encrypted_content: text,
      reply_to_message_id: replyTo?.id ?? null,
    });

    // Remove optimistic after real one arrives via subscription
    setTimeout(() => {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    }, 3000);
  }

  /* ── React to message ─────────────────────────────────────────────────── */
  async function handleReact(msgId: string, emoji: string) {
    if (!myId) return;
    const msg = messages.find((m) => m.id === msgId);
    const existing = msg?.reactions?.find((r) => r.emoji === emoji && r.mine);
    if (existing) {
      await supabase.from("message_reactions")
        .delete().eq("message_id", msgId).eq("user_id", myId).eq("reaction", emoji);
    } else {
      await supabase.from("message_reactions")
        .upsert({ message_id: msgId, user_id: myId, reaction: emoji });
    }
    // Refresh reactions for this message
    const { data: rxns } = await supabase
      .from("message_reactions")
      .select("message_id, reaction, user_id")
      .eq("message_id", msgId);
    if (rxns) {
      const grouped: { emoji: string; count: number; mine: boolean }[] = [];
      for (const r of rxns as any[]) {
        const ex = grouped.find((x) => x.emoji === r.reaction);
        if (ex) { ex.count++; if (r.user_id === myId) ex.mine = true; }
        else grouped.push({ emoji: r.reaction, count: 1, mine: r.user_id === myId });
      }
      setMessages((prev) => prev.map((m) =>
        m.id === msgId ? { ...m, reactions: grouped } : m
      ));
    }
  }

  /* ── Filtered chats ───────────────────────────────────────────────────── */
  const filteredChats = chats.filter((c) => {
    const title = chatTitle(c, myId).toLowerCase();
    if (searchQ && !title.includes(searchQ.toLowerCase())) return false;
    if (tab === "unread") return (c.unreadCount ?? 0) > 0;
    if (tab === "groups") return !!(c.is_group || c.is_channel);
    return true;
  });

  /* ── Filtered messages ────────────────────────────────────────────────── */
  const displayMsgs = msgSearch
    ? messages.filter((m) => m.encrypted_content?.toLowerCase().includes(msgSearch.toLowerCase()))
    : messages;

  /* ── Build message list with date separators ──────────────────────────── */
  type ListItem = { type: "date"; label: string; key: string } | { type: "msg"; msg: Message; showAvatar: boolean };
  const listItems: ListItem[] = [];
  let lastDate = "";
  for (let i = 0; i < displayMsgs.length; i++) {
    const m = displayMsgs[i];
    const dh = dateHeader(m.sent_at);
    if (dh !== lastDate) { listItems.push({ type: "date", label: dh, key: `date-${dh}` }); lastDate = dh; }
    const next = displayMsgs[i + 1];
    const isLastInRun = !next || next.sender_id !== m.sender_id
      || new Date(next.sent_at).getTime() - new Date(m.sent_at).getTime() > 5 * 60_000;
    listItems.push({ type: "msg", msg: m, showAvatar: isLastInRun });
  }

  /* ── Render ───────────────────────────────────────────────────────────── */
  return (
    <div className="flex h-full overflow-hidden bg-[#f5f0e8]">

      {/* ══ Sidebar ══════════════════════════════════════════════════════ */}
      <aside className="flex w-[320px] flex-none flex-col border-r border-[#e6e0d4] bg-[#ede8dc]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#e6e0d4] px-4 py-3.5">
          {showSearch ? (
            <div className="flex flex-1 items-center gap-2">
              <input
                autoFocus
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Search conversations…"
                className="flex-1 bg-transparent text-[13px] text-[#000] outline-none placeholder:text-[#8c7f6a]"
              />
              <button onClick={() => { setShowSearch(false); setSearchQ(""); }}
                className="text-[#8c7f6a] hover:text-[#000] transition">
                <X size={16} />
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-[16px] font-bold text-[#000]">Messages</h2>
              <button onClick={() => setShowSearch(true)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[#5a5040] transition hover:bg-[#e8e2d6]">
                <Search size={16} />
              </button>
            </>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#e6e0d4]">
          {(["all","unread","groups"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`relative flex-1 py-2.5 text-[12px] font-semibold capitalize transition ${
                tab === t ? "text-[#1f95ff]" : "text-[#8c7f6a] hover:text-[#5a5040]"
              }`}>
              {t}
              {tab === t && <span className="absolute bottom-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-[#1f95ff]" />}
            </button>
          ))}
        </div>

        {/* Chat list */}
        <div className="flex-1 overflow-y-auto">
          {chatsLoading && (
            <div className="space-y-0">
              {[1,2,3,4,5].map((i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className="h-12 w-12 flex-none animate-pulse rounded-full bg-[#e0d9d0]" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-24 animate-pulse rounded bg-[#e0d9d0]" />
                    <div className="h-3 w-32 animate-pulse rounded bg-[#e0d9d0]" />
                  </div>
                </div>
              ))}
            </div>
          )}
          {!chatsLoading && filteredChats.length === 0 && (
            <div className="px-4 py-10 text-center">
              <p className="text-[13px] text-[#8c7f6a]">
                {tab === "unread" ? "No unread messages" : tab === "groups" ? "No groups yet" : "No conversations yet"}
              </p>
            </div>
          )}
          {filteredChats.map((chat) => (
            <ChatRow
              key={chat.id}
              chat={chat}
              myId={myId}
              active={chat.id === activeChatId}
              onClick={() => router.push(`/chats/${chat.id}`)}
            />
          ))}
        </div>

        {/* My profile mini */}
        {profile && (
          <div className="flex items-center gap-2.5 border-t border-[#e6e0d4] px-4 py-3">
            <Avatar url={profile.avatar_url} name={profile.display_name} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold text-[#000]">{profile.display_name}</p>
              <p className="truncate text-[11px] text-[#8c7f6a]">@{profile.handle}</p>
            </div>
          </div>
        )}
      </aside>

      {/* ══ Main chat area ════════════════════════════════════════════════ */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {!activeChatId && <EmptyState />}

        {activeChatId && (
          <>
            {/* ── Header ── */}
            <header className="flex items-center gap-3 border-b border-[#e6e0d4] bg-[#ede8dc] px-5 py-3.5">
              <button
                onClick={() => router.push("/chats")}
                className="mr-1 flex h-8 w-8 items-center justify-center rounded-full text-[#5a5040] transition hover:bg-[#e8e2d6] lg:hidden"
              >
                <ArrowLeft size={18} />
              </button>

              <Avatar
                url={activeChat ? chatAvatar(activeChat, myId) : null}
                name={activeChat ? chatTitle(activeChat, myId) : ""}
                size={42}
                online={onlineNow}
                square={isGroup}
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-[15px] font-bold text-[#000]">
                    {activeChat ? chatTitle(activeChat, myId) : "Conversation"}
                  </p>
                  {isGroup && <Users size={13} className="flex-none text-[#8c7f6a]" />}
                </div>
                {!isGroup && presenceStatus && (
                  <p className={`text-[12px] ${onlineNow ? "font-semibold text-emerald-600" : "text-[#8c7f6a]"}`}>
                    {presenceStatus}
                  </p>
                )}
                {isGroup && activeChat && (
                  <p className="text-[12px] text-[#8c7f6a]">
                    {activeChat.chat_members.length} member{activeChat.chat_members.length !== 1 ? "s" : ""}
                  </p>
                )}
              </div>

              {/* Header actions */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowMsgSearch((v) => !v)}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-[#5a5040] transition hover:bg-[#e8e2d6]"
                >
                  <Search size={17} />
                </button>
                <button className="flex h-9 w-9 items-center justify-center rounded-full text-[#5a5040] transition hover:bg-[#e8e2d6]">
                  <Phone size={17} />
                </button>
                <button className="flex h-9 w-9 items-center justify-center rounded-full text-[#5a5040] transition hover:bg-[#e8e2d6]">
                  <Video size={17} />
                </button>
                <button
                  onClick={() => setShowInfo((v) => !v)}
                  className={`flex h-9 w-9 items-center justify-center rounded-full transition ${showInfo ? "bg-[#1f95ff]/10 text-[#1f95ff]" : "text-[#5a5040] hover:bg-[#e8e2d6]"}`}
                >
                  <Info size={17} />
                </button>
              </div>
            </header>

            {/* ── Message search bar ── */}
            {showMsgSearch && (
              <div className="flex items-center gap-2 border-b border-[#e6e0d4] bg-[#f5f0e8] px-4 py-2">
                <Search size={14} className="text-[#8c7f6a]" />
                <input
                  autoFocus
                  value={msgSearch}
                  onChange={(e) => setMsgSearch(e.target.value)}
                  placeholder="Search in conversation…"
                  className="flex-1 bg-transparent text-[13px] text-[#000] outline-none placeholder:text-[#8c7f6a]"
                />
                {msgSearch && (
                  <button onClick={() => setMsgSearch("")} className="text-[#8c7f6a] hover:text-[#000] transition">
                    <X size={14} />
                  </button>
                )}
              </div>
            )}

            <div className="flex flex-1 overflow-hidden">
              {/* ── Messages ── */}
              <div className="flex flex-1 flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto py-2">
                  {msgsLoading && (
                    <div className="space-y-4 px-4 py-4">
                      {[1,2,3,4].map((i) => (
                        <div key={i} className={`flex gap-3 ${i % 2 === 0 ? "flex-row-reverse" : ""}`}>
                          <div className="h-8 w-8 flex-none animate-pulse rounded-full bg-[#e0d9d0]" />
                          <div className={`space-y-1 ${i % 2 === 0 ? "items-end" : "items-start"} flex flex-col`}>
                            <div className={`h-10 animate-pulse rounded-2xl bg-[#e0d9d0] ${i % 2 === 0 ? "w-44" : "w-64"}`} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {!msgsLoading && displayMsgs.length === 0 && !msgSearch && (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-center px-8">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#1f95ff]/10">
                        <Send size={28} className="text-[#1f95ff]" strokeWidth={1.5} />
                      </div>
                      <p className="text-[14px] font-semibold text-[#000]">No messages yet</p>
                      <p className="text-[12px] text-[#8c7f6a]">Say hi to start the conversation!</p>
                    </div>
                  )}

                  {!msgsLoading && listItems.map((item) =>
                    item.type === "date"
                      ? <DateSep key={item.key} label={item.label} />
                      : (
                        <MsgBubble
                          key={item.msg.id}
                          msg={item.msg}
                          mine={item.msg.sender_id === myId}
                          showAvatar={item.showAvatar}
                          isGroup={isGroup}
                          onReply={setReplyTo}
                          onReact={handleReact}
                          myId={myId}
                          allMessages={messages}
                        />
                      )
                  )}

                  {remoteTyping && <TypingIndicator />}
                  <div ref={bottomRef} className="h-2" />
                </div>

                {/* ── Reply strip ── */}
                {replyTo && <ReplyPreview msg={replyTo} onClear={() => setReplyTo(null)} />}

                {/* ── Input bar ── */}
                <div className="border-t border-[#e6e0d4] bg-[#ede8dc] px-4 py-3">
                  <div className="flex items-end gap-2">
                    {/* Attach */}
                    <button className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-[#8c7f6a] transition hover:bg-[#e8e2d6] hover:text-[#1f95ff]">
                      <Paperclip size={18} />
                    </button>
                    {/* Image */}
                    <button className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-[#8c7f6a] transition hover:bg-[#e8e2d6] hover:text-[#1f95ff]">
                      <ImageIcon size={18} />
                    </button>

                    {/* Text input */}
                    <div className="flex flex-1 items-end rounded-2xl border border-[#ddd7c9] bg-[#f5f0e8] px-4 py-2.5 focus-within:border-[#1f95ff] focus-within:ring-2 focus-within:ring-[#1f95ff]/15 transition">
                      <textarea
                        ref={inputRef}
                        rows={1}
                        value={draft}
                        onChange={(e) => { handleTyping(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`; }}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                        placeholder="Message…"
                        className="w-full resize-none bg-transparent text-[14px] text-[#000] outline-none placeholder:text-[#8c7f6a] leading-snug"
                        style={{ maxHeight: 120 }}
                      />
                      <button className="ml-2 flex-none self-end text-[#8c7f6a] transition hover:text-[#1f95ff]">
                        <Smile size={18} />
                      </button>
                    </div>

                    {/* Send / Mic */}
                    {draft.trim() ? (
                      <button
                        onClick={handleSend}
                        className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-[#1f95ff] text-white shadow-md transition hover:bg-[#1a7fd4] active:scale-95"
                      >
                        <Send size={17} />
                      </button>
                    ) : (
                      <button className="flex h-10 w-10 flex-none items-center justify-center rounded-full border border-[#ddd7c9] bg-[#f5f0e8] text-[#8c7f6a] transition hover:border-[#1f95ff] hover:text-[#1f95ff]">
                        <Mic size={17} />
                      </button>
                    )}
                  </div>
                  <p className="mt-1.5 text-center text-[10px] text-[#b0a898]">
                    Press <kbd className="rounded bg-[#e8e2d6] px-1 py-0.5 font-mono text-[9px]">Enter</kbd> to send · <kbd className="rounded bg-[#e8e2d6] px-1 py-0.5 font-mono text-[9px]">Shift+Enter</kbd> for new line
                  </p>
                </div>
              </div>

              {/* ── Info panel ── */}
              {showInfo && activeChat && (
                <aside className="w-72 flex-none overflow-y-auto border-l border-[#e6e0d4] bg-[#ede8dc] p-5">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-[13px] font-bold text-[#000]">
                      {isGroup ? "Group info" : "Contact info"}
                    </p>
                    <button onClick={() => setShowInfo(false)} className="text-[#8c7f6a] hover:text-[#000] transition">
                      <X size={15} />
                    </button>
                  </div>
                  <div className="mb-4 flex flex-col items-center gap-2 text-center">
                    <Avatar
                      url={chatAvatar(activeChat, myId)}
                      name={chatTitle(activeChat, myId)}
                      size={72}
                      online={onlineNow}
                      square={isGroup}
                    />
                    <p className="text-[15px] font-bold text-[#000]">{chatTitle(activeChat, myId)}</p>
                    {!isGroup && other && (
                      <p className="text-[12px] text-[#8c7f6a]">@{other.handle}</p>
                    )}
                    {!isGroup && presenceStatus && (
                      <p className={`text-[12px] font-semibold ${onlineNow ? "text-emerald-600" : "text-[#8c7f6a]"}`}>
                        {presenceStatus}
                      </p>
                    )}
                  </div>

                  {isGroup && (
                    <div>
                      <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-[#8c7f6a]">
                        Members ({activeChat.chat_members.length})
                      </p>
                      <div className="space-y-2">
                        {activeChat.chat_members.map((m) => (
                          <div key={m.user_id} className="flex items-center gap-2.5">
                            <Avatar url={m.profiles?.avatar_url} name={m.profiles?.display_name} size={36} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13px] font-semibold text-[#000]">
                                {m.profiles?.display_name ?? "User"}
                                {m.user_id === myId && <span className="ml-1 text-[10px] text-[#8c7f6a]">(you)</span>}
                              </p>
                              <p className="truncate text-[11px] text-[#8c7f6a]">@{m.profiles?.handle}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-5 space-y-2">
                    <button className="flex w-full items-center gap-2.5 rounded-xl border border-[#ddd7c9] bg-white px-3.5 py-2.5 text-[13px] font-medium text-[#000] transition hover:bg-[#f5f0e8]">
                      <Search size={14} className="text-[#8c7f6a]" /> Search in chat
                    </button>
                    <button className="flex w-full items-center gap-2.5 rounded-xl border border-[#ddd7c9] bg-white px-3.5 py-2.5 text-[13px] font-medium text-[#000] transition hover:bg-[#f5f0e8]">
                      <ImageIcon size={14} className="text-[#8c7f6a]" /> Media & files
                    </button>
                    <button className="flex w-full items-center gap-2.5 rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-[13px] font-medium text-red-600 transition hover:bg-red-100">
                      <X size={14} /> {isGroup ? "Leave group" : "Delete chat"}
                    </button>
                  </div>
                </aside>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
