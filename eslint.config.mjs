import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".private/**",
    "outputs/**",
    "archive/**",
    "archives/**",
    "EMETSEES-*/**",
    "sources/**",
    "build-*.cjs",
    "scripts/**",
    "supabase/**",
    "public/scripture/runtime/**",
    "app/lib/emet/contracts.js",
  ]),
  {
    files: ["app/**/*.{js,jsx,ts,tsx}"],
    rules: {
      // The application contains deliberate state synchronization effects for
      // localStorage, browser viewport state, and route-owned panels. These
      // remain covered by hooks dependency and correctness rules.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: ["app/lib/see/SeeStore.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: ["app/components/WordStudySheet.tsx"],
    rules: {
      // This stateful sheet resets and restores a verified lexical navigation
      // session when its source entity changes. Those transitions intentionally
      // synchronize React state with sessionStorage and the active entity.
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
