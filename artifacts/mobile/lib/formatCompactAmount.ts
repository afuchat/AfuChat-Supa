export function formatCompactAmount(value: number | null | undefined): string {
  const amount = Number(value) || 0;
  if (amount >= 1_000_000_000) return `${trimCompact(amount / 1_000_000_000)}B`;
  if (amount >= 1_000_000) return `${trimCompact(amount / 1_000_000)}M`;
  if (amount >= 1_000) return `${trimCompact(amount / 1_000)}K`;
  return String(Math.floor(amount));
}

function trimCompact(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}