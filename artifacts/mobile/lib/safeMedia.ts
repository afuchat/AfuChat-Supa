type MediaPlayer = {
  play?: () => unknown;
  pause?: () => unknown;
};

function safelyInvoke(action?: () => unknown) {
  try {
    const result = action?.();
    if (result && typeof (result as { catch?: unknown }).catch === "function") {
      void Promise.resolve(result).catch(() => {});
    }
  } catch {
    // Media can be unavailable while a source is loading or unmounting.
  }
}

export function safePlay(player: MediaPlayer | null | undefined) {
  safelyInvoke(() => player?.play?.());
}

export function safePause(player: MediaPlayer | null | undefined) {
  safelyInvoke(() => player?.pause?.());
}