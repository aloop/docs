const purgecss = require("@fullhuman/postcss-purgecss");

const defaultExtractor = (content) => content.match(/[\w-/.:@]+(?<!:)/g) || [];

module.exports = {
  plugins: [
    purgecss({
      content: ["themes/docs-v1/**/*.{js,html}", "content/**/*.{html,md}"],
      extractors: [
        {
          extractor: defaultExtractor,
          extensions: ["js", "html", "md"],
        },
      ],
      safelist: [/^(is-|has-|will-|js-)/],
    }),
    require("autoprefixer"),
  ],
};
