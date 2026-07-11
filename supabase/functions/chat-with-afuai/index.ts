import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const ENGAGERA_ENDPOINT = 'https://rhnsjqqtdzlkvqazfcbg.supabase.co/functions/v1/chat';

async function fetchUserContext(supabase: any, userId: string) {
  try {
    const [profileRes, followerRes, followingRes, subscriptionRes, earningsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', userId),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId),
      supabase.from('user_subscriptions').select('*, subscription_plans(name, tier)').eq('user_id', userId).eq('is_active', true).gt('expires_at', new Date().toISOString()).single(),
      supabase.from('creator_earnings').select('*').eq('user_id', userId).order('earned_date', { ascending: false }).limit(5)
    ]);

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const { data: weeklyPosts } = await supabase.from('posts').select('view_count').eq('author_id', userId).gte('created_at', oneWeekAgo.toISOString());

    let groupMentions: any[] = [];
    const handle = profileRes.data?.handle;
    if (handle) {
      const { data: mentions } = await supabase.from('messages').select('content, chat_id, created_at').ilike('content', `%@${handle}%`).neq('sender_id', userId).order('created_at', { ascending: false }).limit(5);
      if (mentions?.length) {
        const chatIds = [...new Set(mentions.map((m: any) => m.chat_id))];
        const { data: chats } = await supabase.from('chats').select('id, name, is_group').in('id', chatIds).eq('is_group', true);
        groupMentions = mentions.filter((m: any) => chats?.some((c: any) => c.id === m.chat_id)).map((m: any) => ({
          chat: chats?.find((c: any) => c.id === m.chat_id)?.name || 'Group',
          preview: m.content.substring(0, 80),
          time: m.created_at
        }));
      }
    }

    return {
      profile: profileRes.data,
      followerCount: followerRes.count || 0,
      followingCount: followingRes.count || 0,
      subscription: subscriptionRes.data,
      creatorEarnings: earningsRes.data,
      weeklyViews: weeklyPosts?.reduce((sum: number, p: any) => sum + (p.view_count || 0), 0) || 0,
      groupMentions
    };
  } catch (e) {
    return null;
  }
}

async function fetchPlatformData(supabase: any, userId: string) {
  try {
    const [totalUsersRes, activeUsersRes, trendingUsersRes, recentPostsRes, userConnectionsRes, followedByRes] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('last_seen', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
      supabase.from('profiles').select('id, display_name, handle, is_verified, is_admin, xp, current_grade, bio, country').order('xp', { ascending: false }).limit(25),
      supabase.from('posts').select('id, content, view_count, likes_count, author_id, created_at, profiles!posts_author_id_fkey(display_name, handle, is_verified)').order('created_at', { ascending: false }).limit(15),
      supabase.from('follows').select('following_id, profiles!follows_following_id_fkey(id, display_name, handle, is_verified, bio, current_grade)').eq('follower_id', userId).limit(30),
      supabase.from('follows').select('follower_id, profiles!follows_follower_id_fkey(id, display_name, handle, is_verified, current_grade)').eq('following_id', userId).limit(30)
    ]);

    return {
      totalUsers: totalUsersRes.count || 0,
      activeUsers: activeUsersRes.count || 0,
      topUsers: trendingUsersRes.data || [],
      recentPosts: recentPostsRes.data || [],
      following: userConnectionsRes.data?.map((f: any) => f.profiles).filter(Boolean) || [],
      followers: followedByRes.data?.map((f: any) => f.profiles).filter(Boolean) || []
    };
  } catch (e) {
    return null;
  }
}

async function fetchUserMemories(supabase: any, userId: string) {
  try {
    await supabase.from('ai_memories').delete().eq('user_id', userId).lt('expires_at', new Date().toISOString());
    const { data } = await supabase.from('ai_memories').select('content, memory_type').eq('user_id', userId).order('created_at', { ascending: false }).limit(20);
    return data || [];
  } catch (e) {
    return [];
  }
}

async function storeMemories(supabase: any, userId: string, userMessage: string) {
  try {
    const memories: any[] = [];
    const patterns = [
      /i (?:like|love|enjoy) (.+?)(?:\.|$)/gi,
      /my (?:favorite|fav) (?:is|are) (.+?)(?:\.|$)/gi
    ];
    for (const p of patterns) {
      for (const m of userMessage.matchAll(p)) {
        if (m[1] && m[1].length < 150) memories.push({
          user_id: userId,
          memory_type: 'preference',
          content: m[1].trim(),
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        });
      }
    }
    if (userMessage.length > 20) memories.push({
      user_id: userId,
      memory_type: 'conversation',
      content: `Asked: "${userMessage.substring(0, 100)}"`,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    });
    if (memories.length > 0) await supabase.from('ai_memories').insert(memories);
  } catch (e) {}
}

async function performWebSearch(query: string): Promise<string> {
  const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
  if (firecrawlKey) {
    try {
      const res = await fetch('https://api.firecrawl.dev/v1/search', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${firecrawlKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, limit: 5 })
      });
      if (res.ok) {
        const data = await res.json();
        const results = data.data || data.results || [];
        if (results.length > 0) {
          return results.slice(0, 5).map((r: any, i: number) => `${i + 1}. **${r.title || r.url}**: ${(r.description || r.markdown || '').substring(0, 200)}`).join('\n');
        }
      }
    } catch (e) {
      console.error('Firecrawl search error:', e);
    }
  }

  const youKey = Deno.env.get('YOU_API_KEY');
  if (youKey) {
    try {
      const url = new URL('https://api.ydc-index.io/search');
      url.searchParams.append('query', query);
      const res = await fetch(url.toString(), { headers: { 'X-API-Key': youKey } });
      if (res.ok) {
        const data = await res.json();
        return data.hits?.slice(0, 4).map((h: any, i: number) => `${i + 1}. **${h.title}**: ${h.description?.substring(0, 150) || ''}`).join('\n') || '';
      }
    } catch (e) {}
  }
  return '';
}

function needsWebSearch(msg: string): boolean {
  return /what('s| is) (?:the )?(?:latest|current|recent)|search|look up|find|latest news|current events|trending|happening now|weather|price of/i.test(msg);
}

function getDateTime() {
  const now = new Date();
  const eat = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const h = eat.getUTCHours();
  return {
    date: `${days[eat.getUTCDay()]}, ${eat.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
    time: `${h.toString().padStart(2, '0')}:${eat.getUTCMinutes().toString().padStart(2, '0')} EAT`,
    isEarning: h >= 8 && h < 20,
    isWeekend: eat.getUTCDay() === 0 || eat.getUTCDay() === 6,
    greeting: h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'night'
  };
}

// ─── AfuChat Platform Knowledge (mirrors artifacts/mobile/lib/platformKnowledge.ts) ───

const AFUCHAT_NAV_MAP = `
## NAVIGATION MAP (use [ACTION:Label:/route] to show tappable buttons)

### Main Tabs
/ = Home Feed | /discover = Discover trending content | /communities = Groups/communities
/contacts = Friend list | /apps = Mini-Programs | /search = Search everything | /me = My Profile

### Messaging & Calls
/chat/[id] = Open conversation | /chat/new = Start new DM | /chat-search = Search chats
/call/[id] = Active call | /call-history = Past calls

### Content Creation
/moments = Short-form video feed | /moments/create = Create post (photo/text)
/moments/create-video = Upload video | /moments/create-article = Write article
/moments/create-duet = Duet with a video | /shorts = Vertical short videos
/stories/view = 24-hour stories | /post/[id] = View post | /video/[id] = Video player
/saved-posts = Bookmarked posts | /my-posts = Your posts

### Wallet & Finance
/wallet = ACoins balance + history | /wallet/topup = Buy ACoins | /wallet/requests = Payment requests
/wallet/scan = QR payment scanner | /wallet/gift-vault = Received gifts | /red-envelope/[id] = Red envelope

### Social & Discovery
/@handle = Any user's profile | /profile/edit = Edit own profile | /followers = Followers/following list
/user-discovery = Find new people | /digital-id = AfuChat digital ID card (shareable QR)
/prestige = ACoin-based prestige leaderboard | /username-market = Buy/sell rare usernames
/match = Social matching | /match/preferences = Matching preferences

### Gifts
/gifts = Gift overview | /gifts/marketplace = Browse & buy virtual gifts

### Commerce & Shopping
/shop/[userId] = User's shop | /shop/product/[id] = Product listing | /shop/cart = Cart
/shop/my-orders = Order history | /shop/manage = Manage your shop | /shop/apply = Apply as seller

### Professional
/company = Company pages | /company/[slug] = Specific company | /company/manage = Manage your company
/freelance = Freelance gigs

### Mini-Programs (built-in, no external apps needed)
/mini-programs/airtime = Buy mobile airtime | /mini-programs/bills = Pay electricity/water/TV
/mini-programs/data-bundles = Internet data | /mini-programs/hotels = Book hotels
/mini-programs/tickets = Event tickets | /mini-programs/transfer = Send money/bank transfer

### Premium & Monetisation
/premium = Gold & Platinum subscription plans | /referral = Invite friends, earn Nexa
/monetize = Creator monetisation options

### Settings
/settings = Main settings | /settings/security = Password, 2FA, linked accounts
/settings/two-factor = Two-factor auth | /settings/privacy = Privacy overview
/settings/privacy-account = Who sees your account | /settings/privacy-messages = Who can message you
/settings/notifications = Notification preferences | /settings/blocked = Blocked users
/settings/chat = Chat appearance | /settings/storage = Storage management
/language-settings = Change app language

### Support
/support = Contact support / submit ticket | /qr-scanner = Scan any QR code
/digital-id = AfuChat ID card | /status = Account & system status
`;

const AFUCHAT_PLATFORM_KNOWLEDGE = `
## AFUCHAT — PLATFORM CONCEPTS & FEATURES

### What is AfuChat?
AfuChat is Uganda's social super-app. It combines messaging, social networking, AI assistant, digital wallet, freelance marketplace, e-commerce (AfuMarket), mini-programs (airtime, bills, hotels, tickets, bank transfers), communities, and short video — all in one app. Built to serve Africa's social, payment, and communication needs.

**Founder & CEO:** Amkaweesi (@amkaweesi) — built AfuChat to give Africans a home-grown super-app rivalling WeChat, WhatsApp, and TikTok combined.

### Currency System
- **Nexa** (also shown as XP) — reputation/experience points. Earned by posting, engaging, inviting friends, completing profile, daily logins, and activity. Shown on profile as XP. Used for prestige ranking. Can be sent peer-to-peer. Convert to ACoin at a 100:1 rate with a 5.99% fee.
- **ACoins** — the in-app payment currency. Purchase via Wallet → Top Up. Used for: Premium subscriptions, sending virtual gifts, shop purchases, airtime, bills, money transfers. Withdrawable to mobile money/bank (weekends only; admins anytime).
- **Balance (UGX)** — withdrawable Ugandan Shilling balance from creator earnings and marketplace sales.

### Prestige Tiers (ACoin-based — the Rich List ranking)
Prestige is based on your total ACoin balance. The tiers are:
| Tier | Min ACoins | Perks |
|---|---|---|
| Bronze | 0 | Bronze badge on profile, access to Prestige shop, appear on Rich List |
| Silver | 500 | Silver ring on avatar in chats, silver badge on posts, Silver Status Goods |
| Gold | 2,000 | Gold glowing ring everywhere, gold display name in chats, priority in search, Gold Status Goods |
| Diamond | 10,000 | Ice-blue animated diamond ring, diamond glow on messages, Rich List featured, Diamond Status Goods |
| Obsidian | 50,000 | Pulsing dark void ring, purple particle trail on messages, Obsidian title, Rich List Top 100 |
| Legend | 200,000 | Rainbow-shifting ring, crown badge everywhere, golden flame aura on messages, Rich List Top 10, Legend showcase on Discover, all Status Goods |

### Premium Subscription Plans
- **Free** — basic features, standard messaging, public posts
- **Silver** — entry-level paid plan, some extras
- **Gold** — verified blue checkmark, extra privacy features, advanced analytics, priority support. Includes organisation page creation.
- **Platinum** — everything in Gold PLUS: AI image generation, exclusive gift animations, elite social rank, early access features, unlimited AfuAI messages

### Creator Earnings Programme
- Available to users in **Uganda only**
- Requirements: 10+ followers AND 500+ weekly post views (admins: 50+ views)
- Earnings come from: post views, live gifts, ad revenue share
- Withdraw earnings (UGX balance) every weekend via mobile money or bank transfer
- View: /monetize or /creator-earnings

### Referral Programme
- Your referral code = your username in UPPERCASE (e.g. @john → code "JOHN")
- Your referral link = https://afuchat.com/[yourhandle]
- When someone signs up using your code: **You earn 2,000 Nexa + 50 ACoins. They get 7 days of Platinum free.**
- View referral stats and share link at /referral

### Verification
**Personal (Blue ✓ checkmark):**
- Fastest: Upgrade to Gold or Platinum — badge included automatically
- Manual: Notable accounts (celebrities, journalists, public officials) can apply for free via AfuChat review

**Organisation (Gold ◆ square badge):**
- Apply via Settings → Business → Apply for Organisation Verification
- Requirements: business registration, legitimate email domain, follower threshold
- Profile picture shown as SQUARE with gold outline (not circular)

### Username Marketplace
- Buy/sell usernames using ACoins at /username-market
- **Rarity tiers:** Legendary (≤4 chars 👑), Rare (≤6 chars 💎), Uncommon (7–9 chars ⭐), Common (10+ chars)
- A user can own multiple usernames; all point to the same profile
- Owned usernames appear in Profile → Collections → Username Collection

### Content Types
- **Posts** — photos, text, or mixed content in the feed (max 280 characters)
- **Stories** — disappear after 24 hours
- **Moments/Shorts** — short vertical videos (like TikTok/Reels)
- **Articles** — long-form written content
- **Channels** — one-way broadcast feeds by creators or brands
- **Communities** — group spaces with discussions and members

### Virtual Gifts
- Buy animated gift stickers (using ACoins) from /gifts/marketplace
- Send to creators during posts or live streams
- Received gifts go to /wallet/gift-vault
- Gift prices fluctuate dynamically based on demand (price multiplier system)
- Sending a gift earns the sender Nexa (XP)

### Red Envelopes
- Send ACoins to multiple friends at once in a lottery-style split (/red-envelope)
- Fun way to celebrate events or reward followers

### Mini-Programs (built-in utilities)
No need to leave AfuChat for: airtime top-ups, electricity/water/TV bill payments, internet data bundles, hotel bookings, event tickets, bank transfers, and mobile money.

### Social Matching
- Algorithm-based discovery to find compatible people (/match)
- Set preferences at /match/preferences

### Digital ID
- Your AfuChat identity card with a scannable QR (/digital-id)
- Share to get followed or to receive payments

### AfuMarket (Shop)
- Buy and sell physical products within the app
- Sellers apply at /shop/apply
- Buyers browse shops, add to cart, track orders
- Escrow system protects both buyers and sellers

### How-To Quick Reference
- **Send money** → Wallet → Transfer, or in chat tap the attachment + icon → Wallet
- **Top up ACoins** → /wallet/topup (choose amount, pay via Pesapal/mobile money)
- **Upgrade to Platinum** → /premium → select Platinum
- **Invite friends** → /referral → share your code or link
- **Create a post** → tap + icon or /moments/create
- **Find people** → /search → People tab → type name or @handle
- **Send a gift** → visit a profile or post → tap gift icon → /gifts/marketplace
- **Pay bills** → /mini-programs/bills
- **Buy airtime** → /mini-programs/airtime
- **Get verified** → upgrade to Gold or Platinum at /premium
- **Check prestige rank** → /prestige
- **Earn Nexa** → post content, engage with others, invite friends, complete daily tasks
- **Convert Nexa to ACoin** → /wallet → Convert (100 Nexa = 1 ACoin, 5.99% fee)
- **Withdraw balance** → /wallet → Withdraw (weekends only, minimum threshold applies)
`;

const ACTION_ROUTES = `
## ACTION BUTTONS — embed tappable links in responses using this syntax:
[ACTION:Button Label:/route]

Examples:
[ACTION:Open Wallet:/wallet]
[ACTION:Upgrade to Platinum:/premium]
[ACTION:View Referral Program:/referral]
[ACTION:Edit Profile:/profile/edit]
[ACTION:Prestige Leaderboard:/prestige]
[ACTION:Username Market:/username-market]
[ACTION:Buy Airtime:/mini-programs/airtime]
[ACTION:Pay Bills:/mini-programs/bills]
[ACTION:Send Money:/mini-programs/transfer]
[ACTION:Support:/support]
[ACTION:View @handle:/@handle]
[ACTION:Search for X:/search?q=X]

Valid routes: /wallet /wallet/topup /wallet/requests /wallet/gift-vault /premium /referral /monetize /prestige /username-market /profile/edit /settings /settings/security /settings/privacy /settings/notifications /settings/blocked /settings/two-factor /moments/create /moments/create-video /moments/create-article /shorts /saved-posts /my-posts /search /discover /contacts /communities /me /user-discovery /shop/cart /shop/my-orders /shop/manage /shop/apply /gifts/marketplace /gifts /company /company/manage /freelance /mini-programs/airtime /mini-programs/bills /mini-programs/data-bundles /mini-programs/hotels /mini-programs/tickets /mini-programs/transfer /support /chat/new /call-history /qr-scanner /digital-id /language-settings

Use [ACTION:...] buttons whenever guiding the user to a specific feature. Always include at least one action button when giving navigation guidance.
`;

function buildPrompt(user: any, memories: any[], dt: any, platform: any): string {
  const p = user?.profile;
  const accountAge = p?.created_at ? Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86400000) : 0;
  const ageText = accountAge === 0 ? 'today' : accountAge < 30 ? `${accountAge} days ago` : accountAge < 365 ? `${Math.floor(accountAge / 30)} months ago` : `${Math.floor(accountAge / 365)} years ago`;
  const isUganda = p?.country?.toLowerCase() === 'uganda' || p?.country?.toLowerCase() === 'ug';
  const isEligible = isUganda && user?.followerCount >= 10 && user?.weeklyViews >= (p?.is_admin ? 50 : 500);

  // Determine prestige tier from ACoin balance
  function getPrestigeTier(acoin: number): string {
    if (acoin >= 200000) return 'Legend';
    if (acoin >= 50000) return 'Obsidian';
    if (acoin >= 10000) return 'Diamond';
    if (acoin >= 2000) return 'Gold';
    if (acoin >= 500) return 'Silver';
    return 'Bronze';
  }
  const acoin = p?.acoin || 0;
  const prestigeTier = getPrestigeTier(acoin);

  const userInfo = p ? `
## ABOUT THIS USER (live data — use it to personalise responses)
- Name: ${p.display_name} | Handle: @${p.handle} | Joined: ${ageText} | Country: ${p.country || 'Unknown'}
- Nexa (XP): ${p.xp || 0} | ACoins: ${acoin} | Prestige Tier: ${prestigeTier} | Grade: ${p.current_grade || 'Newcomer'}
- Balance (withdrawable): ${p.available_balance_ugx || 0} UGX | Login Streak: ${p.login_streak || 0} days
- Verified: ${p.is_verified ? 'Yes (blue checkmark)' : 'No'} | Premium: ${user?.subscription ? `Yes (${user.subscription?.subscription_plans?.name || 'active'})` : 'No'} | Admin: ${p.is_admin ? 'Yes' : 'No'}
- Followers: ${user?.followerCount} | Following: ${user?.followingCount} | Weekly Post Views: ${user?.weeklyViews}
- Creator Eligible: ${isEligible ? 'Yes — can earn from posts' : `No — ${!isUganda ? 'must be in Uganda' : user?.followerCount < 10 ? 'needs 10+ followers' : `needs ${p?.is_admin ? '50' : '500'}+ weekly views`}`}` : '';

  const memInfo = memories.length > 0 ? `\n## REMEMBERED ABOUT USER\n${memories.slice(0, 10).map((m: any) => `- ${m.content}`).join('\n')}` : '';
  const mentionInfo = user?.groupMentions?.length > 0 ? `\n## RECENT GROUP MENTIONS\n${user.groupMentions.map((m: any) => `- In "${m.chat}": "${m.preview}"`).join('\n')}` : '';

  let platformInfo = '';
  if (platform) {
    platformInfo = `\n## LIVE PLATFORM DATA\n- Total users: ${platform.totalUsers} | Active this week: ${platform.activeUsers}`;
    if (platform.topUsers?.length > 0) platformInfo += `\n- Top users by XP: ${platform.topUsers.slice(0, 15).map((u: any) => `@${u.handle}${u.is_verified ? '\u2713' : ''} (${u.current_grade || 'New'})`).join(', ')}`;
    if (platform.following?.length > 0) platformInfo += `\n- User follows: ${platform.following.slice(0, 15).map((u: any) => `@${u.handle}`).join(', ')}`;
    if (platform.followers?.length > 0) platformInfo += `\n- User's followers: ${platform.followers.slice(0, 15).map((u: any) => `@${u.handle}`).join(', ')}`;
    if (platform.recentPosts?.length > 0) platformInfo += `\n- Recent posts: ${platform.recentPosts.slice(0, 8).map((post: any) => `@${post.profiles?.handle}: "${post.content?.substring(0, 60)}"`).join(' | ')}`;
  }

  const firstName = p?.display_name?.split(' ')[0] || 'there';

  return `You are **AfuAI** — the official AI of AfuChat, built by the AfuChat team. You have deep knowledge of the entire platform and access to real live data about the user and platform. You are NOT a generic AI — you are a specialist AfuChat assistant.

## IDENTITY
- You are AfuAI. Built by AfuChat. NEVER claim to be built by another company or AI provider.
- You know everything about AfuChat: features, pricing, navigation, economy, rules, and how to help users succeed on the platform.
- AfuChat founder & CEO: **Amkaweesi** (@amkaweesi). [ACTION:View founder:/@amkaweesi]

## PERSONALITY & STYLE
- Direct, friendly, smart. Never sycophantic ("Great question!"). Get straight to the answer.
- Match the user's tone: casual if they're casual, professional if formal.
- Respond in the same language the user writes in.
- Simple question = short answer. Complex question = structured, detailed answer. Never pad with filler.
- Use **bold** for key terms. Use bullet points for 3+ items. Use numbered steps for how-tos.
- NEVER repeat the question back or start with "Sure!", "Of course!", "Certainly!".

## CAPABILITIES
1. **AfuChat expert** — answer any question about the platform with authority using the knowledge below
2. **Navigation guide** — tell users exactly where to go and embed [ACTION:...] buttons in responses
3. **Coding** — Flutter, Dart, React, Next.js, Node.js, TypeScript, Supabase, PostgreSQL, Firebase, APIs
4. **Research & Business** — startup strategy, marketing, branding, monetisation
5. **Creative** — posts, captions, articles, bios, content writing

${AFUCHAT_PLATFORM_KNOWLEDGE}

${AFUCHAT_NAV_MAP}

${ACTION_ROUTES}

## POSTING FEATURE
When the user asks you to write/create a post: ask 1-2 clarifying questions (topic, tone) if needed. Then generate a post STRICTLY <=280 characters. Output using this exact format:
[POST_ACTION]{"content":"post text here","auto_publish":false}[/POST_ACTION]

## DATA RULES
- Only reference users from the live data provided below. Never invent users or stats.
- Use @handle format for all user references.
- If you don't know something about a user not in the data, say so honestly.

## CURRENT DATE & TIME
${dt.date}, ${dt.time} | Creator earnings: ${dt.isEarning ? 'ACTIVE (8am–8pm EAT)' : 'CLOSED'}
${userInfo}${memInfo}${mentionInfo}${platformInfo}

TONE: On first message greet briefly as "Hey ${firstName}! \uD83D\uDC4B". After that, skip greetings and answer directly.`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) return new Response(JSON.stringify({ error: 'Auth required' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

    const jwt = authHeader.replace('Bearer ', '');
    const supabase = createClient(supabaseUrl!, supabaseAnonKey!, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !user) return new Response(JSON.stringify({ error: 'Invalid auth' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

    const admin = createClient(supabaseUrl!, supabaseServiceKey!, { auth: { persistSession: false } });

    const { data: sub } = await admin.from('user_subscriptions').select('is_active').eq('user_id', user.id).eq('is_active', true).gt('expires_at', new Date().toISOString()).single();
    if (!sub) return new Response(JSON.stringify({ error: 'Premium required', requiresPremium: true }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

    const { message, history, webSearchMode, model } = await req.json();

    if (!message || typeof message !== 'string' || !message.trim()) return new Response(JSON.stringify({ error: 'Message required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

    if (message.length > 3000) return new Response(JSON.stringify({ error: 'Message too long' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

    const ENGAGERA_API_KEY = Deno.env.get('ENGAGERA_API_KEY');
    if (!ENGAGERA_API_KEY) throw new Error('ENGAGERA_API_KEY not configured');

    const [userContext, memories, platformData] = await Promise.all([
      fetchUserContext(admin, user.id),
      fetchUserMemories(admin, user.id),
      fetchPlatformData(admin, user.id)
    ]);

    let webResults = '';
    if (webSearchMode === true || (webSearchMode !== false && needsWebSearch(message))) {
      webResults = await performWebSearch(message);
    }

    const dt = getDateTime();
    const systemPrompt = buildPrompt(userContext, memories, dt, platformData);

    const allowedModels = [
      'auto',
      'google/gemini-2.5-flash',
      'google/gemini-2.5-pro',
      'openai/gpt-4o-mini',
      'openai/gpt-4o',
      'meta/llama-3.3-70b'
    ];
    const modelToUse = allowedModels.includes(model) ? model : 'auto';

    const msgs: any[] = [{ role: 'system', content: systemPrompt }];

    if (history && Array.isArray(history)) {
      for (const m of history.slice(-30)) {
        if (m.role && m.content && ['user', 'assistant'].includes(m.role)) {
          msgs.push({ role: m.role, content: m.content.substring(0, 3000) });
        }
      }
    }

    let enhancedMsg = message;
    if (webResults) enhancedMsg = `${message}\n\n\uD83C\uDF10 WEB RESULTS:\n${webResults}\n\nUse above to answer.`;
    msgs.push({ role: 'user', content: enhancedMsg });

    const response = await fetch(ENGAGERA_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ENGAGERA_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model: modelToUse, messages: msgs, max_tokens: 1024 })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Engagera error:', response.status, err);
      if (response.status === 429) return new Response(JSON.stringify({ error: 'Rate limited, try again shortly' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
      if (response.status === 402) return new Response(JSON.stringify({ error: 'AI credits depleted' }), {
        status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
      throw new Error(`Engagera error: ${response.status}`);
    }

    const data = await response.json();
    const reply = data.message?.content;
    if (!reply) throw new Error('Invalid Engagera response');

    const thought = [
      `User: "${message.substring(0, 60)}${message.length > 60 ? '...' : ''}"`,
      userContext?.profile ? `Checking @${userContext.profile.handle}'s data...` : null,
      platformData ? `Loaded ${platformData.totalUsers} users, ${platformData.recentPosts?.length || 0} posts` : null,
      webResults ? '\uD83C\uDF10 Web search completed.' : null,
      memories.length > 0 ? `Retrieved ${memories.length} memories.` : null,
      'Generating response...'
    ].filter(Boolean).join('\n');

    storeMemories(admin, user.id, message);
    admin.rpc('award_xp', {
      p_user_id: user.id,
      p_action_type: 'use_ai',
      p_xp_amount: 5,
      p_metadata: { action: 'afuai' }
    });

    return new Response(JSON.stringify({ reply, thought }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
