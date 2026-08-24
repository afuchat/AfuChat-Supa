import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { GOOGLE_WEB_CLIENT_ID } from "@/lib/env";

type GoogleCredentialResponse = { credential?: string };

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (options: {
            client_id: string;
            callback: (response: GoogleCredentialResponse) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
            use_fedcm_for_prompt?: boolean;
          }) => void;
          prompt: () => void;
        };
      };
    };
  }
}

const GIS_URL = "https://accounts.google.com/gsi/client";

function loadGoogleIdentityServices(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.accounts?.id) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Google Identity Services failed to load.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = GIS_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Identity Services failed to load."));
    document.head.appendChild(script);
  });
}

export default function GoogleOneTap({
  onCredential,
}: {
  onCredential: (idToken: string) => void | Promise<void>;
}) {
  const startedRef = useRef(false);

  useEffect(() => {
    if (Platform.OS !== "web" || !GOOGLE_WEB_CLIENT_ID || startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;

    loadGoogleIdentityServices()
      .then(() => {
        if (cancelled || !window.google?.accounts?.id) return;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_WEB_CLIENT_ID,
          callback: (response) => {
            if (!cancelled && response.credential) {
              void onCredential(response.credential);
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
          use_fedcm_for_prompt: true,
        });
        window.google.accounts.id.prompt();
      })
      .catch(() => {
        // The regular Continue with Google button remains available when GIS
        // is blocked by a browser extension, privacy setting, or CSP.
      });

    return () => {
      cancelled = true;
    };
  }, [onCredential]);

  return null;
}