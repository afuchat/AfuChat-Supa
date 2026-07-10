import { LOGO_BLACK_B64 } from "../lib/logoAssets";

/** AfuChat brand mark — same asset used by the mobile app (light-theme variant). */
export default function Logo({ size = 32 }: { size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={LOGO_BLACK_B64} alt="AfuChat" width={size} height={size} className="rounded-lg" />;
}
