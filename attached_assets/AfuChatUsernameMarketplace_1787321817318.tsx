import React, { useMemo, useState } from "react";

type Username = {
  handle: string;
  category: string;
  price: number;
  rarity: "Legendary" | "Ultra Rare" | "Rare" | "Uncommon";
  watchers: number;
  verified?: boolean;
  auction?: boolean;
  ends?: string;
};

const listings: Username[] = [
  { handle: "africa", category: "Community", price: 75000, rarity: "Ultra Rare", watchers: 128, verified: true },
  { handle: "music", category: "Creator", price: 42000, rarity: "Rare", watchers: 84 },
  { handle: "uganda", category: "Local", price: 100000, rarity: "Legendary", watchers: 219, verified: true },
  { handle: "gaming", category: "Gaming", price: 28000, rarity: "Rare", watchers: 61 },
  { handle: "cars", category: "Business", price: 18000, rarity: "Uncommon", watchers: 33, auction: true, ends: "01:42:18" },
  { handle: "ai", category: "Technology", price: 150000, rarity: "Legendary", watchers: 407, verified: true, auction: true, ends: "04:18:52" },
  { handle: "sports", category: "Sports", price: 36000, rarity: "Rare", watchers: 72 },
  { handle: "creator", category: "Creator", price: 22000, rarity: "Uncommon", watchers: 29 },
];

const categories = ["All", "Rare", "Auctions", "Business", "Creator", "Gaming", "Community", "Sports"];

const money = (n: number) => `${n.toLocaleString()} ACoin`;

export default function UsernameMarketplace() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState("Popular");
  const [selected, setSelected] = useState<Username | null>(null);
  const [offer, setOffer] = useState("");
  const [watching, setWatching] = useState<string[]>([]);
  const [toast, setToast] = useState("");

  const filtered = useMemo(() => {
    let result = listings.filter((x) => {
      const matchesQuery = x.handle.toLowerCase().includes(query.toLowerCase().replace("@", ""));
      const matchesCategory =
        category === "All" ||
        (category === "Rare" && ["Rare", "Ultra Rare", "Legendary"].includes(x.rarity)) ||
        (category === "Auctions" && x.auction) ||
        x.category === category;
      return matchesQuery && matchesCategory;
    });

    if (sort === "Price: Low") result = [...result].sort((a, b) => a.price - b.price);
    if (sort === "Price: High") result = [...result].sort((a, b) => b.price - a.price);
    if (sort === "Watchers") result = [...result].sort((a, b) => b.watchers - a.watchers);
    return result;
  }, [query, category, sort]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  };

  const toggleWatch = (handle: string) => {
    setWatching((current) =>
      current.includes(handle) ? current.filter((x) => x !== handle) : [...current, handle]
    );
    notify(currentIncludes(handle) ? `Removed @${handle} from watchlist` : `@${handle} added to watchlist`);
  };

  const currentIncludes = (handle: string) => watching.includes(handle);

  return (
    <div className="min-h-screen bg-[#f7f9fc] text-[#101828]">
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        button, input, select { font: inherit; }
        .scrollbar::-webkit-scrollbar { display: none; }
      `}</style>

      <header className="sticky top-0 z-30 border-b border-[#e6eaf0] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1240px] items-center gap-5 px-5 py-4">
          <div className="flex shrink-0 items-center gap-2.5">
            <div className="grid h-10 w-10 place-items-center rounded-[12px] bg-[#1f95ff] text-lg font-black text-white">A</div>
            <div>
              <div className="text-[17px] font-extrabold tracking-[-.4px]">AfuChat</div>
              <div className="text-[11px] font-medium text-[#98a2b3]">Username Marketplace</div>
            </div>
          </div>

          <div className="relative hidden max-w-[520px] flex-1 md:block">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#98a2b3]">⌕</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search usernames..."
              className="h-11 w-full rounded-xl border border-[#e1e6ed] bg-[#f8fafc] pl-11 pr-4 text-sm outline-none transition focus:border-[#1f95ff] focus:bg-white"
            />
          </div>

          <button className="ml-auto hidden rounded-xl border border-[#e1e6ed] bg-white px-4 py-2.5 text-sm font-semibold md:block">
            My usernames
          </button>
          <button className="grid h-10 w-10 place-items-center rounded-xl border border-[#e1e6ed] bg-white text-lg">◔</button>
          <div className="grid h-10 w-10 place-items-center rounded-full bg-[#dbeafe] font-bold text-[#1f72c8]">AK</div>
        </div>

        <div className="scrollbar mx-auto flex max-w-[1240px] gap-2 overflow-x-auto px-5 pb-3 md:hidden">
          {categories.map((item) => (
            <button key={item} onClick={() => setCategory(item)}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold ${category === item ? "bg-[#1f95ff] text-white" : "bg-[#f1f4f8] text-[#667085]"}`}>
              {item}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-[1240px] px-5 pb-20 pt-7">
        <section className="relative overflow-hidden rounded-[24px] bg-[#0e1825] px-6 py-8 text-white md:px-10 md:py-10">
          <div className="relative z-10 max-w-[650px]">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-[11px] font-bold">
              <span className="h-1.5 w-1.5 rounded-full bg-[#1f95ff]" /> AFUCHAT MARKETPLACE
            </div>
            <h1 className="max-w-[620px] text-3xl font-black tracking-[-1.4px] md:text-5xl">
              Own a username<br className="hidden md:block" /> people remember.
            </h1>
            <p className="mt-4 max-w-[560px] text-sm leading-6 text-[#aab6c5] md:text-base">
              Discover rare handles, buy a memorable identity, make offers and trade usernames directly inside AfuChat.
            </p>

            <div className="mt-6 flex max-w-[580px] items-center gap-2 rounded-2xl bg-white p-2">
              <span className="pl-3 text-[#98a2b3]">⌕</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Try @africa, @music or @ai"
                className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm text-[#101828] outline-none"
              />
              <button onClick={() => notify("Searching the marketplace...")}
                className="rounded-xl bg-[#1f95ff] px-5 py-2.5 text-sm font-bold text-white">
                Search
              </button>
            </div>
          </div>
          <div className="absolute -right-20 -top-28 h-[360px] w-[360px] rounded-full border-[70px] border-[#1f95ff]/10" />
          <div className="absolute -bottom-36 right-20 h-[300px] w-[300px] rounded-full border-[55px] border-white/5" />
        </section>

        <section className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ["12.8K", "Usernames listed"],
            ["2.4M", "ACoin traded"],
            ["1,842", "Sales this month"],
            ["96", "Live auctions"],
          ].map(([value, label]) => (
            <div key={label} className="border border-[#e6eaf0] bg-white px-5 py-4">
              <div className="text-xl font-black tracking-[-.5px]">{value}</div>
              <div className="mt-1 text-xs text-[#98a2b3]">{label}</div>
            </div>
          ))}
        </section>

        <section className="mt-9">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-[1.5px] text-[#1f95ff]">Discover</div>
              <h2 className="mt-1 text-2xl font-black tracking-[-.7px]">Featured usernames</h2>
            </div>
            <button onClick={() => setCategory("All")} className="text-sm font-bold text-[#1f95ff]">View all →</button>
          </div>

          <div className="scrollbar mt-5 flex gap-2 overflow-x-auto pb-1">
            {categories.map((item) => (
              <button key={item} onClick={() => setCategory(item)}
                className={`whitespace-nowrap border px-4 py-2 text-xs font-bold transition ${category === item ? "border-[#1f95ff] bg-[#1f95ff] text-white" : "border-[#e1e6ed] bg-white text-[#667085] hover:border-[#1f95ff]"}`}>
                {item}
              </button>
            ))}
            <div className="ml-auto hidden md:block">
              <select value={sort} onChange={(e) => setSort(e.target.value)}
                className="rounded-lg border border-[#e1e6ed] bg-white px-3 py-2 text-xs font-semibold outline-none">
                <option>Popular</option>
                <option>Price: Low</option>
                <option>Price: High</option>
                <option>Watchers</option>
              </select>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {filtered.map((item) => (
              <UsernameCard key={item.handle} item={item}
                watched={watching.includes(item.handle)}
                onWatch={() => toggleWatch(item.handle)}
                onOpen={() => setSelected(item)} />
            ))}
          </div>

          {!filtered.length && (
            <div className="border border-dashed border-[#d5dce5] bg-white py-16 text-center">
              <div className="text-3xl">⌕</div>
              <div className="mt-3 font-bold">No usernames found</div>
              <div className="mt-1 text-sm text-[#98a2b3]">Try a different search or category.</div>
            </div>
          )}
        </section>

        <section className="mt-12">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-[1.5px] text-[#1f95ff]">Live now</div>
              <h2 className="mt-1 text-2xl font-black tracking-[-.7px]">Username auctions</h2>
            </div>
            <button onClick={() => setCategory("Auctions")} className="text-sm font-bold text-[#1f95ff]">See auctions →</button>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {listings.filter(x => x.auction).map(item => (
              <div key={item.handle} className="flex items-center gap-4 border border-[#e6eaf0] bg-white p-4">
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[#edf6ff] text-xl font-black text-[#1f95ff]">
                  @{item.handle.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 font-extrabold">@{item.handle} <span className="text-[#1f95ff]">✓</span></div>
                  <div className="mt-1 text-xs text-[#98a2b3]">{item.watchers} watching · {item.rarity}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-[#98a2b3]">Current bid</div>
                  <div className="font-black">{money(item.price)}</div>
                  <button onClick={() => setSelected(item)} className="mt-2 text-xs font-bold text-[#1f95ff]">Place bid →</button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12 grid gap-4 md:grid-cols-3">
          {[
            ["01", "Find", "Search millions of memorable usernames and discover rare handles."],
            ["02", "Own", "Buy instantly or make an offer using your AfuChat balance."],
            ["03", "Trade", "List usernames you own and build your digital username portfolio."],
          ].map(([num, title, text]) => (
            <div key={num} className="border border-[#e6eaf0] bg-white p-6">
              <div className="text-xs font-black text-[#1f95ff]">{num}</div>
              <div className="mt-4 text-lg font-black">{title}</div>
              <div className="mt-2 text-sm leading-6 text-[#667085]">{text}</div>
            </div>
          ))}
        </section>
      </main>

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-[#101828] px-5 py-3 text-sm font-semibold text-white">
          {toast}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-40 grid place-items-end bg-black/40 p-0 md:place-items-center md:p-5" onMouseDown={(e) => {
          if (e.target === e.currentTarget) setSelected(null);
        }}>
          <div className="w-full max-w-[560px] rounded-t-[26px] bg-white p-6 md:rounded-[24px]">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs font-bold uppercase tracking-[1.5px] text-[#1f95ff]">{selected.rarity}</div>
                <h3 className="mt-1 text-3xl font-black tracking-[-1px]">@{selected.handle}</h3>
                <div className="mt-2 text-sm text-[#667085]">{selected.category} · {selected.watchers} people watching</div>
              </div>
              <button onClick={() => setSelected(null)} className="grid h-9 w-9 place-items-center rounded-full bg-[#f2f4f7] text-[#667085]">×</button>
            </div>

            <div className="mt-6 rounded-2xl bg-[#f7f9fc] p-5">
              <div className="text-xs text-[#98a2b3]">Current price</div>
              <div className="mt-1 text-3xl font-black">{money(selected.price)}</div>
              <div className="mt-2 text-xs text-[#98a2b3]">Estimated market value: {money(Math.round(selected.price * 1.12))}</div>
            </div>

            {selected.auction ? (
              <div className="mt-4">
                <div className="mb-2 text-xs font-bold text-[#667085]">Your bid</div>
                <div className="flex gap-2">
                  <input value={offer} onChange={e => setOffer(e.target.value)} placeholder="Enter ACoin amount"
                    className="h-12 min-w-0 flex-1 rounded-xl border border-[#dfe4ea] px-4 text-sm outline-none focus:border-[#1f95ff]" />
                  <button onClick={() => notify("Bid submitted")} className="rounded-xl bg-[#1f95ff] px-5 font-bold text-white">Place bid</button>
                </div>
              </div>
            ) : (
              <>
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button onClick={() => notify(`Purchase flow started for @${selected.handle}`)}
                    className="rounded-xl bg-[#1f95ff] py-3.5 text-sm font-bold text-white">Buy now</button>
                  <button onClick={() => notify("Username added to watchlist")}
                    className="rounded-xl border border-[#dfe4ea] py-3.5 text-sm font-bold">Watch username</button>
                </div>
                <div className="mt-4 border-t border-[#edf0f3] pt-4">
                  <div className="mb-2 text-xs font-bold text-[#667085]">Make an offer</div>
                  <div className="flex gap-2">
                    <input value={offer} onChange={e => setOffer(e.target.value)} placeholder="Your ACoin offer"
                      className="h-11 min-w-0 flex-1 rounded-xl border border-[#dfe4ea] px-4 text-sm outline-none focus:border-[#1f95ff]" />
                    <button onClick={() => notify("Offer sent to the owner")} className="rounded-xl border border-[#1f95ff] px-4 text-sm font-bold text-[#1f95ff]">Send offer</button>
                  </div>
                </div>
              </>
            )}

            <div className="mt-5 text-center text-[11px] leading-5 text-[#98a2b3]">
              Username transfers are handled by AfuChat. Protected names and impersonation attempts may be restricted.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UsernameCard({
  item, watched, onWatch, onOpen
}: {
  item: Username;
  watched: boolean;
  onWatch: () => void;
  onOpen: () => void;
}) {
  return (
    <div className="group border border-[#e6eaf0] bg-white transition hover:-translate-y-0.5 hover:border-[#cbd5e1]">
      <div className="relative flex h-40 items-center justify-center overflow-hidden bg-[#f3f8fd]">
        <div className="absolute left-4 top-4 rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-[#667085]">
          {item.rarity}
        </div>
        <button onClick={onWatch} className={`absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full ${watched ? "bg-[#1f95ff] text-white" : "bg-white text-[#667085]"}`}>
          {watched ? "♥" : "♡"}
        </button>
        <div className="text-4xl font-black tracking-[-2px] text-[#1f95ff]">@{item.handle}</div>
      </div>

      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 font-extrabold">@{item.handle} {item.verified && <span className="text-[#1f95ff]">✓</span>}</div>
          <div className="text-[10px] text-[#98a2b3]">{item.watchers} watching</div>
        </div>
        <div className="mt-1 text-xs text-[#98a2b3]">{item.category}</div>
        <div className="mt-4 flex items-end justify-between">
          <div>
            <div className="text-[10px] text-[#98a2b3]">{item.auction ? "Current bid" : "Buy now"}</div>
            <div className="font-black">{money(item.price)}</div>
          </div>
          <button onClick={onOpen} className="rounded-lg bg-[#101828] px-3.5 py-2 text-xs font-bold text-white">
            {item.auction ? "Bid" : "View"}
          </button>
        </div>
      </div>
    </div>
  );
}
