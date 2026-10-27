import base from "@deepmint/eslint-config";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  ...base,
  { ignores: ["public/sw.js", "next-env.d.ts"] },
  reactHooks.configs["recommended-latest"],
  {
    plugins: { "@next/next": nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },
  {
    // Broken by existing code: warnings until that code is fixed, so turning
    // lint on changes no source file.
    rules: {
      "@next/next/no-assign-module-variable": "warn",
    },
  },
];
