"use client";

import { useEffect } from "react";
import { useAuthOptional } from "../contexts/AuthContext";
import { useAuthModalOptional } from "../contexts/AuthModalContext";

/**
 * Wraps routes that require authentication.
 * Instead of hard-redirecting to /login, it opens the auth sheet in place
 * so the user stays on the current page and picks up right where they left off.
 */
export default function ClientAuthGuard({ children }: { children: React.ReactNode }) {
  const auth      = useAuthOptional();
  const authModal = useAuthModalOptional();

  useEffect(() => {
    if (!auth?.loading && !auth?.user) {
      // Open the sheet; if context isn't available fall back to URL nav
      if (authModal) {
        authModal.openAuth("signin", "default");
      } else {
        const next = encodeURIComponent(window.location.pathname);
        window.location.replace(`/feed?auth=signin&next=${next}`);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.loading, auth?.user]);

  // Still loading — show spinner
  if (!auth || auth.loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#1f95ff] border-t-transparent" />
      </div>
    );
  }

  // Not signed in — render nothing; the sheet is open
  if (!auth.user) return null;

  return <>{children}</>;
}
