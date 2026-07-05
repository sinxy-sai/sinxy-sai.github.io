import rss from "@astrojs/rss";
import type { APIContext } from "astro";

export async function GET(context: APIContext) {
  return rss({
    title: "Sinxy Sai",
    description: "Personal notes on computer science, algorithms, and building things.",
    site: context.site ?? "https://sinxy-sai.github.io",
    items: [],
  });
}
