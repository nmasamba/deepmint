// Shared ESLint flat config (ESLint 9): eslint:recommended plus
// typescript-eslint's recommended rules. Each app extends it from its own
// eslint.config.mjs.
const js = require("@eslint/js");
const tseslint = require("@typescript-eslint/eslint-plugin");

module.exports = [
  { ignores: ["**/dist/**", "**/node_modules/**", "**/.next/**"] },
  js.configs.recommended,
  ...tseslint.configs["flat/recommended"],
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": "warn",
    },
  },
];
