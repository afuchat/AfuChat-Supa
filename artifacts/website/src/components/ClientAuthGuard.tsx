"use client";

import { useEffect } from "react";
import { useAuthOptional } from "../contexts/AuthContext";

export default function ClientAuthGuard({ children }: { children: React.ReactNode }) {
  const auth = useAuthOptional();

  useEffect(() => {
    if (!auth?.loading && !auth?.user) {
      const next = encodeURIComponent(window.location.pathname);
      window.location.replace(`/login?next=${next}`);
    }
  }, [auth?.loading, auth?.user]);

  if (!auth || auth.loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#1f95ff] border-t-transparent" />
      </div>
    );
  }

  if (!auth.user) return null;

  return <>{children}</>;
}
