/**
 * Postinstall script to patch GitHub-installed monorepo packages.
 *
 * @agora/agent-ui-kit is a Turborepo monorepo. When installed from GitHub,
 * the root package.json lacks main/exports fields pointing to the actual
 * source. This script patches them so Next.js can resolve imports.
 */
const fs = require("fs");
const path = require("path");

function patchPackage(pkgPath, patches) {
  try {
    const json = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    let changed = false;
    for (const [key, value] of Object.entries(patches)) {
      if (JSON.stringify(json[key]) !== JSON.stringify(value)) {
        json[key] = value;
        changed = true;
      }
    }
    if (changed) {
      fs.writeFileSync(pkgPath, JSON.stringify(json, null, 2) + "\n");
      console.log(`[postinstall] patched ${pkgPath}`);
    }
  } catch (e) {
    if (e.code !== "ENOENT") console.warn(`[postinstall] warning: ${e.message}`);
  }
}

// Patch @agora/agent-ui-kit monorepo root
patchPackage(
  path.join(__dirname, "..", "node_modules", "@agora", "agent-ui-kit", "package.json"),
  {
    main: "./packages/uikit/src/index.ts",
    module: "./packages/uikit/src/index.ts",
    types: "./packages/uikit/src/index.ts",
    exports: {
      ".": "./packages/uikit/src/index.ts",
      "./thymia": "./packages/uikit/src/thymia/index.ts",
    },
  }
);
