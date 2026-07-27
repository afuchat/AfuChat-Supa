module.exports = function (api) {
  api.cache(true);
  const isProd = process.env.NODE_ENV === "production" || process.env.BABEL_ENV === "production";
  // Reanimated 4 uses Worklets as its Babel transform. The Reanimated
  // compatibility re-export still exists, but using the canonical plugin
  // avoids mixing the legacy plugin entry point with the Worklets runtime.
  const plugins = ["react-native-worklets/plugin"];
  if (isProd) {
    plugins.push(["transform-remove-console", { exclude: ["error"] }]);
  }
  return {
    presets: [["babel-preset-expo", { unstable_transformImportMeta: true }]],
    plugins,
  };
};
