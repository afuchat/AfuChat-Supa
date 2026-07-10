"use client";

import ClientAuthGuard from "../../../components/ClientAuthGuard";
import ChatsClient from "./ChatsClient";

export default function ChatsPage() {
  return (
    <ClientAuthGuard>
      <ChatsClient />
    </ClientAuthGuard>
  );
}
