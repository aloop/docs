import { defineConfig } from "astro/config";
import remarkCodeTitles from "remark-code-titles";

// The following theme is from https://github.com/catppuccin/vscode/tree/compiled
import catppuccinTheme from "./catppuccin-highlight.json";

const headings = ["h1", "h2", "h3", "h4", "h5", "h6"];

// https://astro.build/config
export default defineConfig({
  markdown: {
    shikiConfig: {
      theme: catppuccinTheme,
    },
    remarkPlugins: [remarkCodeTitles],
    rehypePlugins: [
      [
        "rehype-rewrite",
        {
          rewrite: (node, index, parent) => {
            if (
              node.type === "raw" &&
              node.value.startsWith('<pre class="astro-code')
            ) {
              node.value = `<figure class="c-Highlight" data-code-block><figcaption class="c-Highlight-title" data-code-block-title># code</figcaption>${node.value}</figure>`;
            }

            if (node.type === "element" && headings.includes(node.tagName)) {
            }
          },
        },
      ],
    ],
  },
});
