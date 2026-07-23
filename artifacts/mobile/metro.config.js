const { getDefaultConfig } = require("expo/metro-config");
const http = require("http");
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
  // On web, use the Reanimated mock instead of the real library.
  // The real react-native-reanimated@4 uses react-native-worklets which crashes
  // in JSWorklets mode (web) with "createSerializableObject should never be called".
  resolveRequest: (context, moduleName, platform) => {
    if (platform === "web") {
      if (moduleName === "react-native-reanimated") {
        return { filePath: path.resolve(__dirname, "lib/reanimated-web-shim.js"), type: "sourceFile" };
      }
      if (moduleName === "react-native-worklets") {
        return { filePath: path.resolve(__dirname, "lib/worklets-web-shim.js"), type: "sourceFile" };
      }
      if (moduleName === "react-native-pager-view") {
        return { filePath: path.resolve(__dirname, "lib/pager-view-web-shim.js"), type: "sourceFile" };
      }
      if (moduleName === "expo-sqlite") {
        return { filePath: path.resolve(__dirname, "lib/expo-sqlite-web-shim.js"), type: "sourceFile" };
      }
    }
    return context.resolveRequest(context, moduleName, platform);
  },
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

/**
 * Dev-only proxy: forward all `/api/*` requests to the local API server
 * (Express, port 3000 by default). Without this, fetch("/api/...") on the
 * web bundle would hit Metro itself, which returns the SPA index.html and
 * causes "Failed to execute 'json' on 'Response': Unexpected token '<'"
 * errors in the client.
 */
const API_TARGET_PORT = parseInt(process.env.API_PORT || "3000", 10);
const API_TARGET_HOST = process.env.API_HOST || "127.0.0.1";

function proxyApi(req, res) {
  const options = {
    hostname: API_TARGET_HOST,
    port: API_TARGET_PORT,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `${API_TARGET_HOST}:${API_TARGET_PORT}` },
  };
  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });
  proxyReq.on("error", (err) => {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: `API server unreachable on ${API_TARGET_HOST}:${API_TARGET_PORT}: ${err.message}`,
      }),
    );
  });
  if (req.method !== "GET" && req.method !== "HEAD") {
    req.pipe(proxyReq, { end: true });
  } else {
    proxyReq.end();
  }
}

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

      // For web/browser requests: prevent proxy caching of stale HTML/manifests.
      // For native bundle requests (.bundle): allow Expo Go to cache locally so
      // the phone does not have to re-download the full 2 MB bundle on every launch.
      // Serving .bundle without no-store is safe — Metro invalidates on code change.
      const isNativeBundle = req.url?.includes(".bundle");
      if (!isNativeBundle) {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
        res.setHeader("Pragma", "no-cache");
      }

      if (req.url && req.url.startsWith("/api/")) {
        return proxyApi(req, res);
      }
      return wrapped(req, res, next);
    };
  },
};

module.exports = config;
