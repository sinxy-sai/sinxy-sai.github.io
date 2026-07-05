import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface ImportPost {
  id?: string;
  slug: string;
  title: string;
  description: string;
  contentMarkdown?: string;
  content_markdown?: string;
  status?: "DRAFT" | "PUBLISHED";
  pubDate?: string;
  pub_date?: string;
  updatedDate?: string | null;
  updated_date?: string | null;
  tags?: string[];
  contentOrigin?: "ORIGINAL" | "REPOST" | "TRANSLATION";
  content_origin?: "ORIGINAL" | "REPOST" | "TRANSLATION";
  creationStatement?: "NONE" | "AI_ASSISTED" | "AGGREGATED" | "PERSONAL_VIEW";
  creation_statement?: "NONE" | "AI_ASSISTED" | "AGGREGATED" | "PERSONAL_VIEW";
  visibility?: "PUBLIC" | "PRIVATE";
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
}

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dataDir = resolve(process.env.BLOG_DATA_DIR || join(rootDir, ".data"));
const databasePath = resolve(process.env.BLOG_DB_PATH || join(dataDir, "blog.sqlite"));
const inputPath = process.argv[2] ? resolve(process.argv[2]) : "";

if (!inputPath) {
  console.error("Usage: npm run server:import-posts -- <posts.json>");
  process.exit(1);
}

if (!existsSync(inputPath)) {
  console.error(`Input file not found: ${inputPath}`);
  process.exit(1);
}

mkdirSync(dataDir, { recursive: true });

const db = new Database(databasePath);
db.pragma("foreign_keys = ON");
db.exec(readFileSync(join(rootDir, "db", "schema.sql"), "utf8"));

const raw = JSON.parse(readFileSync(inputPath, "utf8").replace(/^\uFEFF/, "")) as unknown;
const posts = normalizeInput(raw);

const upsertPost = db.prepare(`
  INSERT INTO posts (
    id,
    slug,
    title,
    description,
    content_markdown,
    status,
    content_origin,
    creation_statement,
    visibility,
    pub_date,
    updated_date,
    created_at,
    updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    slug = excluded.slug,
    title = excluded.title,
    description = excluded.description,
    content_markdown = excluded.content_markdown,
    status = excluded.status,
    content_origin = excluded.content_origin,
    creation_statement = excluded.creation_statement,
    visibility = excluded.visibility,
    pub_date = excluded.pub_date,
    updated_date = excluded.updated_date,
    updated_at = excluded.updated_at
`);

const upsertTag = db.prepare(`
  INSERT INTO tags (id, name)
  VALUES (?, ?)
  ON CONFLICT(name) DO NOTHING
`);

const getTagId = db.prepare("SELECT id FROM tags WHERE name = ?");
const deletePostTags = db.prepare("DELETE FROM post_tags WHERE post_id = ?");
const insertPostTag = db.prepare(`
  INSERT OR IGNORE INTO post_tags (post_id, tag_id)
  VALUES (?, ?)
`);

const importTransaction = db.transaction((items: ImportPost[]) => {
  for (const post of items) {
    const id = post.id || randomUUID();
    const now = new Date().toISOString();
    const contentMarkdown = post.contentMarkdown ?? post.content_markdown ?? "";
    const pubDate = post.pubDate ?? post.pub_date ?? now.slice(0, 19);
    const updatedDate = post.updatedDate ?? post.updated_date ?? null;
    const createdAt = post.createdAt ?? post.created_at ?? now;
    const updatedAt = post.updatedAt ?? post.updated_at ?? now;

    upsertPost.run(
      id,
      requireString(post.slug, "slug"),
      requireString(post.title, "title"),
      requireString(post.description, "description"),
      contentMarkdown,
      post.status || "PUBLISHED",
      post.contentOrigin ?? post.content_origin ?? "ORIGINAL",
      post.creationStatement ?? post.creation_statement ?? "NONE",
      post.visibility || "PUBLIC",
      pubDate,
      updatedDate,
      createdAt,
      updatedAt,
    );

    deletePostTags.run(id);

    for (const rawTag of post.tags || []) {
      const tag = rawTag.trim();
      if (!tag) continue;

      upsertTag.run(randomUUID(), tag);
      const row = getTagId.get(tag) as { id: string } | undefined;
      if (row) insertPostTag.run(id, row.id);
    }
  }
});

importTransaction(posts);

console.log(`Imported ${posts.length} post(s) into ${databasePath}`);

function normalizeInput(value: unknown): ImportPost[] {
  const maybeData =
    typeof value === "object" && value !== null && "data" in value
      ? (value as { data: unknown }).data
      : value;

  if (!Array.isArray(maybeData)) {
    throw new Error("Input must be an array or an object with a data array.");
  }

  return maybeData.map((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new Error("Every post must be an object.");
    }

    return item as ImportPost;
  });
}

function requireString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required.`);
  }

  return value.trim();
}
