import { defineConfig } from "astro/config";
import expressiveCode from "astro-expressive-code";

import { remarkModifiedTime } from "./plugins/remark-modified-time.mjs";
import macchiato from "@catppuccin/vscode/themes/macchiato.json" with { type: "json" };

// https://astro.build/config
export default defineConfig({
  markdown: {
    remarkPlugins: [remarkModifiedTime],
  },
  integrations: [
    expressiveCode({
      themes: [macchiato],
      styleOverrides: {
        borderRadius: "0px",
        borderColor: "var(--code-border-color)",
        borderWidth: "1px",
        codeBackground: "var(--code-bg)",
        codeFontFamily: "inherit",
        frames: {
          //editorTabBarBorderBottomColor: "var(--code-border-color)",
          //terminalTitlebarBorderBottomColor: "var(--code-border-color)",
          editorActiveTabIndicatorTopColor: "transparent",
          terminalBackground: "var(--code-bg)",
        },
      },
    }),
  ],
});
