const purgecss = require("@fullhuman/postcss-purgecss");
const cssnano = require("cssnano");

const defaultExtractor = (content) => content.match(/[\w-/.:@]+(?<!:)/g) || [];

const purgecssConfig = {
  content: ["src/**/*.{astro,md}", "astro.config.mjs"],
  extractors: [
    {
      extractor: defaultExtractor,
      extensions: ["astro"],
    },
  ],
  variables: true,
  safelist: [/^(is-|has-|will-|js-)/],
};

module.exports = {
  //plugins: [require("autoprefixer"), purgecss(purgecssConfig), cssnano()],
  plugins: [require("autoprefixer"), cssnano()],
};
