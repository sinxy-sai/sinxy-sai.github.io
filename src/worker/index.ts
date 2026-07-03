import katex from "katex";

type ApiErrorCode =
  | "CONFLICT"
  | "NOT_FOUND"
  | "METHOD_NOT_ALLOWED"
  | "NOT_CONFIGURED"
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR";

interface Env {
  ASSETS: {
    fetch(request: Request): Promise<Response> | Response;
  };
  sinxy_sai_blog_db: {
    prepare(query: string): {
      bind(...values: unknown[]): {
        all<T>(): Promise<{ results: T[] }>;
        first<T>(): Promise<T | null>;
        run(): Promise<unknown>;
      };
      all<T>(): Promise<{ results: T[] }>;
      first<T>(): Promise<T | null>;
      run(): Promise<unknown>;
    };
  };
  sinxy_sai_blog_media: {
    put(
      key: string,
      value: ArrayBuffer | ReadableStream | string,
      options?: {
        httpMetadata?: {
          contentType?: string;
          cacheControl?: string;
        };
        customMetadata?: Record<string, string>;
      },
    ): Promise<unknown>;
    get(key: string): Promise<{
      body: ReadableStream;
      httpMetadata?: {
        contentType?: string;
        cacheControl?: string;
      };
      customMetadata?: Record<string, string>;
    } | null>;
  };
  ADMIN_TOKEN?: string;
}

interface ApiSuccess<T> {
  data: T;
}

interface ApiFailure {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
}

const maxUploadBytes = 5 * 1024 * 1024;
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function json<T>(body: ApiSuccess<T> | ApiFailure, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...jsonHeaders,
      ...init?.headers,
    },
  });
}

function methodNotAllowed(allowed: string[]) {
  return json(
    {
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: `Method not allowed. Use ${allowed.join(", ")}.`,
      },
    },
    {
      status: 405,
      headers: {
        allow: allowed.join(", "),
      },
    },
  );
}

function notFound() {
  return json(
    {
      error: {
        code: "NOT_FOUND",
        message: "API route not found.",
      },
    },
    { status: 404 },
  );
}

function notConfigured(resource: string) {
  return json(
    {
      error: {
        code: "NOT_CONFIGURED",
        message: `${resource} is not configured yet.`,
      },
    },
    { status: 501 },
  );
}

function unauthorized() {
  return json(
    {
      error: {
        code: "UNAUTHORIZED",
        message: "Admin authorization is required.",
      },
    },
    {
      status: 401,
      headers: {
        "www-authenticate": 'Bearer realm="admin"',
      },
    },
  );
}

function validationError(message: string, details?: unknown) {
  return json(
    {
      error: {
        code: "VALIDATION_ERROR",
        message,
        details,
      },
    },
    { status: 422 },
  );
}

function conflict(message: string) {
  return json(
    {
      error: {
        code: "CONFLICT",
        message,
      },
    },
    { status: 409 },
  );
}

function internalError() {
  return json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error.",
      },
    },
    { status: 500 },
  );
}

function isAuthorizedAdmin(request: Request, env: Env) {
  const token = env.ADMIN_TOKEN;

  if (!token) return false;

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;

  return header.slice("Bearer ".length) === token;
}

interface PostListRow {
  slug: string;
  title: string;
  description: string;
  pubDate: string;
  updatedDate: string | null;
  tags: string | null;
  coverAssetKey: string | null;
}

interface PostDetailRow extends PostListRow {
  contentMarkdown: string;
}

interface SearchPostRow extends PostDetailRow {
  rank: number;
}

interface AdminPostRow extends PostDetailRow {
  id: string;
  status: "DRAFT" | "PUBLISHED";
  coverAssetId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AssetRow {
  id: string;
  r2Key: string;
  filename: string;
  contentType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  alt: string | null;
  createdAt: string;
}

interface RenderedHeading {
  depth: number;
  text: string;
  slug: string;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function normalizePostSlug(value: string) {
  return slugify(value)
    .replace(/^-|-$/g, "")
    .slice(0, 96);
}

function renderMath(latex: string, displayMode: boolean) {
  try {
    return katex.renderToString(latex.trim(), {
      displayMode,
      throwOnError: false,
      strict: false,
      trust: false,
    });
  } catch {
    const delimiter = displayMode ? "$$" : "$";
    return `${delimiter}${escapeHtml(latex)}${delimiter}`;
  }
}

function renderPlainInlineMarkdown(value: string) {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function renderInlineMarkdown(value: string) {
  return value
    .split(/(`[^`]+`)/g)
    .map((part) => {
      if (part.startsWith("`") && part.endsWith("`")) {
        return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      }

      return part
        .split(/(\$(?!\$)[^$\n]+(?<!\\)\$)/g)
        .map((segment) => {
          if (segment.startsWith("$") && segment.endsWith("$")) {
            return renderMath(segment.slice(1, -1), false);
          }

          return renderPlainInlineMarkdown(segment);
        })
        .join("");
    })
    .join("");
}

function flushParagraph(lines: string[], html: string[]) {
  if (lines.length === 0) return;
  html.push(`<p>${renderInlineMarkdown(lines.join(" "))}</p>`);
  lines.length = 0;
}

function renderMarkdownDocument(markdown: string) {
  const html: string[] = [];
  const paragraphLines: string[] = [];
  const listItems: string[] = [];
  const headings: RenderedHeading[] = [];
  const headingCounts = new Map<string, number>();
  let inCodeBlock = false;
  let codeLanguage = "";
  let codeLines: string[] = [];
  let inDisplayMath = false;
  let displayMathLines: string[] = [];

  function createHeadingSlug(text: string) {
    const baseSlug = slugify(text) || "section";
    const count = headingCounts.get(baseSlug) ?? 0;
    headingCounts.set(baseSlug, count + 1);
    return count === 0 ? baseSlug : `${baseSlug}-${count + 1}`;
  }

  function flushList() {
    if (listItems.length === 0) return;
    html.push(`<ul>${listItems.map((item) => `<li>${item}</li>`).join("")}</ul>`);
    listItems.length = 0;
  }

  function flushCodeBlock() {
    html.push(
      `<pre><code${codeLanguage ? ` class="language-${escapeHtml(codeLanguage)}"` : ""}>${escapeHtml(
        codeLines.join("\n"),
      )}</code></pre>`,
    );
    codeLines = [];
    codeLanguage = "";
  }

  function flushDisplayMath() {
    html.push(renderMath(displayMathLines.join("\n"), true));
    displayMathLines = [];
  }

  for (const line of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const codeFence = line.match(/^```([A-Za-z0-9_-]+)?\s*$/);

    if (codeFence) {
      if (inCodeBlock) {
        flushCodeBlock();
        inCodeBlock = false;
      } else {
        flushParagraph(paragraphLines, html);
        flushList();
        inCodeBlock = true;
        codeLanguage = codeFence[1] ?? "";
      }
      continue;
    }

    if (inDisplayMath) {
      const endMath = line.match(/^(.*?)\s*\$\$\s*$/);
      if (endMath) {
        if (endMath[1].trim()) displayMathLines.push(endMath[1]);
        flushDisplayMath();
        inDisplayMath = false;
      } else {
        displayMathLines.push(line);
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    const singleLineDisplayMath = line.match(/^\s*\$\$\s*(.*?)\s*\$\$\s*$/);
    if (singleLineDisplayMath) {
      flushParagraph(paragraphLines, html);
      flushList();
      html.push(renderMath(singleLineDisplayMath[1], true));
      continue;
    }

    const startDisplayMath = line.match(/^\s*\$\$\s*(.*)$/);
    if (startDisplayMath) {
      flushParagraph(paragraphLines, html);
      flushList();
      inDisplayMath = true;
      if (startDisplayMath[1].trim()) displayMathLines.push(startDisplayMath[1]);
      continue;
    }

    if (line.trim() === "") {
      flushParagraph(paragraphLines, html);
      flushList();
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph(paragraphLines, html);
      flushList();
      const depth = heading[1].length;
      const text = heading[2].trim();
      const id = createHeadingSlug(text);
      headings.push({ depth, text, slug: id });
      html.push(`<h${depth} id="${escapeHtml(id)}">${renderInlineMarkdown(text)}</h${depth}>`);
      continue;
    }

    const listItem = line.match(/^[-*]\s+(.+)$/);
    if (listItem) {
      flushParagraph(paragraphLines, html);
      listItems.push(renderInlineMarkdown(listItem[1].trim()));
      continue;
    }

    paragraphLines.push(line.trim());
  }

  if (inCodeBlock) flushCodeBlock();
  if (inDisplayMath) flushDisplayMath();
  flushParagraph(paragraphLines, html);
  flushList();

  return {
    html: html.join("\n"),
    headings,
  };
}

function renderMarkdown(markdown: string) {
  return renderMarkdownDocument(markdown).html;
}

function stripMarkdownForSearch(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~|[\]()-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createSearchExcerpt(post: SearchPostRow, query: string) {
  const text = stripMarkdownForSearch(
    [post.description, post.contentMarkdown].filter(Boolean).join(" "),
  );
  if (!text) return post.description;

  const normalizedText = text.toLocaleLowerCase();
  const normalizedQuery = query.toLocaleLowerCase();
  const matchIndex = normalizedText.indexOf(normalizedQuery);
  const excerptLength = 140;

  if (matchIndex < 0) {
    return text.length > excerptLength ? `${text.slice(0, excerptLength).trim()}...` : text;
  }

  const start = Math.max(0, matchIndex - 46);
  const end = Math.min(text.length, matchIndex + normalizedQuery.length + 94);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";

  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

function escapeLikePattern(value: string) {
  return `%${value.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
}

function formatDate(value: string) {
  const dateKey = String(value || "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return dateKey.replaceAll("-", "/");
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asTrimmedString(value: unknown, field: string, maxLength: number) {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string.`);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(`${field} is required.`);
  }

  if (trimmed.length > maxLength) {
    throw new Error(`${field} must be ${maxLength} characters or fewer.`);
  }

  return trimmed;
}

function asOptionalString(value: unknown, field: string, maxLength: number) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string.`);
  }

  const trimmed = value.trim();

  if (!trimmed) return null;

  if (trimmed.length > maxLength) {
    throw new Error(`${field} must be ${maxLength} characters or fewer.`);
  }

  return trimmed;
}

function asIsoDate(value: unknown, field: string) {
  const raw = asTrimmedString(value, field, 80);
  const normalized = raw.replace(" ", "T");
  const match = normalized.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?)?(?:Z|[+-]\d{2}:?\d{2})?$/,
  );

  if (!match) {
    throw new Error(`${field} must be a valid date.`);
  }

  const [, yearValue, monthValue, dayValue, hourValue = "00", minuteValue = "00", secondValue = "00"] =
    match;
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const hour = Number(hourValue);
  const minute = Number(minuteValue);
  const second = Number(secondValue);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) {
    throw new Error(`${field} must be a valid date.`);
  }

  return `${yearValue}-${monthValue}-${dayValue}T${hourValue}:${minuteValue}:${secondValue}`;
}

function asOptionalIsoDate(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return null;
  return asIsoDate(value, field);
}

function normalizeStatus(value: unknown) {
  if (value === undefined || value === null) return "DRAFT";
  if (value !== "DRAFT" && value !== "PUBLISHED") {
    throw new Error("status must be DRAFT or PUBLISHED.");
  }

  return value;
}

function normalizeTags(value: unknown) {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    throw new Error("tags must be an array of strings.");
  }

  const seen = new Set<string>();
  const tags: string[] = [];

  for (const item of value) {
    const tag = asTrimmedString(item, "tag", 40);
    if (!seen.has(tag)) {
      seen.add(tag);
      tags.push(tag);
    }
  }

  if (tags.length > 12) {
    throw new Error("tags cannot contain more than 12 items.");
  }

  return tags;
}

async function readJsonBody(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  const contentLength = Number(request.headers.get("content-length") ?? "0");

  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("Use application/json.");
  }

  if (contentLength > 256 * 1024) {
    throw new Error("JSON body is too large.");
  }

  const body = await request.json();

  if (!isRecord(body)) {
    throw new Error("JSON body must be an object.");
  }

  return body;
}

function buildPostHtml(post: PostDetailRow) {
  const tags = post.tags ? post.tags.split(",").filter(Boolean) : [];
  const title = escapeHtml(post.title);
  const description = escapeHtml(post.description);
  const content = renderMarkdown(post.contentMarkdown);

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} | Sinxy Sai's Blog</title>
    <meta name="description" content="${description}" />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <style>
      :root {
        color-scheme: light;
        --bg: #f8fbf8;
        --paper: rgba(255, 255, 255, 0.78);
        --text: #25312d;
        --muted: #64736d;
        --line: rgba(72, 118, 101, 0.18);
        --accent: #4c8f7b;
        --code-bg: #15211f;
        --code-text: #edf7f1;
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        min-height: 100vh;
        color: var(--text);
        background:
          radial-gradient(circle at 20% 0%, rgba(149, 213, 190, 0.26), transparent 32rem),
          radial-gradient(circle at 90% 12%, rgba(242, 196, 141, 0.22), transparent 30rem),
          var(--bg);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        line-height: 1.78;
      }

      a { color: inherit; }

      .site-header {
        position: sticky;
        top: 0;
        z-index: 10;
        border-bottom: 1px solid var(--line);
        background: rgba(248, 251, 248, 0.82);
        backdrop-filter: blur(18px);
      }

      .header-inner {
        width: min(1040px, calc(100% - 32px));
        margin: 0 auto;
        display: flex;
        align-items: center;
        justify-content: space-between;
        min-height: 68px;
      }

      .brand {
        font-weight: 760;
        text-decoration: none;
      }

      .nav {
        display: flex;
        gap: 18px;
        color: var(--muted);
        font-size: 0.95rem;
      }

      .nav a {
        text-decoration: none;
      }

      main {
        width: min(860px, calc(100% - 32px));
        margin: 0 auto;
        padding: clamp(38px, 8vw, 84px) 0;
      }

      article {
        border: 1px solid var(--line);
        border-radius: 28px;
        background: var(--paper);
        box-shadow: 0 26px 70px rgba(55, 89, 79, 0.13);
        padding: clamp(28px, 6vw, 64px);
      }

      .kicker {
        margin: 0 0 14px;
        color: var(--accent);
        font-size: 0.78rem;
        font-weight: 760;
        letter-spacing: 0;
        text-transform: uppercase;
      }

      h1 {
        margin: 0;
        max-width: 13em;
        font-size: clamp(2.1rem, 7vw, 4.6rem);
        line-height: 1.04;
        letter-spacing: 0;
      }

      .description {
        max-width: 680px;
        margin: 22px 0 0;
        color: var(--muted);
        font-size: 1.08rem;
      }

      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 10px 14px;
        margin-top: 22px;
        color: var(--muted);
        font-size: 0.94rem;
      }

      .tags {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 20px;
      }

      .tag {
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 5px 11px;
        color: var(--accent);
        background: rgba(255, 255, 255, 0.46);
        font-size: 0.85rem;
      }

      .content {
        margin-top: clamp(34px, 6vw, 56px);
      }

      .content h1,
      .content h2,
      .content h3 {
        max-width: none;
        margin: 2.1em 0 0.7em;
        line-height: 1.22;
        letter-spacing: 0;
      }

      .content h1 { font-size: 2rem; }
      .content h2 { font-size: 1.55rem; }
      .content h3 { font-size: 1.22rem; }

      .content p,
      .content ul {
        margin: 1em 0;
      }

      .content code {
        border-radius: 6px;
        padding: 0.12em 0.34em;
        background: rgba(76, 143, 123, 0.12);
        font-size: 0.92em;
      }

      .content pre {
        overflow-x: auto;
        border-radius: 18px;
        padding: 18px 20px;
        background: var(--code-bg);
        color: var(--code-text);
      }

      .content pre code {
        padding: 0;
        background: transparent;
        color: inherit;
      }

      .back-link {
        display: inline-flex;
        margin-top: 28px;
        color: var(--accent);
        text-decoration: none;
        font-weight: 680;
      }
    </style>
  </head>
  <body>
    <header class="site-header">
      <div class="header-inner">
        <a class="brand" href="/">Sinxy Sai's Blog</a>
        <nav class="nav" aria-label="Primary">
          <a href="/">首页</a>
          <a href="/archive/">归档</a>
          <a href="/tags/">标签</a>
          <a href="/about/">关于</a>
        </nav>
      </div>
    </header>
    <main>
      <article>
        <header>
          <p class="kicker">D1 Article</p>
          <h1>${title}</h1>
          <p class="description">${description}</p>
          <div class="meta">
            <time datetime="${escapeHtml(post.pubDate)}">${formatDate(post.pubDate)}</time>
            ${post.updatedDate ? `<span>最后编辑于 ${formatDate(post.updatedDate)}</span>` : ""}
          </div>
          ${
            tags.length > 0
              ? `<div class="tags">${tags
                  .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
                  .join("")}</div>`
              : ""
          }
        </header>
        <div class="content">${content}</div>
        <a class="back-link" href="/archive/">返回归档</a>
      </article>
    </main>
  </body>
</html>`;
}

function buildTagHtml(tag: string, posts: PostListRow[]) {
  const title = escapeHtml(tag);
  const items = posts
    .map(
      (post) => `
        <a class="post-card" href="/blog/${encodeURIComponent(post.slug)}/">
          <div class="meta">
            <time datetime="${escapeHtml(post.pubDate)}">${formatDate(post.pubDate)}</time>
            ${post.tags ? `<span>${post.tags.split(",").map(escapeHtml).join(" / ")}</span>` : ""}
          </div>
          <h2>${escapeHtml(post.title)}</h2>
          <p>${escapeHtml(post.description)}</p>
        </a>
      `,
    )
    .join("");

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} | Sinxy Sai's Blog</title>
    <meta name="description" content="与 ${title} 相关的文章。" />
    <style>
      :root {
        color-scheme: light;
        --bg: #f8fbf8;
        --paper: rgba(255, 255, 255, 0.78);
        --text: #25312d;
        --muted: #64736d;
        --line: rgba(72, 118, 101, 0.18);
        --accent: #4c8f7b;
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        min-height: 100vh;
        color: var(--text);
        background:
          radial-gradient(circle at 20% 0%, rgba(149, 213, 190, 0.26), transparent 32rem),
          radial-gradient(circle at 90% 12%, rgba(242, 196, 141, 0.22), transparent 30rem),
          var(--bg);
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      a { color: inherit; text-decoration: none; }

      .site-header {
        border-bottom: 1px solid var(--line);
        background: rgba(248, 251, 248, 0.82);
        backdrop-filter: blur(18px);
      }

      .header-inner,
      main {
        width: min(980px, calc(100% - 32px));
        margin: 0 auto;
      }

      .header-inner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        min-height: 68px;
      }

      .brand { font-weight: 760; }

      .nav {
        display: flex;
        gap: 18px;
        color: var(--muted);
        font-size: 0.95rem;
      }

      main { padding: clamp(38px, 8vw, 84px) 0; }

      .page-head {
        border: 1px solid var(--line);
        border-radius: 28px;
        background: var(--paper);
        box-shadow: 0 26px 70px rgba(55, 89, 79, 0.13);
        padding: clamp(28px, 6vw, 56px);
      }

      .kicker {
        margin: 0 0 12px;
        color: var(--accent);
        font-size: 0.78rem;
        font-weight: 760;
        text-transform: uppercase;
      }

      h1 {
        margin: 0;
        font-size: clamp(2.2rem, 7vw, 4.6rem);
        line-height: 1.04;
        letter-spacing: 0;
      }

      .page-head p {
        margin: 18px 0 0;
        color: var(--muted);
      }

      .post-list {
        display: grid;
        gap: 14px;
        margin-top: 26px;
      }

      .post-card {
        display: block;
        border: 1px solid var(--line);
        border-radius: 24px;
        background: var(--paper);
        padding: 22px;
        box-shadow: 0 16px 46px rgba(74, 116, 98, 0.1);
        transition: transform 180ms ease, border-color 180ms ease;
      }

      .post-card:hover {
        transform: translateY(-2px);
        border-color: rgba(76, 143, 123, 0.42);
      }

      .post-card h2 {
        margin: 10px 0 8px;
        font-size: clamp(1.25rem, 3vw, 1.8rem);
      }

      .post-card p,
      .meta {
        color: var(--muted);
      }

      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 12px;
        font-size: 0.88rem;
      }
    </style>
  </head>
  <body>
    <header class="site-header">
      <div class="header-inner">
        <a class="brand" href="/">Sinxy Sai's Blog</a>
        <nav class="nav" aria-label="Primary">
          <a href="/">首页</a>
          <a href="/archive/">归档</a>
          <a href="/tags/">标签</a>
          <a href="/about/">关于</a>
        </nav>
      </div>
    </header>
    <main>
      <section class="page-head">
        <p class="kicker">D1 Tag</p>
        <h1>${title}</h1>
        <p>这里收录了 ${posts.length} 篇与 ${title} 相关的动态文章。</p>
      </section>
      <section class="post-list">${items}</section>
    </main>
  </body>
</html>`;
}

function replaceTemplateTokens(template: string, replacements: Record<string, string>) {
  let html = template;

  for (const [token, value] of Object.entries(replacements)) {
    html = html.split(token).join(value);
  }

  return html;
}

async function loadTemplate(request: Request, env: Env, path: string) {
  const url = new URL(path, request.url);
  const response = await env.ASSETS.fetch(new Request(url, { method: "GET" }));

  if (!response.ok) {
    throw new Error(`Template not found: ${path}`);
  }

  return response.text();
}

function renderTagLinks(tags: string[]) {
  return tags
    .map(
      (tag) =>
        `<a class="tag" href="/tags/${encodeURIComponent(tag)}/">${escapeHtml(tag)}</a>`,
    )
    .join("");
}

function renderArticleToc(headings: RenderedHeading[]) {
  const tocHeadings = headings.filter((heading) => heading.depth >= 2 && heading.depth <= 3);

  if (!tocHeadings.length) return "";

  return `
    <aside class="article-toc" aria-label="文章目录">
      <h2>目录</h2>
      <ol>
        ${tocHeadings
          .map(
            (heading) => `
              <li class="toc-depth-${heading.depth}">
                <a href="#${escapeHtml(heading.slug)}">${escapeHtml(heading.text)}</a>
              </li>
            `,
          )
          .join("")}
      </ol>
    </aside>
  `;
}

function renderPostNavItem(post: PostListRow | undefined, label: string, emptyText: string) {
  if (!post) return `<span>${escapeHtml(emptyText)}</span>`;

  return `
    <a href="/blog/${encodeURIComponent(post.slug)}/">
      <small>${escapeHtml(label)}</small>
      <strong>${escapeHtml(post.title)}</strong>
    </a>
  `;
}

function renderPostNavigation(posts: PostListRow[], slug: string) {
  const currentIndex = posts.findIndex((post) => post.slug === slug);
  const newerPost = currentIndex > 0 ? posts[currentIndex - 1] : undefined;
  const olderPost = currentIndex >= 0 ? posts[currentIndex + 1] : undefined;

  return `
    ${renderPostNavItem(newerPost, "上一篇", "已经是最新文章")}
    ${renderPostNavItem(olderPost, "下一篇", "已经是最后一篇")}
  `;
}

async function buildPostHtmlFromTemplate(post: PostDetailRow, request: Request, env: Env) {
  const tags = post.tags ? post.tags.split(",").filter(Boolean) : [];
  const template = await loadTemplate(request, env, "/dynamic-template/post/");
  const updated = post.updatedDate
    ? `<span>最后编辑于 ${formatDate(post.updatedDate)}</span>`
    : "";
  const publicUrl = new URL(`/blog/${post.slug}/`, request.url).toString();
  const renderedPost = renderMarkdownDocument(post.contentMarkdown);
  const publishedPosts = await getPublishedPostList(env);
  const toc = renderArticleToc(renderedPost.headings);

  return replaceTemplateTokens(template, {
    "__D1_POST_TITLE__": escapeHtml(post.title),
    "__D1_POST_DESCRIPTION__": escapeHtml(post.description),
    "__D1_POST_PUBLISHED_TIME__": escapeHtml(post.pubDate),
    "__D1_POST_DATE__": formatDate(post.pubDate),
    "__D1_POST_UPDATED__": updated,
    "__D1_POST_TAGS__": renderTagLinks(tags),
    "__D1_POST_LAYOUT_CLASS__": toc ? "has-toc" : "no-toc",
    "__D1_POST_TOC__": toc,
    "__D1_POST_CONTENT__": renderedPost.html,
    "__D1_POST_NAV__": renderPostNavigation(publishedPosts, post.slug),
    "https://sinxy-sai.github.io/dynamic-template/post/": publicUrl,
    "/dynamic-template/post/": `/blog/${post.slug}/`,
    'content="noindex, nofollow"': 'content="index, follow"',
  });
}

function renderTagPostCards(posts: PostListRow[]) {
  return posts
    .map((post) => {
      const tags = post.tags ? post.tags.split(",").filter(Boolean) : [];

      return `
        <a class="post-card" href="/blog/${encodeURIComponent(post.slug)}/">
          <div class="meta">
            <time datetime="${escapeHtml(post.pubDate)}">${formatDate(post.pubDate)}</time>
            ${tags.length ? `<span>${tags.map(escapeHtml).join(" / ")}</span>` : ""}
          </div>
          <h2>${escapeHtml(post.title)}</h2>
          <p>${escapeHtml(post.description)}</p>
        </a>
      `;
    })
    .join("");
}

async function buildTagHtmlFromTemplate(
  tag: string,
  posts: PostListRow[],
  request: Request,
  env: Env,
) {
  const template = await loadTemplate(request, env, "/dynamic-template/tag/");
  const publicUrl = new URL(`/tags/${encodeURIComponent(tag)}/`, request.url).toString();

  return replaceTemplateTokens(template, {
    "__D1_TAG_TITLE__": escapeHtml(tag),
    "__D1_TAG_COUNT__": String(posts.length),
    "__D1_TAG_POSTS__": renderTagPostCards(posts),
    "https://sinxy-sai.github.io/dynamic-template/tag/": publicUrl,
    "/dynamic-template/tag/": `/tags/${encodeURIComponent(tag)}/`,
    'content="noindex, nofollow"': 'content="index, follow"',
  });
}

async function getPublishedPostList(env: Env) {
  const { results } = await env.sinxy_sai_blog_db
    .prepare(
      `
        SELECT
          posts.slug,
          posts.title,
          posts.description,
          posts.pub_date AS pubDate,
          posts.updated_at AS updatedDate,
          assets.r2_key AS coverAssetKey,
          group_concat(tags.name, ',') AS tags
        FROM posts
        LEFT JOIN assets ON assets.id = posts.cover_asset_id
        LEFT JOIN post_tags ON post_tags.post_id = posts.id
        LEFT JOIN tags ON tags.id = post_tags.tag_id
        WHERE posts.status = 'PUBLISHED'
        GROUP BY posts.id
        ORDER BY posts.pub_date DESC
      `,
    )
    .all<PostListRow>();

  return results;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function formatRssDate(value: string) {
  const raw = String(value || "").replace(" ", "T");
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}(?::\d{2})?))?/);

  if (match) {
    const time = match[2] ? (match[2].length === 5 ? `${match[2]}:00` : match[2]) : "00:00:00";
    return new Date(`${match[1]}T${time}+08:00`).toUTCString();
  }

  const date = new Date(raw);
  return Number.isNaN(date.valueOf()) ? new Date().toUTCString() : date.toUTCString();
}

function renderRssItem(post: PostListRow, request: Request) {
  const link = new URL(`/blog/${post.slug}/`, request.url).toString();

  return `
    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid>${escapeXml(link)}</guid>
      <description>${escapeXml(post.description)}</description>
      <pubDate>${formatRssDate(post.pubDate)}</pubDate>
    </item>`;
}

async function handleRss(request: Request, env: Env) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return methodNotAllowed(["GET", "HEAD"]);
  }

  try {
    const staticRssUrl = new URL("/rss.xml", request.url);
    const staticResponse = await env.ASSETS.fetch(new Request(staticRssUrl, { method: "GET" }));
    if (!staticResponse.ok) return staticResponse;

    if (request.method === "HEAD") {
      return new Response(null, {
        headers: {
          "content-type": "application/rss+xml; charset=utf-8",
          "cache-control": "public, max-age=60",
        },
      });
    }

    const staticRss = await staticResponse.text();
    const dynamicItems = (await getPublishedPostList(env))
      .map((post) => renderRssItem(post, request))
      .join("\n");

    const rss = staticRss.includes("</channel>")
      ? staticRss.replace("</channel>", `${dynamicItems}\n</channel>`)
      : staticRss;

    return new Response(rss, {
      headers: {
        "content-type": "application/rss+xml; charset=utf-8",
        "cache-control": "public, max-age=60",
      },
    });
  } catch (error) {
    console.error("Failed to render RSS", error);
    return internalError();
  }
}

function handleHealth(request: Request) {
  if (request.method !== "GET") return methodNotAllowed(["GET"]);

  return json({
    data: {
      ok: true,
      service: "sinxy-sai-blog",
      runtime: "cloudflare-workers",
      timestamp: new Date().toISOString(),
    },
  });
}

async function handlePosts(request: Request, env: Env) {
  if (request.method !== "GET") return methodNotAllowed(["GET"]);

  try {
    const results = await getPublishedPostList(env);
    return json({
      data: results.map((post) => ({
        slug: post.slug,
        title: post.title,
        description: post.description,
        pubDate: post.pubDate,
        updatedDate: post.updatedDate,
        tags: post.tags ? post.tags.split(",").filter(Boolean) : [],
        coverAssetKey: post.coverAssetKey,
        url: `/blog/${post.slug}/`,
      })),
    });
  } catch (error) {
    console.error("Failed to list posts", error);
    return internalError();
  }
}

async function handleSearch(request: Request, env: Env) {
  if (request.method !== "GET") return methodNotAllowed(["GET"]);

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "").trim();

  if (!query) {
    return json({ data: [] });
  }

  if (query.length > 80) {
    return validationError("q must be 80 characters or fewer.");
  }

  const pattern = escapeLikePattern(query);

  try {
    const { results } = await env.sinxy_sai_blog_db
      .prepare(
        `
          SELECT
            posts.slug,
            posts.title,
            posts.description,
            posts.content_markdown AS contentMarkdown,
            posts.pub_date AS pubDate,
            posts.updated_at AS updatedDate,
            assets.r2_key AS coverAssetKey,
            group_concat(tags.name, ',') AS tags,
            CASE
              WHEN posts.title LIKE ? ESCAPE '\\' THEN 0
              WHEN posts.description LIKE ? ESCAPE '\\' THEN 1
              WHEN EXISTS (
                SELECT 1
                FROM post_tags search_post_tags
                JOIN tags search_tags ON search_tags.id = search_post_tags.tag_id
                WHERE search_post_tags.post_id = posts.id
                  AND search_tags.name LIKE ? ESCAPE '\\'
              ) THEN 2
              ELSE 3
            END AS rank
          FROM posts
          LEFT JOIN assets ON assets.id = posts.cover_asset_id
          LEFT JOIN post_tags all_post_tags ON all_post_tags.post_id = posts.id
          LEFT JOIN tags ON tags.id = all_post_tags.tag_id
          WHERE posts.status = 'PUBLISHED'
            AND (
              posts.title LIKE ? ESCAPE '\\'
              OR posts.description LIKE ? ESCAPE '\\'
              OR posts.content_markdown LIKE ? ESCAPE '\\'
              OR EXISTS (
                SELECT 1
                FROM post_tags search_post_tags
                JOIN tags search_tags ON search_tags.id = search_post_tags.tag_id
                WHERE search_post_tags.post_id = posts.id
                  AND search_tags.name LIKE ? ESCAPE '\\'
              )
            )
          GROUP BY posts.id
          ORDER BY rank ASC, posts.pub_date DESC
          LIMIT 20
        `,
      )
      .bind(pattern, pattern, pattern, pattern, pattern, pattern, pattern)
      .all<SearchPostRow>();

    return json({
      data: results.map((post) => ({
        slug: post.slug,
        title: post.title,
        description: post.description,
        excerpt: createSearchExcerpt(post, query),
        pubDate: post.pubDate,
        updatedDate: post.updatedDate,
        tags: post.tags ? post.tags.split(",").filter(Boolean) : [],
        url: `/blog/${post.slug}/`,
      })),
    });
  } catch (error) {
    console.error("Failed to search posts", error);
    return internalError();
  }
}

function normalizeAdminPost(row: AdminPostRow) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    contentMarkdown: row.contentMarkdown,
    status: row.status,
    pubDate: row.pubDate,
    updatedDate: row.updatedDate,
    tags: row.tags ? row.tags.split(",").filter(Boolean) : [],
    coverAssetId: row.coverAssetId,
    coverAssetKey: row.coverAssetKey,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    url: `/blog/${row.slug}/`,
  };
}

async function getAdminPostById(id: string, env: Env) {
  const row = await env.sinxy_sai_blog_db
    .prepare(
      `
        SELECT
          posts.id,
          posts.slug,
          posts.title,
          posts.description,
          posts.content_markdown AS contentMarkdown,
          posts.status,
          posts.pub_date AS pubDate,
          posts.updated_at AS updatedDate,
          posts.cover_asset_id AS coverAssetId,
          assets.r2_key AS coverAssetKey,
          posts.created_at AS createdAt,
          posts.updated_at AS updatedAt,
          group_concat(tags.name, ',') AS tags
        FROM posts
        LEFT JOIN assets ON assets.id = posts.cover_asset_id
        LEFT JOIN post_tags ON post_tags.post_id = posts.id
        LEFT JOIN tags ON tags.id = post_tags.tag_id
        WHERE posts.id = ?
        GROUP BY posts.id
      `,
    )
    .bind(id)
    .first<AdminPostRow>();

  return row ? normalizeAdminPost(row) : null;
}

async function listAdminPosts(env: Env) {
  const { results } = await env.sinxy_sai_blog_db
    .prepare(
      `
        SELECT
          posts.id,
          posts.slug,
          posts.title,
          posts.description,
          posts.content_markdown AS contentMarkdown,
          posts.status,
          posts.pub_date AS pubDate,
          posts.updated_at AS updatedDate,
          posts.cover_asset_id AS coverAssetId,
          assets.r2_key AS coverAssetKey,
          posts.created_at AS createdAt,
          posts.updated_at AS updatedAt,
          group_concat(tags.name, ',') AS tags
        FROM posts
        LEFT JOIN assets ON assets.id = posts.cover_asset_id
        LEFT JOIN post_tags ON post_tags.post_id = posts.id
        LEFT JOIN tags ON tags.id = post_tags.tag_id
        GROUP BY posts.id
        ORDER BY posts.updated_at DESC
        LIMIT 100
      `,
    )
    .all<AdminPostRow>();

  return results.map(normalizeAdminPost);
}

async function syncPostTags(postId: string, tags: string[], env: Env) {
  await env.sinxy_sai_blog_db
    .prepare("DELETE FROM post_tags WHERE post_id = ?")
    .bind(postId)
    .run();

  for (const name of tags) {
    const existing = await env.sinxy_sai_blog_db
      .prepare("SELECT id FROM tags WHERE name = ?")
      .bind(name)
      .first<{ id: string }>();
    const tagId = existing?.id ?? `tag_${crypto.randomUUID()}`;

    if (!existing) {
      await env.sinxy_sai_blog_db
        .prepare("INSERT INTO tags (id, name) VALUES (?, ?)")
        .bind(tagId, name)
        .run();
    }

    await env.sinxy_sai_blog_db
      .prepare("INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)")
      .bind(postId, tagId)
      .run();
  }
}

async function handleCreateAdminPost(request: Request, env: Env) {
  let body: Record<string, unknown>;

  try {
    body = await readJsonBody(request);
  } catch (error) {
    return validationError(error instanceof Error ? error.message : "Invalid JSON body.");
  }

  try {
    const title = asTrimmedString(body.title, "title", 180);
    const description = asTrimmedString(body.description, "description", 320);
    const contentMarkdown = asTrimmedString(
      body.contentMarkdown ?? body.content,
      "contentMarkdown",
      120000,
    );
    const status = normalizeStatus(body.status);
    const slug = normalizePostSlug(
      asOptionalString(body.slug, "slug", 120) ?? title,
    );
    const pubDate = body.pubDate ? asIsoDate(body.pubDate, "pubDate") : new Date().toISOString();
    const coverAssetId = asOptionalString(body.coverAssetId, "coverAssetId", 120);
    const tags = normalizeTags(body.tags) ?? [];

    if (!slug) {
      return validationError("slug could not be generated.");
    }

    const duplicated = await env.sinxy_sai_blog_db
      .prepare("SELECT id FROM posts WHERE slug = ?")
      .bind(slug)
      .first<{ id: string }>();

    if (duplicated) {
      return conflict("A post with this slug already exists.");
    }

    const id = `post_${crypto.randomUUID()}`;

    await env.sinxy_sai_blog_db
      .prepare(
        `
          INSERT INTO posts (
            id,
            slug,
            title,
            description,
            content_markdown,
            cover_asset_id,
            status,
            pub_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(
        id,
        slug,
        title,
        description,
        contentMarkdown,
        coverAssetId,
        status,
        pubDate,
      )
      .run();

    await syncPostTags(id, tags, env);

    return json({ data: await getAdminPostById(id, env) }, { status: 201 });
  } catch (error) {
    return validationError(error instanceof Error ? error.message : "Invalid post data.");
  }
}

async function handleUpdateAdminPost(request: Request, env: Env, id: string) {
  let body: Record<string, unknown>;

  try {
    body = await readJsonBody(request);
  } catch (error) {
    return validationError(error instanceof Error ? error.message : "Invalid JSON body.");
  }

  const existing = await getAdminPostById(id, env);
  if (!existing) return notFound();

  try {
    const title =
      body.title === undefined ? existing.title : asTrimmedString(body.title, "title", 180);
    const description =
      body.description === undefined
        ? existing.description
        : asTrimmedString(body.description, "description", 320);
    const contentMarkdown =
      body.contentMarkdown === undefined && body.content === undefined
        ? existing.contentMarkdown
        : asTrimmedString(body.contentMarkdown ?? body.content, "contentMarkdown", 120000);
    const status =
      body.status === undefined ? existing.status : normalizeStatus(body.status);
    const slug =
      body.slug === undefined
        ? existing.slug
        : normalizePostSlug(asTrimmedString(body.slug, "slug", 120));
    const pubDate =
      body.pubDate === undefined ? existing.pubDate : asIsoDate(body.pubDate, "pubDate");
    const coverAssetId =
      body.coverAssetId === undefined
        ? existing.coverAssetId
        : asOptionalString(body.coverAssetId, "coverAssetId", 120);
    const tags = normalizeTags(body.tags);

    if (!slug) {
      return validationError("slug is required.");
    }

    if (slug !== existing.slug) {
      const duplicated = await env.sinxy_sai_blog_db
        .prepare("SELECT id FROM posts WHERE slug = ? AND id != ?")
        .bind(slug, id)
        .first<{ id: string }>();

      if (duplicated) {
        return conflict("A post with this slug already exists.");
      }
    }

    await env.sinxy_sai_blog_db
      .prepare(
        `
          UPDATE posts
          SET
            slug = ?,
            title = ?,
            description = ?,
            content_markdown = ?,
            cover_asset_id = ?,
            status = ?,
            pub_date = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
      )
      .bind(
        slug,
        title,
        description,
        contentMarkdown,
        coverAssetId,
        status,
        pubDate,
        id,
      )
      .run();

    if (tags) {
      await syncPostTags(id, tags, env);
    }

    return json({ data: await getAdminPostById(id, env) });
  } catch (error) {
    return validationError(error instanceof Error ? error.message : "Invalid post data.");
  }
}

async function handleAdminPosts(request: Request, env: Env) {
  if (!env.ADMIN_TOKEN) return notConfigured("ADMIN_TOKEN secret");
  if (!isAuthorizedAdmin(request, env)) return unauthorized();

  const { pathname } = new URL(request.url);
  const itemMatch = pathname.match(/^\/api\/admin\/posts\/([^/]+)$/);

  try {
    if (pathname === "/api/admin/posts") {
      if (request.method === "GET") {
        return json({ data: await listAdminPosts(env) });
      }

      if (request.method === "POST") {
        return handleCreateAdminPost(request, env);
      }

      return methodNotAllowed(["GET", "POST"]);
    }

    if (itemMatch) {
      const id = decodeURIComponent(itemMatch[1]);

      if (request.method === "GET") {
        const post = await getAdminPostById(id, env);
        return post ? json({ data: post }) : notFound();
      }

      if (request.method === "PATCH") {
        return handleUpdateAdminPost(request, env, id);
      }

      return methodNotAllowed(["GET", "PATCH"]);
    }

    return notFound();
  } catch (error) {
    console.error("Failed to handle admin posts", error);
    return internalError();
  }
}

function normalizeAsset(row: AssetRow) {
  return {
    id: row.id,
    r2Key: row.r2Key,
    filename: row.filename,
    contentType: row.contentType,
    byteSize: row.byteSize,
    width: row.width,
    height: row.height,
    alt: row.alt,
    createdAt: row.createdAt,
    url: `/media/${row.r2Key}`,
  };
}

async function listAssets(env: Env) {
  const { results } = await env.sinxy_sai_blog_db
    .prepare(
      `
        SELECT
          id,
          r2_key AS r2Key,
          filename,
          content_type AS contentType,
          byte_size AS byteSize,
          width,
          height,
          alt,
          created_at AS createdAt
        FROM assets
        ORDER BY created_at DESC
        LIMIT 100
      `,
    )
    .all<AssetRow>();

  return results.map(normalizeAsset);
}

async function handleAssets(request: Request, env: Env) {
  if (request.method !== "GET") return methodNotAllowed(["GET"]);

  try {
    return json({ data: await listAssets(env) });
  } catch (error) {
    console.error("Failed to list assets", error);
    return internalError();
  }
}

async function getPublishedPostBySlug(slug: string, env: Env) {
  return env.sinxy_sai_blog_db
    .prepare(
      `
        SELECT
          posts.slug,
          posts.title,
          posts.description,
          posts.content_markdown AS contentMarkdown,
          posts.pub_date AS pubDate,
          posts.updated_at AS updatedDate,
          assets.r2_key AS coverAssetKey,
          group_concat(tags.name, ',') AS tags
        FROM posts
        LEFT JOIN assets ON assets.id = posts.cover_asset_id
        LEFT JOIN post_tags ON post_tags.post_id = posts.id
        LEFT JOIN tags ON tags.id = post_tags.tag_id
        WHERE posts.status = 'PUBLISHED'
          AND posts.slug = ?
        GROUP BY posts.id
      `,
    )
    .bind(slug)
    .first<PostDetailRow>();
}

async function getPublishedPostsByTag(tag: string, env: Env) {
  const { results } = await env.sinxy_sai_blog_db
    .prepare(
      `
        SELECT
          posts.slug,
          posts.title,
          posts.description,
          posts.pub_date AS pubDate,
          posts.updated_at AS updatedDate,
          assets.r2_key AS coverAssetKey,
          group_concat(all_tags.name, ',') AS tags
        FROM posts
        JOIN post_tags selected_post_tags ON selected_post_tags.post_id = posts.id
        JOIN tags selected_tags ON selected_tags.id = selected_post_tags.tag_id
        LEFT JOIN assets ON assets.id = posts.cover_asset_id
        LEFT JOIN post_tags all_post_tags ON all_post_tags.post_id = posts.id
        LEFT JOIN tags all_tags ON all_tags.id = all_post_tags.tag_id
        WHERE posts.status = 'PUBLISHED'
          AND selected_tags.name = ?
        GROUP BY posts.id
        ORDER BY posts.pub_date DESC
      `,
    )
    .bind(tag)
    .all<PostListRow>();

  return results;
}

async function handleBlog(request: Request, env: Env) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return methodNotAllowed(["GET", "HEAD"]);
  }

  const { pathname } = new URL(request.url);
  const match = pathname.match(/^\/blog\/([^/]+)\/?$/);

  if (!match) {
    return env.ASSETS.fetch(request);
  }

  const slug = decodeURIComponent(match[1]);

  try {
    const post = await getPublishedPostBySlug(slug, env);

    if (!post) {
      return env.ASSETS.fetch(request);
    }

    if (request.method === "HEAD") {
      return new Response(null, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "public, max-age=60",
        },
      });
    }

    return new Response(await buildPostHtmlFromTemplate(post, request, env), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=60",
      },
    });
  } catch (error) {
    console.error("Failed to render dynamic post", error);
    return internalError();
  }
}

async function handleTags(request: Request, env: Env) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return methodNotAllowed(["GET", "HEAD"]);
  }

  const staticResponse = await env.ASSETS.fetch(request);

  if (staticResponse.status !== 404) {
    return staticResponse;
  }

  const { pathname } = new URL(request.url);
  const match = pathname.match(/^\/tags\/([^/]+)\/?$/);

  if (!match) {
    return staticResponse;
  }

  const tag = decodeURIComponent(match[1]);

  try {
    const posts = await getPublishedPostsByTag(tag, env);

    if (posts.length === 0) {
      return staticResponse;
    }

    if (request.method === "HEAD") {
      return new Response(null, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "public, max-age=60",
        },
      });
    }

    return new Response(await buildTagHtmlFromTemplate(tag, posts, request, env), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=60",
      },
    });
  } catch (error) {
    console.error("Failed to render dynamic tag page", error);
    return internalError();
  }
}

function getSafeFilename(filename: string) {
  const basename = filename.split(/[\\/]/).pop()?.trim() || "upload";
  const dotIndex = basename.lastIndexOf(".");
  const rawName = dotIndex > 0 ? basename.slice(0, dotIndex) : basename;
  const rawExt = dotIndex > 0 ? basename.slice(dotIndex + 1) : "";
  const safeName = rawName
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72) || "upload";
  const safeExt = rawExt.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 12);

  return safeExt ? `${safeName}.${safeExt}` : safeName;
}

function createAssetKey(filename: string) {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const id = crypto.randomUUID();

  return {
    id,
    key: `uploads/${year}/${month}/${id}-${getSafeFilename(filename)}`,
  };
}

async function handleAdminAssets(request: Request, env: Env) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);

  if (!env.ADMIN_TOKEN) return notConfigured("ADMIN_TOKEN secret");
  if (!isAuthorizedAdmin(request, env)) return unauthorized();

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > maxUploadBytes + 2048) {
    return validationError("Uploaded file is too large.", {
      maxBytes: maxUploadBytes,
    });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return validationError("Use multipart/form-data with a file field.");
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const alt = String(formData.get("alt") ?? "").trim().slice(0, 240) || null;

    if (!(file instanceof File)) {
      return validationError("Missing file field.");
    }

    if (!allowedImageTypes.has(file.type)) {
      return validationError("File type is not allowed.", {
        allowedTypes: [...allowedImageTypes],
      });
    }

    if (file.size <= 0 || file.size > maxUploadBytes) {
      return validationError("Uploaded file size is invalid.", {
        maxBytes: maxUploadBytes,
      });
    }

    const { id, key } = createAssetKey(file.name);
    const buffer = await file.arrayBuffer();

    await env.sinxy_sai_blog_media.put(key, buffer, {
      httpMetadata: {
        contentType: file.type,
        cacheControl: "public, max-age=31536000, immutable",
      },
      customMetadata: {
        filename: file.name,
        assetId: id,
      },
    });

    await env.sinxy_sai_blog_db
      .prepare(
        `
          INSERT INTO assets (
            id,
            r2_key,
            filename,
            content_type,
            byte_size,
            alt
          ) VALUES (?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(id, key, file.name, file.type, file.size, alt)
      .run();

    return json(
      {
        data: {
          id,
          r2Key: key,
          filename: file.name,
          contentType: file.type,
          byteSize: file.size,
          alt,
          url: `/media/${key}`,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Failed to upload asset", error);
    return internalError();
  }
}

async function handleMedia(request: Request, env: Env) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return methodNotAllowed(["GET", "HEAD"]);
  }

  const { pathname } = new URL(request.url);
  const key = decodeURIComponent(pathname.replace(/^\/media\/+/, ""));

  if (!key || key.includes("..") || key.startsWith("/")) {
    return notFound();
  }

  try {
    const object = await env.sinxy_sai_blog_media.get(key);

    if (!object) return notFound();

    const headers = new Headers({
      "cache-control": object.httpMetadata?.cacheControl ?? "public, max-age=31536000, immutable",
      "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "x-content-type-options": "nosniff",
    });

    if (request.method === "HEAD") {
      return new Response(null, { headers });
    }

    return new Response(object.body, { headers });
  } catch (error) {
    console.error("Failed to read media object", error);
    return internalError();
  }
}

function handleApi(request: Request, env: Env) {
  const { pathname } = new URL(request.url);

  if (pathname === "/api/health") return handleHealth(request);
  if (pathname === "/api/posts") return handlePosts(request, env);
  if (pathname === "/api/search") return handleSearch(request, env);
  if (pathname === "/api/assets") return handleAssets(request, env);
  if (pathname === "/api/rss.xml") return handleRss(request, env);
  if (pathname === "/api/admin/assets") return handleAdminAssets(request, env);
  if (pathname === "/api/admin/posts" || pathname.startsWith("/api/admin/posts/")) {
    return handleAdminPosts(request, env);
  }

  return notFound();
}

export default {
  fetch(request: Request, env: Env) {
    const { pathname } = new URL(request.url);

    if (pathname.startsWith("/api/")) {
      return handleApi(request, env);
    }

    if (pathname === "/rss.xml") {
      return handleRss(request, env);
    }

    if (pathname.startsWith("/blog/")) {
      return handleBlog(request, env);
    }

    if (pathname.startsWith("/tags/")) {
      return handleTags(request, env);
    }

    if (pathname.startsWith("/media/")) {
      return handleMedia(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
