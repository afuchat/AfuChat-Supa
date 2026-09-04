import React, { createContext, useContext, useMemo, useRef } from "react";

type ScrollLockValue = { value: boolean };

export type TabSwipeCtxType = {
  horizontalScrollActive: ScrollLockValue;
};

export const TabSwipeContext = createContext<TabSwipeCtxType>({
  horizontalScrollActive: { value: false },
});

export function TabSwipeProvider({ children }: { children: React.ReactNode }) {
  // This value is only read and written by JavaScript scroll callbacks. It
  // does not need to be a Reanimated shared value. Keeping it as a plain
  // stable object avoids initializing Reanimated's native worklet runtime
  // while the first tab screen is mounting in a release APK.
  const horizontalScrollActive = useRef<ScrollLockValue>({ value: false }).current;
  const ctx = useMemo(() => ({ horizontalScrollActive }), [horizontalScrollActive]);
  return (
    <TabSwipeContext.Provider value={ctx}>
      {children}
    </TabSwipeContext.Provider>
  );
}

export function useHorizontalScrollLock(): ScrollLockValue {
  return useContext(TabSwipeContext).horizontalScrollActive;
}
