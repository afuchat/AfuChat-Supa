import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Link, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import {
  Archive, ArrowUpRight, Bell, Bot, Check, ChevronRight, CircleHelp, Download,
  Compass, File, FileImage, FileText, FolderOpen, Grid2X2, Heart, Image, Info,
  MessageCircle, Mic, MoreHorizontal, Paperclip, Pencil, Play, Plus, Search,
  Send, Settings, Share2, Sparkles, Sun, Moon, Users, Video, WandSparkles, X,
} from 'lucide-react';
const iconPath = `${import.meta.env.BASE_URL}afuchat-icon.png`;

const queryClient = new QueryClient();

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type IconType = typeof MessageCircle;
type AvatarTone = 'blue' | 'coral' | 'teal' | 'gold' | 'plum' | 'ink';
type Conversation = { id: string; name: string; initials: string; tone: AvatarTone; preview: string; time: string; unread?: number; online?: boolean; };
type Message = { id: string; text: string; time: string; mine?: boolean; };

const conversations: Conversation[] = [
  { id: 'afu', name: 'AfuChat', initials: 'AC', tone: 'blue', preview: 'Welcome to your new workspace.', time: '2m', unread: 2, online: true },
  { id: 'maya', name: 'Maya Chen', initials: 'MC', tone: 'coral', preview: 'The new community guide is ready.', time: '11:38', unread: 1, online: true },
  { id: 'noah', name: 'Noah Williams', initials: 'NW', tone: 'teal', preview: 'Voice message · 0:34', time: '10:52', online: true },
  { id: 'ayaka', name: 'Ayaka Ishii', initials: 'AI', tone: 'gold', preview: 'That sounds like a plan.', time: 'Yesterday' },
  { id: 'tech', name: 'Tech Nerds', initials: 'TN', tone: 'plum', preview: 'Ravi: The Chromebook setup works.', time: 'Mon', unread: 4 },
  { id: 'flaky', name: 'Flaky', initials: 'FK', tone: 'ink', preview: 'Okay, that makes sense.', time: 'Sun' },
];

const seedMessages: Record<string, Message[]> = {
  afu: [
    { id: 'a1', text: 'Welcome back. Your AfuChat space is ready.', time: '11:32 AM' },
    { id: 'a2', text: 'Find conversations, share media, and pick up right where you left off.', time: '11:32 AM' },
    { id: 'a3', text: 'Nice. I’m exploring from my Chromebook today.', time: '11:33 AM', mine: true },
    { id: 'a4', text: 'Perfect timing. Try the keyboard-friendly composer below.', time: '11:33 AM' },
  ],
  maya: [
    { id: 'm1', text: 'I pulled together the notes from yesterday’s community call.', time: '11:18 AM' },
    { id: 'm2', text: 'The new community guide is ready.', time: '11:38 AM' },
  ],
  noah: [{ id: 'n1', text: 'Voice message · 0:34', time: '10:52 AM' }],
  ayaka: [{ id: 'y1', text: 'That sounds like a plan. See you there.', time: 'Yesterday' }],
  tech: [{ id: 't1', text: 'The Chromebook setup works.', time: 'Monday' }],
  flaky: [{ id: 'f1', text: 'Okay, that makes sense.', time: 'Sunday' }],
};

const navItems: { href: string; label: string; icon: IconType; badge?: string }[] = [
  { href: '/chat', label: 'Chat', icon: MessageCircle, badge: '4' },
  { href: '/discover', label: 'Discover', icon: Compass },
  { href: '/shorts', label: 'Shorts', icon: Play },
  { href: '/communities', label: 'Communities', icon: Users },
  { href: '/assistant', label: 'AfuAI', icon: Bot },
  { href: '/apps', label: 'Apps', icon: Grid2X2 },
];

function Avatar({ initials, tone, className = '' }: { initials: string; tone: AvatarTone; className?: string }) {
  return <div className={`avatar ${tone} ${className}`} aria-hidden="true">{initials}</div>;
}

function Sidebar({ path }: { path: string }) {
  return (
    <aside className="sidebar" aria-label="Primary navigation">
      <Link href="/" className="brand" data-testid="link-home">
        <img src={iconPath} alt="AfuChat" />
        <span className="brand-name">Afu<span>Chat</span></span>
      </Link>
      <div>
        <div className="sidebar-section-label">Your space</div>
        <nav className="nav-list">
          {navItems.map(({ href, label, icon: Icon, badge }) => (
            <Link key={href} href={href} className={`nav-item ${path === href ? 'active' : ''}`} data-testid={`link-${label.toLowerCase().replace(' ', '-')}`}>
              <Icon className="nav-icon" strokeWidth={path === href ? 2.5 : 1.9} />
              <span>{label}</span>
              {badge && <span className="nav-badge">{badge}</span>}
            </Link>
          ))}
        </nav>
      </div>
      <div>
        <div className="sidebar-section-label">Personal</div>
        <nav className="nav-list">
          <Link href="/files" className={`nav-item ${path === '/files' ? 'active' : ''}`} data-testid="link-files"><FolderOpen className="nav-icon" /><span>Private files</span></Link>
          <Link href="/profile" className={`nav-item ${path === '/profile' ? 'active' : ''}`} data-testid="link-profile"><Settings className="nav-icon" /><span>Profile</span></Link>
        </nav>
      </div>
      <div className="sidebar-bottom">
        <button className="nav-item" type="button" onClick={() => window.alert('Help center is coming soon.')} data-testid="button-help"><CircleHelp className="nav-icon" /><span>Help center</span></button>
        <Link href="/profile" className="profile-mini" data-testid="link-mini-profile">
          <Avatar initials="JR" tone="blue" />
          <div className="profile-mini-copy"><strong>Jordan Reed</strong><span>Available</span></div>
          <ChevronRight size={15} />
        </Link>
      </div>
    </aside>
  );
}

function Topbar({ title, subtitle, onTheme, dark, onSearch, search, onInstall, canInstall }: { title: string; subtitle: string; onTheme: () => void; dark: boolean; onSearch: (value: string) => void; search: string; onInstall: () => void; canInstall: boolean }) {
  return (
    <header className="topbar">
      <div className="topbar-heading"><h1>{title}</h1><p>{subtitle}</p></div>
      <div className="topbar-actions">
        <div className="search-box">
          <Search size={16} />
          <input type="search" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search AfuChat" aria-label="Search AfuChat" data-testid="input-global-search" />
        </div>
        <button className="icon-button" type="button" onClick={onTheme} aria-label={dark ? 'Use light theme' : 'Use dark theme'} data-testid="button-theme">
          {dark ? <Sun size={17} /> : <Moon size={17} />}
        </button>
        <button className="icon-button" type="button" onClick={() => window.alert('You are all caught up.')} aria-label="Notifications" data-testid="button-notifications"><Bell size={17} /></button>
        {canInstall && <button className="install-button" type="button" onClick={onInstall} data-testid="button-install-app"><Download size={14} /> Install app</button>}
        <Avatar initials="JR" tone="blue" />
      </div>
    </header>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const [path] = useLocation();
  const [dark, setDark] = useState(() => localStorage.getItem('afuchat-theme') === 'dark');
  const [search, setSearch] = useState('');
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  useEffect(() => {
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
  }, []);
  const installApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('afuchat-theme', dark ? 'dark' : 'light');
  }, [dark]);
  const pageMeta: Record<string, [string, string]> = {
    '/': ['Good afternoon, Jordan', 'Everything you care about, one calm space.'],
    '/discover': ['Discover', 'Find conversations, creators, and ideas worth keeping.'],
    '/shorts': ['Shorts', 'A focused stream of quick ideas and moments.'],
    '/communities': ['Communities', 'Your circles for the things you are into.'],
    '/assistant': ['AfuAI', 'A thoughtful second pair of hands, right inside AfuChat.'],
    '/apps': ['Apps', 'Useful tools that keep your conversations moving.'],
    '/files': ['Private files', 'Share safely, find quickly, keep control.'],
    '/profile': ['Profile', 'Your identity and AfuChat preferences.'],
  };
  const [title, subtitle] = pageMeta[path] ?? ['AfuChat', 'Stay close to what matters.'];
  const isChat = path === '/chat';
  return (
    <div className="app-shell">
      <Sidebar path={path} />
      <main className="main-column">
        {!isChat && <Topbar title={title} subtitle={subtitle} onTheme={() => setDark((value) => !value)} dark={dark} onSearch={setSearch} search={search} onInstall={installApp} canInstall={Boolean(installPrompt)} />}
        {isChat ? <ChatPage globalSearch={search} /> : <div className="content">{children}</div>}
      </main>
    </div>
  );
}

function HomePage() {
  const [notice, setNotice] = useState('');
  return (
    <div className="content-inner">
      <section className="hero-grid">
        <div className="surface welcome-card">
          <div className="eyebrow">AfuChat / Chromebook</div>
          <h2>Conversations that keep their shape on a big screen.</h2>
          <p>Your chat, communities, short videos, and private files are ready when you are. Pick a thread from the left, or start somewhere new.</p>
          <Link href="/chat" className="button-primary" style={{ marginTop: 18, background: 'white', color: '#1018D8', position: 'relative', zIndex: 1 }} data-testid="link-open-chat">Open chat <ArrowUpRight size={14} /></Link>
        </div>
        <div className="surface quick-card">
          <div className="section-heading"><h3>Quick start</h3><Sparkles size={16} color="hsl(var(--primary))" /></div>
          <div className="quick-list">
            <button className="quick-item plain-button" type="button" onClick={() => setNotice('New conversation composer opened.')} data-testid="button-new-conversation"><Plus size={17} /><span><strong>Start a conversation</strong>Send a note to someone new</span></button>
            <Link className="quick-item" href="/assistant" data-testid="link-ask-af AI"><Bot size={17} /><span><strong>Ask AfuAI</strong>Turn a thought into a plan</span></Link>
            <Link className="quick-item" href="/files" data-testid="link-private-files"><FolderOpen size={17} /><span><strong>Browse private files</strong>Pick up shared work</span></Link>
          </div>
        </div>
      </section>
      <section className="metric-grid" aria-label="Your AfuChat overview">
        <div className="surface metric" data-testid="metric-unread"><div className="metric-label">Unread messages</div><div className="metric-value">7</div><div className="metric-note">Across 3 conversations</div></div>
        <div className="surface metric" data-testid="metric-communities"><div className="metric-label">Active communities</div><div className="metric-value">12</div><div className="metric-note">2 new this week</div></div>
        <div className="surface metric" data-testid="metric-files"><div className="metric-label">Shared this month</div><div className="metric-value">18</div><div className="metric-note">Files and media</div></div>
      </section>
      <section className="home-lower">
        <div className="surface activity-card">
          <div className="section-heading"><h2>Recent activity</h2><Link href="/chat" className="plain-button" style={{ width: 'auto', padding: '0 7px', fontSize: 11 }} data-testid="link-see-all-activity">See all <ChevronRight size={14} /></Link></div>
          <div className="activity-row"><Avatar initials="MC" tone="coral" /><div><p><strong>Maya Chen</strong> shared a new community guide in <strong>Designing together</strong>.</p><time>11 minutes ago</time></div></div>
          <div className="activity-row"><Avatar initials="TN" tone="plum" /><div><p><strong>Tech Nerds</strong> has 4 new messages waiting for you.</p><time>42 minutes ago</time></div></div>
          <div className="activity-row"><Avatar initials="AC" tone="blue" /><div><p>Your AfuChat Chromebook session is synced and secure.</p><time>Today</time></div></div>
        </div>
        <div className="surface people-card">
          <div className="section-heading"><h2>People to catch up with</h2><Users size={16} color="hsl(var(--primary))" /></div>
          {conversations.slice(1, 4).map((person) => <div className="creator-row" key={person.id}><Avatar initials={person.initials} tone={person.tone} /><div><strong>{person.name}</strong><span>{person.online ? 'Online now' : 'Active recently'}</span></div><Link href="/chat" className="plain-button" aria-label={`Chat with ${person.name}`} data-testid={`button-chat-${person.id}`}><MessageCircle size={15} /></Link></div>)}
        </div>
      </section>
      {notice && <Toast message={notice} onClose={() => setNotice('')} />}
    </div>
  );
}

function ChatPage({ globalSearch }: { globalSearch: string }) {
  const [selectedId, setSelectedId] = useState('afu');
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [messages, setMessages] = useState(seedMessages);
  const [draft, setDraft] = useState('');
  const [chatSearch, setChatSearch] = useState(globalSearch);
  const [notice, setNotice] = useState('');
  const selected = conversations.find((conversation) => conversation.id === selectedId) ?? conversations[0];
  const visibleConversations = useMemo(() => conversations.filter((conversation) => {
    const matchesSearch = `${conversation.name} ${conversation.preview}`.toLowerCase().includes(chatSearch.toLowerCase());
    return matchesSearch && (filter === 'all' || Boolean(conversation.unread));
  }), [filter, chatSearch]);
  const selectedMessages = messages[selected.id] ?? [];
  const sendMessage = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setMessages((current) => ({ ...current, [selected.id]: [...(current[selected.id] ?? []), { id: `${selected.id}-${Date.now()}`, text: trimmed, time: 'Now', mine: true }] }));
    setDraft('');
  };
  return (
    <div className="chat-layout">
      <aside className="conversation-panel" aria-label="Conversations">
        <div className="conversation-head">
          <div className="conversation-head-row"><h2>Messages</h2><button className="icon-button" type="button" onClick={() => setNotice('New conversation composer opened.')} aria-label="New conversation" data-testid="button-new-chat"><Pencil size={16} /></button></div>
          <div className="search-box"><Search size={15} /><input type="search" value={chatSearch} onChange={(event) => setChatSearch(event.target.value)} placeholder="Search conversations" aria-label="Search conversations" data-testid="input-conversation-search" /></div>
          <div className="conversation-filter" role="tablist" aria-label="Conversation filters">
            <button className={`filter-chip ${filter === 'all' ? 'active' : ''}`} type="button" onClick={() => setFilter('all')} data-testid="filter-all">All messages</button>
            <button className={`filter-chip ${filter === 'unread' ? 'active' : ''}`} type="button" onClick={() => setFilter('unread')} data-testid="filter-unread">Unread</button>
          </div>
        </div>
        <div className="conversation-list">
          {visibleConversations.length === 0 ? <div className="empty-state" style={{ margin: 9, padding: '30px 10px' }}><Search size={21} /><strong>No conversations</strong><p>Try a different search.</p></div> : visibleConversations.map((conversation) => (
            <button type="button" className={`conversation ${selected.id === conversation.id ? 'selected' : ''}`} key={conversation.id} onClick={() => setSelectedId(conversation.id)} data-testid={`conversation-${conversation.id}`}>
              <Avatar initials={conversation.initials} tone={conversation.tone} />
              <div className="conversation-copy"><div className="conversation-topline"><span className="conversation-name">{conversation.name}</span><span className="conversation-time">{conversation.time}</span></div><div className="conversation-preview">{conversation.preview}</div></div>
              {conversation.unread && <span className="unread-dot" aria-label={`${conversation.unread} unread messages`} />}
            </button>
          ))}
        </div>
      </aside>
      <section className="chat-panel" aria-label={`Conversation with ${selected.name}`}>
        <header className="chat-header">
          <Avatar initials={selected.initials} tone={selected.tone} />
          <div className="chat-header-copy"><strong>{selected.name}</strong><span>{selected.online ? 'Online now' : 'Last active today'}</span></div>
          <button className="icon-button" type="button" onClick={() => setNotice('Search within this conversation is ready.')} aria-label="Search conversation" data-testid="button-search-chat"><Search size={17} /></button>
          <button className="icon-button" type="button" onClick={() => setNotice('Conversation details are open on the right.')} aria-label="Conversation options" data-testid="button-chat-options"><MoreHorizontal size={18} /></button>
        </header>
        <div className="message-scroll" data-testid="message-list">
          <div className="day-divider">Today</div>
          {selectedMessages.map((message) => <div className={`message-row ${message.mine ? 'mine' : ''}`} key={message.id}><div className="message-bubble" data-testid={`message-${message.id}`}>{message.text}</div><span className="message-meta">{message.time}{message.mine && <Check size={10} style={{ verticalAlign: 'middle', marginLeft: 3 }} />}</span></div>)}
        </div>
        <div className="message-compose">
          <div className="compose-box">
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); } }} placeholder="Write a message..." aria-label="Write a message" rows={1} data-testid="input-message" />
            <button className="send-button" type="button" onClick={sendMessage} disabled={!draft.trim()} aria-label="Send message" data-testid="button-send-message"><Send size={15} /></button>
          </div>
          <div className="compose-tools">
            <button className="plain-button" type="button" aria-label="Attach a file" onClick={() => setNotice('File picker ready for a private upload.')} data-testid="button-attach-file"><Paperclip size={15} /></button>
            <button className="plain-button" type="button" aria-label="Add media" onClick={() => setNotice('Media picker ready.')} data-testid="button-add-media"><Image size={15} /></button>
            <button className="plain-button" type="button" aria-label="Record voice message" onClick={() => setNotice('Voice recording is ready.')} data-testid="button-voice-message"><Mic size={15} /></button>
            <span className="compose-hint">Enter to send · Shift + Enter for a new line</span>
          </div>
        </div>
      </section>
      <aside className="details-panel" aria-label="Conversation details">
        <div className="details-profile"><Avatar initials={selected.initials} tone={selected.tone} /><strong>{selected.name}</strong><span>{selected.online ? 'Available to chat' : 'Away right now'}</span><div className="details-actions"><button className="details-action" type="button" onClick={() => setNotice('Audio call started.')} data-testid="button-audio-call"><Mic size={17} />Audio</button><button className="details-action" type="button" onClick={() => setNotice('Video call started.')} data-testid="button-video-call"><Video size={17} />Video</button><button className="details-action" type="button" onClick={() => setNotice('Conversation link copied.')} data-testid="button-share-chat"><Share2 size={17} />Share</button></div></div>
        <div className="detail-block"><h3>Shared media</h3><div className="shared-file"><Image size={16} /><div className="shared-file-copy"><strong>chromebook-setup.png</strong><span>Yesterday · 2.4 MB</span></div><button className="plain-button" type="button" onClick={() => setNotice('Media preview opened.')} aria-label="Preview shared image" data-testid="button-preview-media"><ArrowUpRight size={14} /></button></div><div className="shared-file"><FileText size={16} /><div className="shared-file-copy"><strong>conversation-notes.pdf</strong><span>Monday · 840 KB</span></div><button className="plain-button" type="button" onClick={() => setNotice('File preview opened.')} aria-label="Preview shared file" data-testid="button-preview-file"><ArrowUpRight size={14} /></button></div></div>
        <div className="detail-block"><h3>Conversation</h3><div className="setting-row"><span>Notifications</span><button className="toggle on" type="button" aria-label="Notifications on" data-testid="toggle-chat-notifications" /></div><div className="setting-row"><span>Disappearing messages</span><button className="toggle" type="button" aria-label="Disappearing messages off" data-testid="toggle-disappearing" /></div></div>
      </aside>
      {notice && <Toast message={notice} onClose={() => setNotice('')} />}
    </div>
  );
}

function DiscoverPage() {
  const [tab, setTab] = useState('For you');
  const cards = [{ title: 'Building a kinder internet', text: 'Small product choices that make online spaces feel more human.', tone: '' }, { title: 'The quiet craft of good notes', text: 'A collection of workflows from people who think in public.', tone: 'pink' }, { title: 'Chromebook field notes', text: 'Make your browser feel like your favorite workbench.', tone: 'gold' }];
  return <div className="content-inner"><div className="eyebrow">Explore thoughtfully</div><h2 className="page-title">Something worth your attention.</h2><p className="page-subtitle">Fresh conversations and creators from across AfuChat, tuned to what you follow.</p><div className="discovery-tabs">{['For you', 'Following', 'Topics'].map((item) => <button className={`discovery-tab ${tab === item ? 'active' : ''}`} type="button" key={item} onClick={() => setTab(item)} data-testid={`tab-discover-${item.toLowerCase().replace(' ', '-')}`}>{item}</button>)}</div><div className="discover-grid">{cards.map((card, index) => <article className="surface discover-card" key={card.title} data-testid={`card-discover-${index}`}><div className={`discover-art ${card.tone}`}><span style={{ position: 'absolute', zIndex: 1, left: 15, top: 14, fontSize: 10, color: 'hsl(225 34% 20% / .7)', fontWeight: 700 }}>FEATURED NOTE</span></div><div className="discover-info"><h3>{card.title}</h3><p>{card.text}</p><button className="button-secondary" type="button" onClick={() => window.alert(`Opening ${card.title}`)} data-testid={`button-open-discover-${index}`}>Open story <ArrowUpRight size={13} /></button></div></article>)}</div><section className="surface" style={{ marginTop: 20, padding: 19 }}><div className="section-heading"><h2>Popular right now</h2><span>Updated moments ago</span></div><div className="creator-row"><Avatar initials="RS" tone="teal" /><div><strong>Rina Sol</strong><span>Shared a thoughtful take in Product people</span></div><Heart size={16} color="hsl(var(--primary))" /></div><div className="creator-row"><Avatar initials="OP" tone="gold" /><div><strong>Open photography</strong><span>New community · 2.1k members</span></div><Users size={16} color="hsl(var(--primary))" /></div></section></div>;
}

function ShortsPage() {
  const [liked, setLiked] = useState(false);
  return <div className="content-inner"><div className="eyebrow">Short-form, long-lasting</div><h2 className="page-title">A little spark for your break.</h2><p className="page-subtitle">Watch, enjoy, and share short videos from communities you care about.</p><div className="shorts-layout"><article className="surface short-card"><div className="short-art" /><div className="short-copy"><div className="eyebrow">From the community · 0:42</div><h2>Three tiny rituals for a clearer morning.</h2><p>By Lina Park · Mindful makers</p><div style={{ display: 'flex', gap: 8, marginTop: 16 }}><button className="button-primary" type="button" onClick={() => setLiked((value) => !value)} data-testid="button-like-short"><Heart size={14} fill={liked ? 'currentColor' : 'none'} />{liked ? 'Saved' : 'Save'}</button><button className="button-secondary" type="button" onClick={() => window.alert('Share sheet opened.')} data-testid="button-share-short"><Share2 size={14} />Share</button></div></div></article><div className="short-side"><div className="surface" style={{ padding: 18 }}><div className="section-heading"><h2>Creators to follow</h2><span>3 new</span></div>{[['LP', 'Lina Park', 'Mindful makers', 'coral'], ['DA', 'Drew Alvarez', 'Weekend builds', 'blue'], ['SK', 'Suki Kim', 'Small joys', 'gold']].map(([initials, name, community, tone]) => <div className="creator-row" key={name}><Avatar initials={initials} tone={tone as AvatarTone} /><div><strong>{name}</strong><span>{community}</span></div><button className="button-secondary" style={{ minHeight: 28, padding: '0 9px', marginLeft: 'auto' }} type="button" onClick={() => window.alert(`Following ${name}`)} data-testid={`button-follow-${name.toLowerCase().replace(' ', '-')}`}>Follow</button></div>)}</div><div className="surface" style={{ padding: 18 }}><div className="section-heading"><h2>Saved for later</h2><Archive size={16} color="hsl(var(--primary))" /></div><p className="page-subtitle">Your saved shorts will appear here when you find a moment to keep.</p></div></div></div></div>;
}

function CommunitiesPage() {
  const [joined, setJoined] = useState<string[]>(['Designing together']);
  const groups = [{ name: 'Designing together', detail: 'Thoughtful product and brand work', members: '8.4k members', tone: 'blue' }, { name: 'Chromebook club', detail: 'Tips, shortcuts, and setup inspiration', members: '3.1k members', tone: 'teal' }, { name: 'Open photography', detail: 'Make more with the camera you have', members: '2.1k members', tone: 'gold' }, { name: 'Afu builders', detail: 'Ideas, experiments, and making in public', members: '1.7k members', tone: 'plum' }];
  const toggleGroup = (name: string) => setJoined((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name]);
  return <div className="content-inner"><div className="eyebrow">Find your people</div><h2 className="page-title">Communities with a pulse.</h2><p className="page-subtitle">A good room makes it easier to show up. Join a few that feel like yours.</p><div className="collection-list">{groups.map((group, index) => <div className="surface collection-item" key={group.name} data-testid={`community-${index}`}><div className={`collection-icon`}><Users size={19} /></div><div className="collection-copy"><strong>{group.name}</strong><span>{group.detail} · {group.members}</span></div><button className={joined.includes(group.name) ? 'button-secondary' : 'button-primary'} type="button" onClick={() => toggleGroup(group.name)} data-testid={`button-join-community-${index}`}>{joined.includes(group.name) ? <><Check size={13} />Joined</> : <>Join <Plus size={13} /></>}</button></div>)}</div></div>;
}

function AssistantPage() {
  const [messages, setMessages] = useState([{ text: 'Hi Jordan. What are you working through today?', mine: false }]);
  const [draft, setDraft] = useState('');
  const prompts = ['Help me plan my week', 'Summarize my saved notes', 'Draft a kind reply'];
  const send = (text = draft) => { if (!text.trim()) return; setMessages((current) => [...current, { text, mine: true }, { text: 'I can help with that. Tell me a little more and we’ll shape it together.', mine: false }]); setDraft(''); };
  return <div className="content-inner"><div className="eyebrow">Your thoughtful sidekick</div><h2 className="page-title">Ask AfuAI anything.</h2><p className="page-subtitle">A private, practical place to turn a question into a next step.</p><div className="assistant-layout"><section className="surface assistant-chat"><div className="assistant-messages">{messages.map((message, index) => <div className={`assistant-message ${message.mine ? 'user' : ''}`} key={`${message.text}-${index}`}><Avatar initials={message.mine ? 'JR' : 'AI'} tone={message.mine ? 'blue' : 'plum'} /><div className="bubble" data-testid={`assistant-message-${index}`}>{message.text}</div></div>)}</div><div className="assistant-input"><input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') send(); }} placeholder="Ask a question..." aria-label="Ask AfuAI a question" data-testid="input-assistant" /><button className="button-primary" type="button" onClick={() => send()} aria-label="Send to AfuAI" data-testid="button-send-assistant"><Send size={14} /></button></div></section><aside className="surface" style={{ padding: 19 }}><div className="section-heading"><h2>Try asking</h2><WandSparkles size={16} color="hsl(var(--primary))" /></div><div className="prompt-list">{prompts.map((prompt) => <button className="prompt-button" type="button" key={prompt} onClick={() => send(prompt)} data-testid={`button-prompt-${prompt.toLowerCase().replaceAll(' ', '-')}`}>{prompt}<ArrowUpRight size={13} style={{ float: 'right' }} /></button>)}</div><div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid hsl(var(--border))' }}><div className="eyebrow">Private by design</div><p className="page-subtitle" style={{ marginTop: 6 }}>Your AfuAI conversations stay in your account and are not posted to a community.</p></div></aside></div></div>;
}

function AppsPage() {
  const apps = [{ name: 'AfuNotes', text: 'Keep ideas close to the conversations that started them.', icon: FileText }, { name: 'AfuMeet', text: 'Bring a community from chat into a focused call.', icon: Video }, { name: 'AfuBoards', text: 'Turn a thread into a shared, visual plan.', icon: Grid2X2 }, { name: 'AfuTranslate', text: 'Make every message feel a little closer.', icon: WandSparkles }];
  return <div className="content-inner"><div className="eyebrow">Make it yours</div><h2 className="page-title">Small tools, right where you need them.</h2><p className="page-subtitle">AfuChat apps are designed to work alongside the conversations you already have.</p><div className="app-grid">{apps.map(({ name, text, icon: Icon }, index) => <article className="surface app-tile" key={name}><div className="app-tile-icon"><Icon size={19} /></div><h3>{name}</h3><p>{text}</p><button className="plain-button" style={{ marginTop: 13, width: 'auto', padding: '0 2px', fontSize: 10, color: 'hsl(var(--primary))' }} type="button" onClick={() => window.alert(`${name} is ready to open.`)} data-testid={`button-open-app-${index}`}>Open app <ArrowUpRight size={13} /></button></article>)}</div></div>;
}

function FilesPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const files = [{ name: 'chromebook-setup.png', type: 'Image', size: '2.4 MB', date: 'Today', icon: FileImage }, { name: 'conversation-notes.pdf', type: 'PDF document', size: '840 KB', date: 'Yesterday', icon: FileText }, { name: 'weekend-board.afuboard', type: 'AfuBoard', size: '1.2 MB', date: 'May 18', icon: File }, { name: 'voice-note-034.m4a', type: 'Audio', size: '4.8 MB', date: 'May 16', icon: Mic }];
  return <div className="content-inner"><div className="eyebrow">Your private shelf</div><h2 className="page-title">Files that stay with you.</h2><p className="page-subtitle">Only you and the people you share with can see these files.</p><div className="file-toolbar"><div className="search-box"><Search size={15} /><input type="search" placeholder="Search files" aria-label="Search files" data-testid="input-file-search" /></div><button className="button-primary" type="button" onClick={() => window.alert('File picker ready for a private upload.')} data-testid="button-upload-file"><Plus size={14} /> Upload file</button></div><div className="surface" style={{ overflowX: 'auto' }}><table className="file-table"><thead><tr><th>Name</th><th>Type</th><th>Size</th><th>Added</th><th aria-label="Actions" /></tr></thead><tbody>{files.map(({ name, type, size, date, icon: Icon }, index) => <tr key={name} onClick={() => setSelected(name)} style={{ cursor: 'pointer' }} data-testid={`row-file-${index}`}><td><div className="file-name"><Icon size={17} />{name}</div></td><td className="file-type">{type}</td><td className="file-type">{size}</td><td className="file-type">{date}</td><td><button className="plain-button" type="button" onClick={(event) => { event.stopPropagation(); setSelected(name); }} aria-label={`Preview ${name}`} data-testid={`button-preview-file-${index}`}><ArrowUpRight size={14} /></button></td></tr>)}</tbody></table></div>{selected && <div className="surface" style={{ marginTop: 16, padding: 16, display: 'flex', alignItems: 'center', gap: 11 }}><File size={19} color="hsl(var(--primary))" /><div style={{ flex: 1 }}><strong style={{ fontSize: 12 }}>{selected}</strong><p className="page-subtitle" style={{ marginTop: 3 }}>Preview selected · ready to share or download</p></div><button className="button-secondary" type="button" onClick={() => window.alert('Share options opened.')} data-testid="button-share-selected-file"><Share2 size={13} /> Share</button><button className="icon-button" type="button" onClick={() => setSelected(null)} aria-label="Close file preview" data-testid="button-close-file-preview"><X size={15} /></button></div>}</div>;
}

function ProfilePage() {
  const [quiet, setQuiet] = useState(false);
  const [desktop, setDesktop] = useState(true);
  return <div className="content-inner"><div className="eyebrow">Your AfuChat identity</div><h2 className="page-title">Profile & preferences.</h2><p className="page-subtitle">Make the space feel right for the way you connect.</p><section className="surface profile-hero"><Avatar initials="JR" tone="blue" /><div className="profile-hero-copy"><h2>Jordan Reed</h2><p>@jordanreed · Available · Joined March 2024</p></div><div className="profile-actions"><button className="button-secondary" type="button" onClick={() => window.alert('Profile editor opened.')} data-testid="button-edit-profile"><Pencil size={13} /> Edit profile</button><button className="icon-button" type="button" onClick={() => window.alert('Profile link copied.')} aria-label="Share profile" data-testid="button-share-profile"><Share2 size={16} /></button></div></section><div className="settings-grid"><section className="surface settings-card"><h3>Notifications</h3><div className="setting-row"><span>Desktop notifications</span><button className={`toggle ${desktop ? 'on' : ''}`} type="button" onClick={() => setDesktop((value) => !value)} aria-label="Toggle desktop notifications" data-testid="toggle-desktop-notifications" /></div><div className="setting-row"><span>Quiet hours</span><button className={`toggle ${quiet ? 'on' : ''}`} type="button" onClick={() => setQuiet((value) => !value)} aria-label="Toggle quiet hours" data-testid="toggle-quiet-hours" /></div><div className="setting-row"><span>Message previews</span><button className="toggle on" type="button" aria-label="Toggle message previews" data-testid="toggle-message-previews" /></div></section><section className="surface settings-card"><h3>Account & privacy</h3><div className="setting-row"><span>Privacy checkup</span><button className="plain-button" type="button" onClick={() => window.alert('Privacy checkup opened.')} aria-label="Open privacy checkup" data-testid="button-privacy-checkup"><ChevronRight size={15} /></button></div><div className="setting-row"><span>Connected devices</span><button className="plain-button" type="button" onClick={() => window.alert('Connected devices opened.')} aria-label="View connected devices" data-testid="button-connected-devices"><ChevronRight size={15} /></button></div><div className="setting-row"><span>Download your data</span><button className="plain-button" type="button" onClick={() => window.alert('Your export is being prepared.')} aria-label="Download your data" data-testid="button-download-data"><ChevronRight size={15} /></button></div></section></div></div>;
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => { const timer = window.setTimeout(onClose, 2600); return () => window.clearTimeout(timer); }, [onClose]);
  return <div className="toast" role="status" data-testid="status-toast">{message}</div>;
}

function NotFound() {
  return <div className="content-inner"><div className="empty-state" style={{ marginTop: 70 }}><Info size={25} /><strong>This AfuChat space does not exist yet.</strong><p>Try one of the spaces in the navigation.</p><Link href="/chat" className="button-primary" data-testid="link-not-found-chat">Go to chat</Link></div></div>;
}

function Router() {
  const [location] = useLocation();
  return <Shell><ErrorBoundary resetKey={location}><Switch><Route path="/" component={HomePage} /><Route path="/chat" component={() => <ChatPage globalSearch="" />} /><Route path="/discover" component={DiscoverPage} /><Route path="/shorts" component={ShortsPage} /><Route path="/communities" component={CommunitiesPage} /><Route path="/assistant" component={AssistantPage} /><Route path="/apps" component={AppsPage} /><Route path="/files" component={FilesPage} /><Route path="/profile" component={ProfilePage} /><Route component={NotFound} /></Switch></ErrorBoundary></Shell>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;