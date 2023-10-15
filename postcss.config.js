const purgecss = require("@fullhuman/postcss-purgecss");

const defaultExtractor = (content) => content.match(/[\w-/.:@]+(?<!:)/g) || [];

const purgecssConfig = {
  content: ["themes/docs-v1/**/*.{js,html}", "content/**/*.{html,md}"],
  extractors: [
    {
      extractor: defaultExtractor,
      extensions: ["js", "html", "md"],
    },
  ],
  safelist: [/^(is-|has-|will-|js-)/],
};

module.exports = {
  plugins: [
    require("autoprefixer"),
    ...(process.env.HUGO_ENVIRONMENT === "production"
      ? [purgecss(purgecssConfig)]
      : []),
  ],
};
