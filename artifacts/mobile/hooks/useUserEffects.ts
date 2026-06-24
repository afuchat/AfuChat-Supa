import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type UserEffects = {
  goldNameplate: boolean;
  verifiedStar: boolean;
};

const EFFECT_IDS = ["sg4", "sg5"] as const;

const cache = new Map<string, UserEffects>();
const pending = new Map<string, Promise<void>>();
const listeners = new Map<string, Set<() => void>>();

function notify(userId: string) {
  listeners.get(userId)?.forEach((fn) => fn());
}

function fetchEffects(userId: string): Promise<void> {
  if (cache.has(userId)) return Promise.resolve();
  if (pending.has(userId)) return pending.get(userId)!;

  const promise = supabase
    .from("status_goods_purchases")
    .select("good_id")
    .eq("user_id", userId)
    .eq("equipped", true)
    .in("good_id", EFFECT_IDS)
    .then(({ data }) => {
      const ids = new Set((data ?? []).map((d: any) => d.good_id as string));
      cache.set(userId, {
        goldNameplate: ids.has("sg4"),
        verifiedStar: ids.has("sg5"),
      });
      pending.delete(userId);
      notify(userId);
    })
    .catch(() => {
      cache.set(userId, { goldNameplate: false, verifiedStar: false });
      pending.delete(userId);
      notify(userId);
    });

  pending.set(userId, promise);
  return promise;
}

export function useUserEffects(userId: string | null | undefined): UserEffects {
  const [effects, setEffects] = useState<UserEffects>(() =>
    userId
      ? (cache.get(userId) ?? { goldNameplate: false, verifiedStar: false })
      : { goldNameplate: false, verifiedStar: false }
  );

  useEffect(() => {
    if (!userId) return;

    if (cache.has(userId)) {
      setEffects(cache.get(userId)!);
      return;
    }

    let mounted = true;
    const listener = () => {
      if (mounted) setEffects(cache.get(userId) ?? { goldNameplate: false, verifiedStar: false });
    };

    if (!listeners.has(userId)) listeners.set(userId, new Set());
    listeners.get(userId)!.add(listener);
    fetchEffects(userId);

    return () => {
      listeners.get(userId)?.delete(listener);
      mounted = false;
    };
  }, [userId]);

  return effects;
}

export function invalidateUserEffects(userId: string) {
  cache.delete(userId);
}
