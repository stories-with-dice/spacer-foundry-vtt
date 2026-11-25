import js from "@eslint/js";
import globals from "globals";

/** Foundry VTT globals available in the browser (v13 and v14). */
const foundryGlobals = Object.fromEntries([
  "foundry", "game", "ui", "canvas", "CONFIG", "CONST", "Hooks", "Roll", "ChatMessage", "Actor", "Item",
  "Combat", "Folder", "JournalEntry", "RollTable", "Macro", "TextEditor", "fromUuid", "fromUuidSync",
  "Dialog", "Handlebars", "ActiveEffect", "Token", "Scene", "User", "socketlib"
].map(name => [name, "readonly"]));

export default [
  { ignores: ["node_modules/**", "packs/**", "build/**", "sources/**", "test-results/**",
    // Browser test scripts are function bodies with top-level await and return; no parser mode allows both.
    "test/foundry/**"] },
  js.configs.recommended,
  {
    files: ["module/**/*.mjs"],
    languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: { ...globals.browser, ...foundryGlobals } },
    rules: {
      "no-unused-vars": ["warn", { args: "none", varsIgnorePattern: "^_", caughtErrors: "none" }],
      "no-empty": ["error", { allowEmptyCatch: true }]
    }
  },
  {
    // Pure rules code: no Foundry or browser globals, so node:test can run it.
    files: ["module/**/rules/**/*.mjs", "module/shared/dice.mjs", "module/config.mjs"],
    languageOptions: { globals: { ...globals.es2024, globalThis: "readonly" } }
  },
  {
    files: ["tools/**/*.mjs", "test/**/*.mjs", "eslint.config.mjs"],
    languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: { ...globals.node } },
    rules: { "no-unused-vars": ["warn", { args: "none", caughtErrors: "none" }] }
  },
];
