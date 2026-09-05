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
    // Vendored binaries and minified bundles copied in by
    // scripts/copy-vad-assets.mjs. Linting a minified worklet reports dozens
    // of problems in code this project does not own or edit.
    "public/vad/**",
  ]),
]);

export default eslintConfig;
