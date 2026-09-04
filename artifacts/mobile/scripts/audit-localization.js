#!/usr/bin/env node

/**
 * Small dependency-free localization audit.
 *
 * This intentionally checks the source files rather than importing the
 * TypeScript catalog. It can run before Metro, on a clean checkout, and in
 * CI. Legacy English phrase keys are reported as backlog; semantic keys are
 * the enforced contract for migrated UI.
 */

const fs = require("fs");
const path = require("path");

const mobileRoot = path.resolve(__dirname, "..");
const sourceRoots = ["app", "components", "context", "lib"].map((dir) =>
  path.join(mobileRoot, dir),
);
const catalogPath = path.join(mobileRoot, "lib", "uiTranslations.ts");
const semanticStart = "const SEMANTIC_UI_TABLES";
const semanticEnd = "const REGISTERED_UI_TEXTS";
const supportedLanguages = ["en", "sw", "fr", "es", "ar", "zh", "am", "rw"];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return /\.(tsx?|jsx?)$/.test(entry.name) ? [fullPath] : [];
  });
}

function sectionFor(catalog, language) {
  const start = catalog.indexOf(`  ${language}: {`);
  if (start < 0) return "";
  const end = catalog.indexOf("\n  },", start);
  return catalog.slice(start, end < 0 ? catalog.length : end);
}

function quotedKeys(section) {
  return [...section.matchAll(/"([^"]+)":\s*"/g)].map((match) => match[1]);
}

function collectSourceKeys(files) {
  const keys = new Set();
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/\bt\(\s*["']([^"']+)["']/g)) {
      if (/^[a-z][\w-]*\.[a-z][\w-]*$/.test(match[1])) keys.add(match[1]);
    }
    for (const match of source.matchAll(/\b(?:label|badge)=["']([a-z][\w-]*\.[^"']+)["']/g)) {
      keys.add(match[1]);
    }
  }
  return keys;
}

function collectLiteralBacklog(files) {
  const findings = [];
  const ignored = new Set(["true", "false", "none"]);
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const lines = source.split(/\r?\n/);
    lines.forEach((line, index) => {
      const textChild = line.match(/<Text\b[^>]*>\s*([A-Za-z][^<{]*?)\s*<\/Text>/);
      const stringProp = line.match(
        /\b(?:placeholder|accessibilityLabel|accessibilityHint|title|label|description|message)=["']([A-Za-z][^"']*)["']/,
      );
      const match = textChild || stringProp;
      if (!match || ignored.has(match[1].trim())) return;
      if (/^\s*(https?:\/\/|[A-Z_]+$)/.test(match[1])) return;
      findings.push(`${path.relative(mobileRoot, file)}:${index + 1}: ${match[1].trim()}`);
    });
  }
  return findings;
}

const catalog = fs.readFileSync(catalogPath, "utf8");
const semanticCatalog = catalog.slice(
  catalog.indexOf(semanticStart),
  catalog.indexOf(semanticEnd),
);
const languageKeys = Object.fromEntries(
  supportedLanguages.map((language) => [language, quotedKeys(sectionFor(semanticCatalog, language))]),
);
const englishKeys = new Set(languageKeys.en);
const files = sourceRoots.flatMap(walk);
const usedKeys = collectSourceKeys(files);
const missing = [...usedKeys].filter((key) => key.includes(".") && !englishKeys.has(key)).sort();
const missingByLanguage = Object.fromEntries(
  supportedLanguages
    .filter((language) => language !== "en")
    .map((language) => [language, [...englishKeys].filter((key) => !languageKeys[language].includes(key))]),
);
const duplicateKeys = Object.fromEntries(
  supportedLanguages
    .map((language) => {
      const keys = languageKeys[language];
      return [language, [...new Set(keys.filter((key, index) => keys.indexOf(key) !== index))]];
    })
    .filter(([, keys]) => keys.length > 0),
);
const literalBacklog = collectLiteralBacklog(files);

console.log(`Localization audit: ${files.length} source files`);
console.log(`Semantic catalog: ${englishKeys.size} keys`);
console.log(`Semantic keys used: ${[...usedKeys].filter((key) => key.includes(".")).length}`);
console.log(`Literal UI backlog: ${literalBacklog.length} findings`);

if (missing.length) {
  console.error("\nMissing semantic keys:");
  missing.forEach((key) => console.error(`  - ${key}`));
}

for (const [language, keys] of Object.entries(missingByLanguage)) {
  if (keys.length) {
    console.error(`\nMissing ${language} translations (${keys.length}):`);
    keys.forEach((key) => console.error(`  - ${key}`));
  }
}

if (Object.keys(duplicateKeys).length) {
  console.error("\nDuplicate semantic keys:");
  for (const [language, keys] of Object.entries(duplicateKeys)) {
    console.error(`  ${language}: ${keys.join(", ")}`);
  }
}

if (literalBacklog.length) {
  console.log("\nRemaining literal UI copy (migration backlog, not a failure):");
  literalBacklog.slice(0, 25).forEach((finding) => console.log(`  - ${finding}`));
  if (literalBacklog.length > 25) console.log(`  … ${literalBacklog.length - 25} more`);
}

if (missing.length || Object.keys(duplicateKeys).length ||
    Object.values(missingByLanguage).some((keys) => keys.length)) {
  process.exitCode = 1;
}