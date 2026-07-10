import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AfuChat — Desktop",
  description: "AfuChat for desktop: chat, feed, and your network in one clean workspace.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
