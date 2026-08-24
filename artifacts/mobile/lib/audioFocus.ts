type AudioFocusListener = () => void;

const listeners = new Set<AudioFocusListener>();

export const audioFocus = {
  subscribe(listener: AudioFocusListener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  claimRecording() {
    // Copy first so a listener can safely unsubscribe while stopping.
    [...listeners].forEach((listener) => {
      try {
        listener();
      } catch {}
    });
  },
};