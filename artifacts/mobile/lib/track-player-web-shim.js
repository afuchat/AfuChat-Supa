// Track Player is native-only in AfuChat. Keep Metro's web bundle from
// traversing the package's optional Shaka Player implementation.
const noop = () => {};
const asyncNoop = async () => {};

const TrackPlayer = {
  add: asyncNoop,
  addEventListener: () => ({ remove: noop }),
  getActiveTrackIndex: async () => undefined,
  getPlaybackState: async () => ({ state: "none" }),
  getProgress: async () => ({ position: 0, duration: 0, buffered: 0 }),
  pause: asyncNoop,
  play: asyncNoop,
  registerPlaybackService: noop,
  reset: asyncNoop,
  seek: asyncNoop,
  seekBy: asyncNoop,
  seekTo: asyncNoop,
  setQueue: asyncNoop,
  skip: asyncNoop,
  skipToNext: asyncNoop,
  skipToPrevious: asyncNoop,
  stop: asyncNoop,
  updateMetadataForTrack: asyncNoop,
  updateOptions: asyncNoop,
  setupPlayer: asyncNoop,
};

module.exports = {
  __esModule: true,
  default: TrackPlayer,
  Capability: {},
  AppKilledPlaybackBehavior: {},
  Event: {},
  State: { None: "none", Playing: "playing", Paused: "paused", Ended: "ended" },
};