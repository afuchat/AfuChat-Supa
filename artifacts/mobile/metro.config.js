const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Explicitly pin projectRoot to artifacts/mobile so Metro doesn't pick up the
// pnpm workspace root as the project root in a monorepo layout.
config.projectRoot = __dirname;

// Exclude the mockup-sandbox vite build artefacts from Metro's file watcher.
// Without this, Metro crashes with ENOENT when Vite rotates its deps_temp_*
// directories during a hot-reload cycle.
config.resolver = {
  ...(config.resolver || {}),
  // Allow Metro to treat .wasm files as static assets rather than JS modules.
  // expo-sqlite's web worker references wa-sqlite.wasm which is not shipped in
  // the npm package; without this, web bundling fails with "Unable to resolve
  // module ./wa-sqlite/wa-sqlite.wasm". The expo-sqlite resolveRequest shim
  // below means the wasm is never actually loaded at runtime on web.
  assetExts: [...(config.resolver?.assetExts ?? []), "wasm"],
  blockList: [
    /artifacts[\\/]mockup-sandbox[\\/].*/,
    /node_modules[\\/]\.pnpm[\\/].*_tmp_\d+/,
    // typedoc's inner node_modules symlink doesn't exist in pnpm's virtual store
    /node_modules[\\/]\.pnpm[\\/]typedoc[^/]*[\\/]node_modules[\\/]typedoc[\\/]node_modules.*/,
    // require-main-filename pnpm entry is a broken symlink — exclude to prevent ENOENT watcher crash
    /node_modules[\\/]\.pnpm[\\/]require-main-filename[^/]*[\\/]node_modules[\\/]require-main-filename.*/,
    // sucrase dist/esm is missing in pnpm virtual store — exclude to prevent ENOENT watcher crash
    /node_modules[\\/]\.pnpm[\\/]sucrase[^/]*[\\/]node_modules[\\/]sucrase[\\/]dist[\\/]esm.*/,
    // react-native-mmkv cpp/ios/src dirs missing in pnpm virtual store
    /node_modules[\\/]\.pnpm[\\/]react-native-mmkv[^/]*[\\/]node_modules[\\/]react-native-mmkv[\\/](cpp|ios|src).*/,
    // recharts umd dir missing in pnpm virtual store
    /node_modules[\\/]\.pnpm[\\/]recharts[^/]*[\\/]node_modules[\\/]recharts[\\/]umd.*/,
    // date-fns _lib dir missing in pnpm virtual store — exclude to prevent ENOENT watcher crash
    /node_modules[\\/]\.pnpm[\\/]date-fns[^/]*[\\/]node_modules[\\/]date-fns[\\/]_lib.*/,
  ],
  // Enable symlink following so Metro resolves pnpm's content-addressed store
  // correctly on Android (pnpm creates symlinks that Metro doesn't follow by default).
  unstable_enableSymlinks: true,
  // Explicit node_modules search paths: mobile-local first, then workspace root.
  // This ensures packages hoisted by pnpm to the workspace root are found.
  nodeModulesPaths: [
    path.resolve(__dirname, "node_modules"),
    path.resolve(__dirname, "../../node_modules"),
  ],
};

/**
 * EXPO_NO_LAZY=1 is set in the workflow env so Metro never uses multipart/mixed
 * streaming responses. This prevents the "Error while reading multipart response"
 * crash that Expo Go on Android shows when the bundle download is interrupted by
 * the Replit tunnel proxy.
 *
 * Additional hardening here:
 *  - Increased socket timeout to handle proxy latency
 *  - Fewer transformer workers to avoid OOM pressure during first bundle
 */

// Limit worker threads — large projects + Replit's 2 GB RAM limit = OOM risk
config.maxWorkers = 2;

// Transformer: use fewer inline requires to reduce bundle complexity
config.transformer = {
  ...(config.transformer || {}),
  minifierConfig: {
    ...(config.transformer?.minifierConfig || {}),
  },
  // Defer module evaluation until first use — faster startup, less memory
  getTransformOptions: async () => ({
    transform: {
      experimentalImportSupport: false,
      inlineRequires: true,
    },
  }),
};

const originalEnhance = config.server?.enhanceMiddleware;
config.server = {
  ...(config.server || {}),
  enhanceMiddleware: (middleware, server) => {
    const wrapped = originalEnhance
      ? originalEnhance(middleware, server)
      : middleware;
    return (req, res, next) => {
      // Extend socket timeout for all requests — Replit proxy adds latency and
      // the default 30 s timeout kills large bundle transfers on slow connections.
      req.socket?.setTimeout?.(120_000);
      res.setTimeout?.(120_000);
      return wrapped(req, res, next);
    };
  },
};

module.exports = config;
