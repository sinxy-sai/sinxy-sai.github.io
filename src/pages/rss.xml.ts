import rss from "@astrojs/rss";

export async function GET(context) {
  return rss({
    title: "Sinxy Sai",
    description: "Personal notes on computer science, algorithms, and building things.",
    site: context.site,
    items: [],
  });
}
