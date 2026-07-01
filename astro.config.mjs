import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://sinxy-sai.github.io",
  markdown: {
    shikiConfig: {
      theme: "github-dark",
    },
  },
});
