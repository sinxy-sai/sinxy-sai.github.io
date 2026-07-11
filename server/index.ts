import Database from "better-sqlite3";
import { createHash, randomUUID } from "node:crypto";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import katex from "katex";
import Meting from "@meting/core";
import { createHighlighter, type BundledLanguage } from "shiki";

type ApiErrorCode =
  | "CONFLICT"
  | "NOT_FOUND"
  | "METHOD_NOT_ALLOWED"
  | "NOT_CONFIGURED"
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR";

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
  contentOrigin: "ORIGINAL" | "REPOST" | "TRANSLATION";
  creationStatement: "NONE" | "AI_ASSISTED" | "AGGREGATED" | "PERSONAL_VIEW";
  visibility: "PUBLIC" | "PRIVATE";
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

interface MusicTrack {
  id: string | number;
  name?: string;
  artist?: string[] | string;
  pic_id?: string | number;
  url_id?: string | number;
  lyric_id?: string | number;
}

interface MusicSong {
  id: string;
  title: string;
  artist: string;
  cover: string;
  src: string;
  lrcUrl: string;
}

interface MusicCache {
  key: string;
  expiresAt: number;
  songs: MusicSong[];
}

interface PersistentMusicCache {
  key: string;
  savedAt: number;
  songs: MusicSong[];
}

interface RenderedHeading {
  depth: number;
  text: string;
  slug: string;
}

interface RenderedMarkdownDocument {
  html: string;
  headings: RenderedHeading[];
}

type AnalyticsEventType = "pageview" | "web_vital" | "client_error" | "api";

interface AnalyticsEventInput {
  eventType: AnalyticsEventType;
  path: string;
  pageTitle?: string | null;
  referrer?: string | null;
  visitorId?: string | null;
  sessionId?: string | null;
  metricName?: string | null;
  metricValue?: number | null;
  durationMs?: number | null;
  statusCode?: number | null;
  userAgent?: string | null;
}

interface AnalyticsSummaryRow {
  totalPageviews: number;
  uniqueVisitors: number;
  averageApiDurationMs: number | null;
  clientErrors: number;
}

interface AnalyticsDailyRow {
  date: string;
  pageviews: number;
  visitors: number;
}

interface AnalyticsPopularPageRow {
  path: string;
  pageTitle: string | null;
  pageviews: number;
  visitors: number;
}

interface AnalyticsApiRow {
  path: string;
  requests: number;
  averageDurationMs: number | null;
  maxDurationMs: number | null;
  errors: number;
}

interface AnalyticsVitalRow {
  metricName: string;
  averageValue: number | null;
  latestValue: number | null;
  samples: number;
}

interface AnalyticsErrorRow {
  path: string;
  pageTitle: string | null;
  metricName: string | null;
  statusCode: number | null;
  createdAt: string;
}

const maxUploadBytes = 5 * 1024 * 1024;
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dataDir = resolve(process.env.BLOG_DATA_DIR || join(rootDir, ".data"));
const databasePath = resolve(process.env.BLOG_DB_PATH || join(dataDir, "blog.sqlite"));
const mediaDir = resolve(process.env.BLOG_MEDIA_DIR || join(dataDir, "media"));
const distDir = resolve(process.env.BLOG_DIST_DIR || join(rootDir, "dist"));
const port = Number(process.env.PORT || 8787);
const musicCacheTtlMs = 10 * 60 * 1000;
const musicCacheMaxStaleMs = 24 * 60 * 60 * 1000;
const musicCachePath = join(dataDir, "music-cache.json");
const analyticsEventTypes = new Set<AnalyticsEventType>(["pageview", "web_vital", "client_error", "api"]);
const highlightedLanguages: BundledLanguage[] = [
  "javascript",
  "typescript",
  "html",
  "css",
  "bash",
  "python",
  "c",
  "cpp",
  "java",
  "csharp",
  "go",
  "rust",
  "php",
  "kotlin",
  "swift",
  "sql",
  "json",
  "yaml",
  "markdown",
];
const markdownRenderCache = new Map<string, RenderedMarkdownDocument>();
const maxMarkdownCacheEntries = 100;
let musicCache: MusicCache | null = null;
let musicRefreshPromise: Promise<MusicSong[]> | null = null;

const codeHighlighter = await createHighlighter({
  themes: ["github-light", "github-dark"],
  langs: highlightedLanguages,
}).catch((error) => {
  console.warn("Shiki syntax highlighting is unavailable; using plain code blocks.", error);
  return null;
});

mkdirSync(dataDir, { recursive: true });
mkdirSync(mediaDir, { recursive: true });

const db = new Database(databasePath);
db.pragma("foreign_keys = ON");

initializeDatabase();

function initializeDatabase() {
  const schemaPath = join(rootDir, "db", "schema.sql");
  db.exec(readFileSync(schemaPath, "utf8"));

  const columns = new Set(
    db.prepare("PRAGMA table_info(posts)").all().map((column) => String((column as { name: string }).name)),
  );

  const missingColumns = [
    ["content_origin", "TEXT NOT NULL DEFAULT 'ORIGINAL'"],
    ["creation_statement", "TEXT NOT NULL DEFAULT 'NONE'"],
    ["visibility", "TEXT NOT NULL DEFAULT 'PUBLIC'"],
  ].filter(([name]) => !columns.has(name));

  for (const [name, definition] of missingColumns) {
    db.exec(`ALTER TABLE posts ADD COLUMN ${name} ${definition}`);
  }

  db.prepare("DELETE FROM analytics_events WHERE created_at < datetime('now', '-90 days')").run();
}

function json(body: unknown, response: ServerResponse, status = 200, headers?: Record<string, string>) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  });
  response.end(JSON.stringify(body));
}

function apiError(
  response: ServerResponse,
  status: number,
  code: ApiErrorCode,
  message: string,
  headers?: Record<string, string>,
) {
  json({ error: { code, message } }, response, status, headers);
}

function methodNotAllowed(response: ServerResponse, allowed: string[]) {
  apiError(response, 405, "METHOD_NOT_ALLOWED", `Method not allowed. Use ${allowed.join(", ")}.`, {
    allow: allowed.join(", "),
  });
}

function notConfigured(response: ServerResponse, resource: string) {
  apiError(response, 501, "NOT_CONFIGURED", `${resource} is not configured yet.`);
}

function unauthorized(response: ServerResponse) {
  apiError(response, 401, "UNAUTHORIZED", "Admin authorization is required.", {
    "www-authenticate": 'Bearer realm="admin"',
  });
}

function validationError(response: ServerResponse, message: string, details?: unknown) {
  json({ error: { code: "VALIDATION_ERROR", message, details } }, response, 422);
}

function conflict(response: ServerResponse, message: string) {
  apiError(response, 409, "CONFLICT", message);
}

function isAuthorizedAdmin(request: IncomingMessage) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return false;

  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return false;

  return header.slice("Bearer ".length) === token;
}

function readRequestBuffer(request: IncomingMessage, maxBytes: number) {
  return new Promise<Buffer>((resolvePromise, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;

    request.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error("Request body is too large."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () => resolvePromise(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

async function readJsonBody(request: IncomingMessage) {
  const contentType = request.headers["content-type"] ?? "";
  const contentLength = Number(request.headers["content-length"] ?? "0");

  if (!String(contentType).toLowerCase().includes("application/json")) {
    throw new Error("Use application/json.");
  }

  if (contentLength > 256 * 1024) {
    throw new Error("JSON body is too large.");
  }

  const bodyText = (await readRequestBuffer(request, 256 * 1024)).toString("utf8");
  const body = JSON.parse(bodyText);

  if (!isRecord(body)) {
    throw new Error("JSON body must be an object.");
  }

  return body;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function boundedNumber(value: unknown, min = 0, max = 10_000) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return null;
  return Math.max(min, Math.min(max, numberValue));
}

function normalizeAnalyticsPath(value: unknown) {
  const raw = boundedString(value, 240);
  if (!raw) return "/";

  try {
    const parsed = new URL(raw, "https://sinxy.local");
    return `${parsed.pathname}${parsed.search}`.slice(0, 240) || "/";
  } catch {
    return raw.startsWith("/") ? raw.slice(0, 240) : "/";
  }
}

function normalizeAnalyticsId(value: unknown) {
  const raw = boundedString(value, 96);
  return /^[a-zA-Z0-9._:-]{8,96}$/.test(raw) ? raw : "";
}

function insertAnalyticsEvent(input: AnalyticsEventInput) {
  db.prepare(
    `
      INSERT INTO analytics_events (
        id,
        event_type,
        path,
        page_title,
        referrer,
        visitor_id,
        session_id,
        metric_name,
        metric_value,
        duration_ms,
        status_code,
        user_agent
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    randomUUID(),
    input.eventType,
    input.path,
    input.pageTitle || null,
    input.referrer || null,
    input.visitorId || null,
    input.sessionId || null,
    input.metricName || null,
    input.metricValue ?? null,
    input.durationMs ?? null,
    input.statusCode ?? null,
    input.userAgent || null,
  );
}

function shouldTrackApiRequest(pathname: string) {
  return (
    pathname.startsWith("/api/") &&
    pathname !== "/api/analytics/event" &&
    !pathname.startsWith("/api/admin/")
  );
}

function trackApiRequest(request: IncomingMessage, response: ServerResponse, url: URL, startedAt: number) {
  if (!shouldTrackApiRequest(url.pathname)) return;

  response.on("finish", () => {
    try {
      insertAnalyticsEvent({
        eventType: "api",
        path: normalizeAnalyticsPath(url.pathname),
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        statusCode: response.statusCode,
        userAgent: boundedString(request.headers["user-agent"], 240),
      });
    } catch (error) {
      console.error("Failed to record API analytics:", error);
    }
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
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

function normalizeStatus(value: unknown) {
  if (value === undefined || value === null) return "DRAFT";
  if (value !== "DRAFT" && value !== "PUBLISHED") {
    throw new Error("status must be DRAFT or PUBLISHED.");
  }

  return value;
}

function normalizeContentOrigin(value: unknown) {
  if (value === undefined || value === null) return "ORIGINAL";
  if (value !== "ORIGINAL" && value !== "REPOST" && value !== "TRANSLATION") {
    throw new Error("contentOrigin must be ORIGINAL, REPOST, or TRANSLATION.");
  }

  return value;
}

function normalizeCreationStatement(value: unknown) {
  if (value === undefined || value === null) return "NONE";
  if (
    value !== "NONE" &&
    value !== "AI_ASSISTED" &&
    value !== "AGGREGATED" &&
    value !== "PERSONAL_VIEW"
  ) {
    throw new Error("creationStatement is invalid.");
  }

  return value;
}

function normalizeVisibility(value: unknown) {
  if (value === undefined || value === null) return "PUBLIC";
  if (value !== "PUBLIC" && value !== "PRIVATE") {
    throw new Error("visibility must be PUBLIC or PRIVATE.");
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
    .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_, alt, url) => (
      `<img src="${safeMarkdownUrl(url)}" alt="${alt}" loading="lazy" decoding="async" />`
    ))
    .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_, text, url) => (
      `<a href="${safeMarkdownUrl(url)}" target="_blank" rel="noreferrer">${text}</a>`
    ))
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function safeMarkdownUrl(value: string) {
  const url = String(value || "").trim();
  if (/^(https?:|\/|\.\/|\.\.\/|#|mailto:)/i.test(url)) return escapeHtml(url);
  return "#";
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

function splitMarkdownTableRow(line: string) {
  const trimmed = line.trim();
  const normalized = trimmed.startsWith("|") ? trimmed.slice(1) : trimmed;
  const withoutTrailingPipe = normalized.endsWith("|") ? normalized.slice(0, -1) : normalized;
  const cells: string[] = [];
  let cell = "";
  let isEscaped = false;

  for (const char of withoutTrailingPipe) {
    if (char === "|" && !isEscaped) {
      cells.push(cell.trim());
      cell = "";
      continue;
    }

    cell += char;
    isEscaped = char === "\\" && !isEscaped;
    if (char !== "\\") isEscaped = false;
  }

  cells.push(cell.trim());
  return cells;
}

function getMarkdownTableAlignments(line: string, columnCount: number) {
  const cells = splitMarkdownTableRow(line);
  if (cells.length !== columnCount) return null;

  const alignments: Array<"left" | "center" | "right" | ""> = [];

  for (const cell of cells) {
    const value = cell.replace(/\s+/g, "");
    if (!/^:?-{3,}:?$/.test(value)) return null;
    const left = value.startsWith(":");
    const right = value.endsWith(":");
    alignments.push(left && right ? "center" : right ? "right" : left ? "left" : "");
  }

  return alignments;
}

function isPotentialMarkdownTableRow(line: string) {
  return line.includes("|") && splitMarkdownTableRow(line).length > 1;
}

function renderMarkdownTable(rows: string[][], alignments: Array<"left" | "center" | "right" | "">) {
  const header = rows[0] || [];
  const body = rows.slice(1);
  const deferredClass = body.length >= 12 || header.length >= 8 ? " deferred-table" : "";
  const renderAlign = (index: number) => (alignments[index] ? ` style="text-align: ${alignments[index]}"` : "");

  return `
    <div class="table-scroll${deferredClass}">
      <table>
        <thead>
          <tr>${header.map((cell, index) => `<th${renderAlign(index)}>${renderInlineMarkdown(cell)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${body
            .map(
              (row) =>
                `<tr>${header
                  .map((_, index) => `<td${renderAlign(index)}>${renderInlineMarkdown(row[index] || "")}</td>`)
                  .join("")}</tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

const codeLanguageAliases: Record<string, string> = {
  "c#": "csharp",
  "c++": "cpp",
  cs: "csharp",
  js: "javascript",
  md: "markdown",
  plain: "text",
  plaintext: "text",
  py: "python",
  sh: "bash",
  shell: "bash",
  ts: "typescript",
  txt: "text",
  yml: "yaml",
};

const codeLanguageLabels: Record<string, string> = {
  bash: "Bash",
  c: "C",
  cpp: "C++",
  csharp: "C#",
  css: "CSS",
  go: "Go",
  html: "HTML",
  java: "Java",
  javascript: "JavaScript",
  json: "JSON",
  kotlin: "Kotlin",
  markdown: "Markdown",
  php: "PHP",
  python: "Python",
  rust: "Rust",
  sql: "SQL",
  swift: "Swift",
  text: "Text",
  typescript: "TypeScript",
  yaml: "YAML",
};

function normalizeCodeLanguage(language: string) {
  const normalized = language.trim().toLowerCase();
  return (codeLanguageAliases[normalized] ?? normalized) || "text";
}

function renderCodeBlock(code: string, language: string) {
  const normalizedLanguage = normalizeCodeLanguage(language);
  const languageLabel = codeLanguageLabels[normalizedLanguage] ?? normalizedLanguage.toUpperCase();
  const attributes = `data-language="${escapeHtml(languageLabel)}" data-code-language="${escapeHtml(normalizedLanguage)}"`;

  if (codeHighlighter) {
    try {
      return codeHighlighter
        .codeToHtml(code, {
          lang: normalizedLanguage,
          themes: { light: "github-light", dark: "github-dark" },
          defaultColor: false,
        })
        .replace("<pre ", `<pre ${attributes} `)
        .replace("<code>", `<code class="language-${escapeHtml(normalizedLanguage)}">`);
    } catch {
      // Unknown fence languages remain readable instead of breaking the article response.
    }
  }

  return `<pre ${attributes}><code class="language-${escapeHtml(normalizedLanguage)}">${escapeHtml(code)}</code></pre>`;
}

function renderMarkdownDocumentUncached(markdown: string): RenderedMarkdownDocument {
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
    html.push(renderCodeBlock(codeLines.join("\n"), codeLanguage));
    codeLines = [];
    codeLanguage = "";
  }

  function flushDisplayMath() {
    html.push(renderMath(displayMathLines.join("\n"), true));
    displayMathLines = [];
  }

  const lines = markdown.replace(/\r\n/g, "\n").split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const codeFence = line.match(/^```\s*([A-Za-z0-9_+#.-]+)?\s*$/);

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

    const tableHeader = splitMarkdownTableRow(line);
    const tableAlignments =
      tableHeader.length > 1 && lines[index + 1]
        ? getMarkdownTableAlignments(lines[index + 1], tableHeader.length)
        : null;
    if (tableAlignments) {
      flushParagraph(paragraphLines, html);
      flushList();
      const tableRows = [tableHeader];
      index += 2;

      while (index < lines.length && isPotentialMarkdownTableRow(lines[index])) {
        tableRows.push(splitMarkdownTableRow(lines[index]));
        index += 1;
      }

      index -= 1;
      html.push(renderMarkdownTable(tableRows, tableAlignments));
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

function renderMarkdownDocument(markdown: string): RenderedMarkdownDocument {
  const cacheKey = createHash("sha256").update(markdown).digest("hex");
  const cached = markdownRenderCache.get(cacheKey);
  if (cached) return cached;

  const rendered = renderMarkdownDocumentUncached(markdown);
  markdownRenderCache.set(cacheKey, rendered);

  if (markdownRenderCache.size > maxMarkdownCacheEntries) {
    const oldestKey = markdownRenderCache.keys().next().value;
    if (oldestKey) markdownRenderCache.delete(oldestKey);
  }

  return rendered;
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

function getPublishedPostList() {
  return db
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
          AND posts.visibility = 'PUBLIC'
        GROUP BY posts.id
        ORDER BY posts.pub_date DESC
      `,
    )
    .all() as PostListRow[];
}

function getPublishedPostBySlug(slug: string) {
  return db
    .prepare(
      `
        SELECT
          posts.slug,
          posts.title,
          posts.description,
          posts.content_markdown AS contentMarkdown,
          posts.pub_date AS pubDate,
          posts.updated_at AS updatedDate,
          posts.content_origin AS contentOrigin,
          posts.creation_statement AS creationStatement,
          posts.visibility,
          assets.r2_key AS coverAssetKey,
          group_concat(tags.name, ',') AS tags
        FROM posts
        LEFT JOIN assets ON assets.id = posts.cover_asset_id
        LEFT JOIN post_tags ON post_tags.post_id = posts.id
        LEFT JOIN tags ON tags.id = post_tags.tag_id
        WHERE posts.status = 'PUBLISHED'
          AND posts.visibility = 'PUBLIC'
          AND posts.slug = ?
        GROUP BY posts.id
      `,
    )
    .get(slug) as PostDetailRow | undefined;
}

function getPublishedPostsByTag(tag: string) {
  return db
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
          AND posts.visibility = 'PUBLIC'
          AND selected_tags.name = ?
        GROUP BY posts.id
        ORDER BY posts.pub_date DESC
      `,
    )
    .all(tag) as PostListRow[];
}

function renderTagLinks(tags: string[]) {
  return tags
    .map((tag) => `<a class="tag" href="/tags/${encodeURIComponent(tag)}/">${escapeHtml(tag)}</a>`)
    .join("");
}

function getContentOriginLabel(value: PostDetailRow["contentOrigin"]) {
  const labels = {
    ORIGINAL: "原创",
    REPOST: "转载",
    TRANSLATION: "翻译",
  };

  return labels[value] || labels.ORIGINAL;
}

function getCreationStatementLabel(value: PostDetailRow["creationStatement"]) {
  const labels = {
    NONE: "",
    AI_ASSISTED: "部分内容由 AI 辅助生成。",
    AGGREGATED: "内容来源网络，进行了整理和再创作。",
    PERSONAL_VIEW: "个人观点，仅供参考。",
  };

  return labels[value] || "";
}

function renderContentOriginBadge(post: PostDetailRow) {
  return `<span class="article-origin-badge">${escapeHtml(getContentOriginLabel(post.contentOrigin))}</span>`;
}

function renderCreationStatement(post: PostDetailRow) {
  const statement = getCreationStatementLabel(post.creationStatement);
  if (!statement) return "";

  return `
    <aside class="creation-statement" aria-label="创作声明">
      <strong>创作声明</strong>
      <p>${escapeHtml(statement)}</p>
    </aside>
  `;
}

function renderArticleToc(headings: RenderedHeading[]) {
  const tocHeadings = headings.filter((heading) => heading.depth >= 2 && heading.depth <= 3);

  if (!tocHeadings.length) return "";

  return `
    <button
      class="article-toc-toggle"
      type="button"
      data-article-toc-toggle
      aria-controls="article-toc-panel"
      aria-expanded="false"
    >
      目录
    </button>
    <div class="article-toc-backdrop" data-article-toc-close hidden></div>
    <aside id="article-toc-panel" class="article-toc" aria-label="文章目录" data-article-toc>
      <div class="article-toc-head">
        <h2>目录</h2>
        <button class="article-toc-close" type="button" data-article-toc-close aria-label="关闭目录">×</button>
      </div>
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

function replaceTemplateTokens(template: string, replacements: Record<string, string>) {
  let html = template;

  for (const [token, value] of Object.entries(replacements)) {
    html = html.split(token).join(value);
  }

  return html;
}

function loadDistTemplate(path: string) {
  const templatePath = join(distDir, path, "index.html");
  if (!existsSync(templatePath)) {
    throw new Error(`Template not found. Run npm run build first: ${templatePath}`);
  }

  return readFileSync(templatePath, "utf8");
}

function handleStaticDistPage(request: IncomingMessage, response: ServerResponse, path: string) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return methodNotAllowed(response, ["GET", "HEAD"]);
  }

  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "public, max-age=60",
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  response.end(loadDistTemplate(path));
}

function buildPostHtml(post: PostDetailRow, requestUrl: string) {
  const tags = post.tags ? post.tags.split(",").filter(Boolean) : [];
  const template = loadDistTemplate("dynamic-template/post");
  const updated = post.updatedDate ? `<span>最后编辑于 ${formatDate(post.updatedDate)}</span>` : "";
  const publicUrl = new URL(`/blog/${post.slug}/`, requestUrl).toString();
  const renderedPost = renderMarkdownDocument(post.contentMarkdown);
  const publishedPosts = getPublishedPostList();
  const toc = renderArticleToc(renderedPost.headings);

  return replaceTemplateTokens(template, {
    "__D1_POST_TITLE__": escapeHtml(post.title),
    "__D1_POST_DESCRIPTION__": escapeHtml(post.description),
    "__D1_POST_PUBLISHED_TIME__": escapeHtml(post.pubDate),
    "__D1_POST_DATE__": formatDate(post.pubDate),
    "__D1_POST_UPDATED__": updated,
    "__D1_POST_ORIGIN__": renderContentOriginBadge(post),
    "__D1_POST_TAGS__": renderTagLinks(tags),
    "__D1_POST_LAYOUT_CLASS__": toc ? "has-toc" : "no-toc",
    "__D1_POST_TOC__": toc,
    "__D1_POST_CONTENT__": renderedPost.html,
    "__D1_POST_CREATION_STATEMENT__": renderCreationStatement(post),
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

function buildTagHtml(tag: string, posts: PostListRow[], requestUrl: string) {
  const template = loadDistTemplate("dynamic-template/tag");
  const publicUrl = new URL(`/tags/${encodeURIComponent(tag)}/`, requestUrl).toString();

  return replaceTemplateTokens(template, {
    "__D1_TAG_TITLE__": escapeHtml(tag),
    "__D1_TAG_COUNT__": String(posts.length),
    "__D1_TAG_POSTS__": renderTagPostCards(posts),
    "https://sinxy-sai.github.io/dynamic-template/tag/": publicUrl,
    "/dynamic-template/tag/": `/tags/${encodeURIComponent(tag)}/`,
    'content="noindex, nofollow"': 'content="index, follow"',
  });
}

function handleHealth(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "GET") return methodNotAllowed(response, ["GET"]);

  json(
    {
      data: {
        ok: true,
        service: "sinxy-sai-blog",
        runtime: "node-sqlite",
        databasePath,
        timestamp: new Date().toISOString(),
      },
    },
    response,
  );
}

function handlePosts(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "GET") return methodNotAllowed(response, ["GET"]);

  const results = getPublishedPostList();
  json(
    {
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
    },
    response,
  );
}

function handleAssets(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "GET") return methodNotAllowed(response, ["GET"]);
  json({ data: listAssets() }, response);
}

async function handleAnalyticsEvent(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);

  try {
    const body = await readJsonBody(request);
    const eventType = boundedString(body.type, 32) as AnalyticsEventType;

    if (!analyticsEventTypes.has(eventType) || eventType === "api") {
      return validationError(response, "Invalid analytics event type.");
    }

    const metricName = boundedString(body.metricName, 48);
    const metricValue = boundedNumber(body.metricValue, 0, 60_000);
    const durationMs = boundedNumber(body.durationMs, 0, 60_000);
    const referrer = boundedString(body.referrer, 240);

    if (eventType === "web_vital" && (!metricName || metricValue === null)) {
      return validationError(response, "Web vital events require metricName and metricValue.");
    }

    insertAnalyticsEvent({
      eventType,
      path: normalizeAnalyticsPath(body.path),
      pageTitle: boundedString(body.pageTitle, 160),
      referrer: referrer ? normalizeAnalyticsPath(referrer) : "",
      visitorId: normalizeAnalyticsId(body.visitorId),
      sessionId: normalizeAnalyticsId(body.sessionId),
      metricName,
      metricValue,
      durationMs,
      statusCode: null,
      userAgent: boundedString(request.headers["user-agent"], 240),
    });

    json({ data: { ok: true } }, response, 202);
  } catch (error) {
    validationError(response, error instanceof Error ? error.message : "Invalid analytics event.");
  }
}

function getAdminAnalytics(days = 7) {
  const safeDays = Math.max(1, Math.min(30, Math.floor(days)));
  const sinceModifier = `-${safeDays} days`;

  const summary = db
    .prepare(
      `
        SELECT
          COUNT(CASE WHEN event_type = 'pageview' THEN 1 END) AS totalPageviews,
          COUNT(DISTINCT CASE WHEN event_type = 'pageview' THEN visitor_id END) AS uniqueVisitors,
          AVG(CASE WHEN event_type = 'api' THEN duration_ms END) AS averageApiDurationMs,
          COUNT(CASE WHEN event_type = 'client_error' THEN 1 END) AS clientErrors
        FROM analytics_events
        WHERE created_at >= datetime('now', ?)
      `,
    )
    .get(sinceModifier) as AnalyticsSummaryRow;

  const today = db
    .prepare(
      `
        SELECT
          COUNT(CASE WHEN event_type = 'pageview' THEN 1 END) AS totalPageviews,
          COUNT(DISTINCT CASE WHEN event_type = 'pageview' THEN visitor_id END) AS uniqueVisitors,
          AVG(CASE WHEN event_type = 'api' THEN duration_ms END) AS averageApiDurationMs,
          COUNT(CASE WHEN event_type = 'client_error' THEN 1 END) AS clientErrors
        FROM analytics_events
        WHERE created_at >= date('now')
      `,
    )
    .get() as AnalyticsSummaryRow;

  const daily = db
    .prepare(
      `
        SELECT
          date(created_at) AS date,
          COUNT(*) AS pageviews,
          COUNT(DISTINCT visitor_id) AS visitors
        FROM analytics_events
        WHERE event_type = 'pageview'
          AND created_at >= datetime('now', ?)
        GROUP BY date(created_at)
        ORDER BY date ASC
      `,
    )
    .all(sinceModifier) as AnalyticsDailyRow[];

  const popularPages = db
    .prepare(
      `
        SELECT
          path,
          MAX(page_title) AS pageTitle,
          COUNT(*) AS pageviews,
          COUNT(DISTINCT visitor_id) AS visitors
        FROM analytics_events
        WHERE event_type = 'pageview'
          AND created_at >= datetime('now', ?)
        GROUP BY path
        ORDER BY pageviews DESC
        LIMIT 12
      `,
    )
    .all(sinceModifier) as AnalyticsPopularPageRow[];

  const api = db
    .prepare(
      `
        SELECT
          path,
          COUNT(*) AS requests,
          AVG(duration_ms) AS averageDurationMs,
          MAX(duration_ms) AS maxDurationMs,
          COUNT(CASE WHEN status_code >= 400 THEN 1 END) AS errors
        FROM analytics_events
        WHERE event_type = 'api'
          AND created_at >= datetime('now', ?)
        GROUP BY path
        ORDER BY requests DESC
        LIMIT 12
      `,
    )
    .all(sinceModifier) as AnalyticsApiRow[];

  const webVitals = db
    .prepare(
      `
        SELECT
          metric_name AS metricName,
          AVG(metric_value) AS averageValue,
          (
            SELECT latest.metric_value
            FROM analytics_events latest
            WHERE latest.event_type = 'web_vital'
              AND latest.metric_name = analytics_events.metric_name
            ORDER BY latest.created_at DESC
            LIMIT 1
          ) AS latestValue,
          COUNT(*) AS samples
        FROM analytics_events
        WHERE event_type = 'web_vital'
          AND created_at >= datetime('now', ?)
        GROUP BY metric_name
        ORDER BY metric_name ASC
      `,
    )
    .all(sinceModifier) as AnalyticsVitalRow[];

  const recentErrors = db
    .prepare(
      `
        SELECT
          path,
          page_title AS pageTitle,
          metric_name AS metricName,
          status_code AS statusCode,
          created_at AS createdAt
        FROM analytics_events
        WHERE (event_type = 'client_error' OR (event_type = 'api' AND status_code >= 400))
          AND created_at >= datetime('now', ?)
        ORDER BY created_at DESC
        LIMIT 20
      `,
    )
    .all(sinceModifier) as AnalyticsErrorRow[];

  return {
    rangeDays: safeDays,
    summary,
    today,
    daily,
    popularPages,
    api,
    webVitals,
    recentErrors,
  };
}

function handleAdminAnalytics(request: IncomingMessage, response: ServerResponse, url: URL) {
  if (!process.env.ADMIN_TOKEN) return notConfigured(response, "ADMIN_TOKEN secret");
  if (!isAuthorizedAdmin(request)) return unauthorized(response);
  if (request.method !== "GET") return methodNotAllowed(response, ["GET"]);

  const days = Number(url.searchParams.get("days") || "7");
  json({ data: getAdminAnalytics(days) }, response);
}

function handleSearch(request: IncomingMessage, response: ServerResponse, url: URL) {
  if (request.method !== "GET") return methodNotAllowed(response, ["GET"]);

  const query = (url.searchParams.get("q") || "").trim();
  if (!query) return json({ data: [] }, response);
  if (query.length > 80) {
    return apiError(response, 422, "VALIDATION_ERROR", "q must be 80 characters or fewer.");
  }

  const pattern = escapeLikePattern(query);
  const results = db
    .prepare(
      `
        SELECT
          posts.slug,
          posts.title,
          posts.description,
          posts.content_markdown AS contentMarkdown,
          posts.pub_date AS pubDate,
          posts.updated_at AS updatedDate,
          posts.content_origin AS contentOrigin,
          posts.creation_statement AS creationStatement,
          posts.visibility,
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
          AND posts.visibility = 'PUBLIC'
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
    .all(pattern, pattern, pattern, pattern, pattern, pattern, pattern) as SearchPostRow[];

  json(
    {
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
    },
    response,
  );
}

function parseJsonArray<T>(value: unknown): T[] {
  if (typeof value !== "string") return [];
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) ? (parsed as T[]) : [parsed as T];
}

function getMusicConfig() {
  const playlistId = String(process.env.MUSIC_PLAYLIST_ID || "").trim();
  const ids = String(process.env.MUSIC_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 80);

  return {
    playlistId,
    ids,
    cacheKey: playlistId ? `playlist:${playlistId}` : `ids:${ids.join(",")}`,
  };
}

function normalizeMusicUrl(value: unknown) {
  const url = String(value || "").replace(/^http:\/\//, "https://");
  return /^https:\/\//.test(url) ? url : "";
}

async function fetchMusicSongs(config: ReturnType<typeof getMusicConfig>) {
  const meting = new Meting("netease");
  meting.format(true);

  let tracks: MusicTrack[] = [];

  if (config.playlistId) {
    tracks = parseJsonArray<MusicTrack>(await meting.playlist(config.playlistId));
  } else {
    const results = await Promise.all(
      config.ids.map(async (id) => {
        try {
          return parseJsonArray<MusicTrack>(await meting.song(id));
        } catch {
          return [];
        }
      }),
    );
    tracks = results.flat();
  }

  const songs = (
    await Promise.all(
      tracks.slice(0, 80).map(async (track) => {
        const urlId = String(track.url_id || track.id || "").trim();
        if (!urlId) return null;

        let src = "";
        let cover = "";

        try {
          const urlRows = parseJsonArray<Record<string, unknown>>(await meting.url(urlId, 320));
          src = normalizeMusicUrl(urlRows[0]?.url);
        } catch {
          src = "";
        }

        try {
          const picId = String(track.pic_id || "").trim();
          if (picId) {
            const picRows = parseJsonArray<Record<string, unknown>>(await meting.pic(picId, 300));
            cover = normalizeMusicUrl(picRows[0]?.url);
          }
        } catch {
          cover = "";
        }

        if (!src) return null;

        const artist = Array.isArray(track.artist)
          ? track.artist.join(", ")
          : String(track.artist || "未知歌手");
        const lyricId = String(track.lyric_id || "").trim();

        return {
          id: String(track.id || urlId),
          title: String(track.name || "未知歌曲"),
          artist,
          cover,
          src,
          lrcUrl: lyricId
            ? `https://api.injahow.cn/meting/?server=netease&type=lrc&id=${encodeURIComponent(lyricId)}`
            : "",
        } satisfies MusicSong;
      }),
    )
  ).filter((song): song is MusicSong => Boolean(song));

  return songs;
}

function isMusicSong(value: unknown): value is MusicSong {
  if (!value || typeof value !== "object") return false;
  const song = value as Partial<MusicSong>;
  return [song.id, song.title, song.artist, song.cover, song.src, song.lrcUrl].every(
    (field) => typeof field === "string",
  ) && Boolean(song.src);
}

function readPersistentMusicCache(cacheKey: string) {
  if (!existsSync(musicCachePath)) return null;

  try {
    const parsed = JSON.parse(readFileSync(musicCachePath, "utf8")) as Partial<PersistentMusicCache>;
    if (parsed.key !== cacheKey || !Number.isFinite(parsed.savedAt) || !Array.isArray(parsed.songs)) {
      return null;
    }

    const songs = parsed.songs.filter(isMusicSong);
    if (!songs.length) return null;

    return {
      key: cacheKey,
      savedAt: Number(parsed.savedAt),
      songs,
    } satisfies PersistentMusicCache;
  } catch {
    return null;
  }
}

function persistMusicCache(cache: PersistentMusicCache) {
  try {
    writeFileSync(musicCachePath, JSON.stringify(cache), "utf8");
  } catch (error) {
    console.warn("Failed to persist music cache", error);
  }
}

function refreshMusicSongs(config: ReturnType<typeof getMusicConfig>) {
  if (musicRefreshPromise) return musicRefreshPromise;

  musicRefreshPromise = fetchMusicSongs(config)
    .then((songs) => {
      const savedAt = Date.now();
      musicCache = {
        key: config.cacheKey,
        expiresAt: savedAt + musicCacheTtlMs,
        songs,
      };
      if (songs.length) {
        persistMusicCache({ key: config.cacheKey, savedAt, songs });
      }
      return songs;
    })
    .finally(() => {
      musicRefreshPromise = null;
    });

  return musicRefreshPromise;
}

async function loadMusicSongs() {
  const config = getMusicConfig();
  if (!config.playlistId && config.ids.length === 0) return [];

  const now = Date.now();
  if (musicCache?.key === config.cacheKey && musicCache.expiresAt > now) {
    return musicCache.songs;
  }

  const persistentCache = readPersistentMusicCache(config.cacheKey);
  const staleSongs = musicCache?.key === config.cacheKey
    ? musicCache.songs
    : persistentCache?.songs;
  const savedAt = persistentCache?.savedAt ?? (musicCache?.expiresAt ?? 0) - musicCacheTtlMs;

  if (staleSongs?.length && now - savedAt <= musicCacheMaxStaleMs) {
    musicCache = {
      key: config.cacheKey,
      expiresAt: Math.max(now, savedAt + musicCacheTtlMs),
      songs: staleSongs,
    };
    void refreshMusicSongs(config).catch((error) => {
      console.warn("Failed to refresh stale music cache", error);
    });
    return staleSongs;
  }

  try {
    return await refreshMusicSongs(config);
  } catch (error) {
    if (staleSongs?.length) return staleSongs;
    throw error;
  }
}

async function handleMusic(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "GET") return methodNotAllowed(response, ["GET"]);

  try {
    const songs = await loadMusicSongs();
    return json({ data: songs }, response, 200, {
      "cache-control": "public, max-age=120, stale-while-revalidate=600",
    });
  } catch (error) {
    console.error("Failed to load music data", error);
    return apiError(response, 502, "INTERNAL_ERROR", "Failed to load music data.");
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
    contentOrigin: row.contentOrigin || "ORIGINAL",
    creationStatement: row.creationStatement || "NONE",
    visibility: row.visibility || "PUBLIC",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    url: `/blog/${row.slug}/`,
  };
}

function getAdminPostById(id: string) {
  const row = db
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
          posts.content_origin AS contentOrigin,
          posts.creation_statement AS creationStatement,
          posts.visibility,
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
    .get(id) as AdminPostRow | undefined;

  return row ? normalizeAdminPost(row) : null;
}

function listAdminPosts() {
  const results = db
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
          posts.content_origin AS contentOrigin,
          posts.creation_statement AS creationStatement,
          posts.visibility,
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
    .all() as AdminPostRow[];

  return results.map(normalizeAdminPost);
}

const deletePostTagsStatement = db.prepare("DELETE FROM post_tags WHERE post_id = ?");
const findTagStatement = db.prepare("SELECT id FROM tags WHERE name = ?");
const insertTagStatement = db.prepare("INSERT INTO tags (id, name) VALUES (?, ?)");
const insertPostTagStatement = db.prepare(
  "INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)",
);

function syncPostTags(postId: string, tags: string[]) {
  deletePostTagsStatement.run(postId);

  for (const name of tags) {
    const existing = findTagStatement.get(name) as { id: string } | undefined;
    const tagId = existing?.id ?? `tag_${randomUUID()}`;

    if (!existing) {
      insertTagStatement.run(tagId, name);
    }

    insertPostTagStatement.run(postId, tagId);
  }
}

async function handleCreateAdminPost(request: IncomingMessage, response: ServerResponse) {
  let body: Record<string, unknown>;

  try {
    body = await readJsonBody(request);
  } catch (error) {
    return validationError(response, error instanceof Error ? error.message : "Invalid JSON body.");
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
    const slug = normalizePostSlug(asOptionalString(body.slug, "slug", 120) ?? title);
    const pubDate = body.pubDate ? asIsoDate(body.pubDate, "pubDate") : new Date().toISOString();
    const coverAssetId = asOptionalString(body.coverAssetId, "coverAssetId", 120);
    const contentOrigin = normalizeContentOrigin(body.contentOrigin);
    const creationStatement = normalizeCreationStatement(body.creationStatement);
    const visibility = normalizeVisibility(body.visibility);
    const tags = normalizeTags(body.tags) ?? [];

    if (!slug) return validationError(response, "slug could not be generated.");

    const duplicated = db.prepare("SELECT id FROM posts WHERE slug = ?").get(slug);
    if (duplicated) return conflict(response, "A post with this slug already exists.");

    const id = `post_${randomUUID()}`;

    const createPost = db.transaction(() => {
      db.prepare(
        `
          INSERT INTO posts (
            id,
            slug,
            title,
            description,
            content_markdown,
            cover_asset_id,
            status,
            pub_date,
            content_origin,
            creation_statement,
            visibility
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      ).run(
        id,
        slug,
        title,
        description,
        contentMarkdown,
        coverAssetId,
        status,
        pubDate,
        contentOrigin,
        creationStatement,
        visibility,
      );
      syncPostTags(id, tags);
    });

    createPost();
    json({ data: getAdminPostById(id) }, response, 201);
  } catch (error) {
    validationError(response, error instanceof Error ? error.message : "Invalid post data.");
  }
}

async function handleUpdateAdminPost(
  request: IncomingMessage,
  response: ServerResponse,
  id: string,
) {
  let body: Record<string, unknown>;

  try {
    body = await readJsonBody(request);
  } catch (error) {
    return validationError(response, error instanceof Error ? error.message : "Invalid JSON body.");
  }

  const existing = getAdminPostById(id);
  if (!existing) return apiError(response, 404, "NOT_FOUND", "API route not found.");

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
    const status = body.status === undefined ? existing.status : normalizeStatus(body.status);
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
    const contentOrigin =
      body.contentOrigin === undefined
        ? existing.contentOrigin
        : normalizeContentOrigin(body.contentOrigin);
    const creationStatement =
      body.creationStatement === undefined
        ? existing.creationStatement
        : normalizeCreationStatement(body.creationStatement);
    const visibility =
      body.visibility === undefined ? existing.visibility : normalizeVisibility(body.visibility);
    const tags = normalizeTags(body.tags);

    if (!slug) return validationError(response, "slug is required.");

    if (slug !== existing.slug) {
      const duplicated = db.prepare("SELECT id FROM posts WHERE slug = ? AND id != ?").get(slug, id);
      if (duplicated) return conflict(response, "A post with this slug already exists.");
    }

    const updatePost = db.transaction(() => {
      db.prepare(
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
            content_origin = ?,
            creation_statement = ?,
            visibility = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
      ).run(
        slug,
        title,
        description,
        contentMarkdown,
        coverAssetId,
        status,
        pubDate,
        contentOrigin,
        creationStatement,
        visibility,
        id,
      );

      if (tags) syncPostTags(id, tags);
    });

    updatePost();
    json({ data: getAdminPostById(id) }, response);
  } catch (error) {
    validationError(response, error instanceof Error ? error.message : "Invalid post data.");
  }
}

function handleDeleteAdminPost(request: IncomingMessage, response: ServerResponse, id: string) {
  if (request.method !== "DELETE") return methodNotAllowed(response, ["DELETE"]);

  const existing = getAdminPostById(id);
  if (!existing) return apiError(response, 404, "NOT_FOUND", "API route not found.");

  const deletePost = db.transaction(() => {
    db.prepare("DELETE FROM post_tags WHERE post_id = ?").run(id);
    db.prepare("DELETE FROM post_assets WHERE post_id = ?").run(id);
    db.prepare("DELETE FROM posts WHERE id = ?").run(id);
  });

  deletePost();
  json({ data: { id, title: existing.title } }, response);
}

async function handleAdminPosts(request: IncomingMessage, response: ServerResponse, url: URL) {
  if (!process.env.ADMIN_TOKEN) return notConfigured(response, "ADMIN_TOKEN secret");
  if (!isAuthorizedAdmin(request)) return unauthorized(response);

  const itemMatch = url.pathname.match(/^\/api\/admin\/posts\/([^/]+)$/);

  if (url.pathname === "/api/admin/posts") {
    if (request.method === "GET") return json({ data: listAdminPosts() }, response);
    if (request.method === "POST") return handleCreateAdminPost(request, response);
    return methodNotAllowed(response, ["GET", "POST"]);
  }

  if (itemMatch) {
    const id = decodeURIComponent(itemMatch[1]);

    if (request.method === "GET") {
      const post = getAdminPostById(id);
      return post
        ? json({ data: post }, response)
        : apiError(response, 404, "NOT_FOUND", "API route not found.");
    }

    if (request.method === "PATCH") return handleUpdateAdminPost(request, response, id);
    if (request.method === "DELETE") return handleDeleteAdminPost(request, response, id);

    return methodNotAllowed(response, ["GET", "PATCH", "DELETE"]);
  }

  return apiError(response, 404, "NOT_FOUND", "API route not found.");
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

function listAssets() {
  const results = db
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
    .all() as AssetRow[];

  return results.map(normalizeAsset);
}

function getAssetById(id: string) {
  const row = db
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
        WHERE id = ?
      `,
    )
    .get(id) as AssetRow | undefined;

  return row ? normalizeAsset(row) : null;
}

function getSafeFilename(filename: string) {
  const basename = filename.split(/[\\/]/).pop()?.trim() || "upload";
  const dotIndex = basename.lastIndexOf(".");
  const rawName = dotIndex > 0 ? basename.slice(0, dotIndex) : basename;
  const rawExt = dotIndex > 0 ? basename.slice(dotIndex + 1) : "";
  const safeName =
    rawName
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
  const id = randomUUID();

  return {
    id,
    key: `uploads/${year}/${month}/${id}-${getSafeFilename(filename)}`,
  };
}

function deleteLocalMedia(key: string) {
  const filePath = normalize(resolve(mediaDir, key));
  if (filePath.startsWith(mediaDir + sep) && existsSync(filePath)) {
    rmSync(filePath, { force: true });
  }
}

function handleDeleteAdminAsset(request: IncomingMessage, response: ServerResponse, id: string) {
  if (request.method !== "DELETE") return methodNotAllowed(response, ["DELETE"]);

  const existing = getAssetById(id);
  if (!existing) return apiError(response, 404, "NOT_FOUND", "API route not found.");

  const deleteAsset = db.transaction(() => {
    db.prepare("UPDATE posts SET cover_asset_id = NULL WHERE cover_asset_id = ?").run(id);
    db.prepare("DELETE FROM post_assets WHERE asset_id = ?").run(id);
    db.prepare("DELETE FROM assets WHERE id = ?").run(id);
  });

  deleteAsset();
  deleteLocalMedia(existing.r2Key);
  json({ data: { id, filename: existing.filename } }, response);
}

async function readFormData(request: IncomingMessage, url: URL) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else if (value !== undefined) {
      headers.set(key, value);
    }
  }

  const webRequest = new Request(url, {
    method: request.method,
    headers,
    body: Readable.toWeb(request) as BodyInit,
    duplex: "half",
  } as RequestInit & { duplex: "half" });

  return webRequest.formData();
}

async function handleAdminAssets(request: IncomingMessage, response: ServerResponse, url: URL) {
  if (!process.env.ADMIN_TOKEN) return notConfigured(response, "ADMIN_TOKEN secret");
  if (!isAuthorizedAdmin(request)) return unauthorized(response);

  const itemMatch = url.pathname.match(/^\/api\/admin\/assets\/([^/]+)$/);

  if (itemMatch) {
    const id = decodeURIComponent(itemMatch[1]);
    if (request.method === "DELETE") return handleDeleteAdminAsset(request, response, id);
    return methodNotAllowed(response, ["DELETE"]);
  }

  if (request.method === "GET") {
    return json({ data: listAssets() }, response);
  }

  if (request.method !== "POST") return methodNotAllowed(response, ["GET", "POST"]);

  const contentLength = Number(request.headers["content-length"] ?? "0");
  if (contentLength > maxUploadBytes + 2048) {
    return validationError(response, "Uploaded file is too large.", { maxBytes: maxUploadBytes });
  }

  const contentType = request.headers["content-type"] ?? "";
  if (!String(contentType).toLowerCase().includes("multipart/form-data")) {
    return validationError(response, "Use multipart/form-data with a file field.");
  }

  try {
    const formData = await readFormData(request, url);
    const file = formData.get("file");
    const alt = String(formData.get("alt") ?? "").trim().slice(0, 240) || null;

    if (!(file instanceof File)) return validationError(response, "Missing file field.");

    if (!allowedImageTypes.has(file.type)) {
      return validationError(response, "File type is not allowed.", {
        allowedTypes: [...allowedImageTypes],
      });
    }

    if (file.size <= 0 || file.size > maxUploadBytes) {
      return validationError(response, "Uploaded file size is invalid.", {
        maxBytes: maxUploadBytes,
      });
    }

    const { id, key } = createAssetKey(file.name);
    const filePath = normalize(resolve(mediaDir, key));
    if (!filePath.startsWith(mediaDir + sep)) {
      return validationError(response, "Invalid file path.");
    }

    mkdirSync(resolve(filePath, ".."), { recursive: true });
    writeFileSync(filePath, Buffer.from(await file.arrayBuffer()));

    db.prepare(
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
    ).run(id, key, file.name, file.type, file.size, alt);

    json(
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
      response,
      201,
    );
  } catch (error) {
    console.error("Failed to upload asset", error);
    apiError(response, 500, "INTERNAL_ERROR", "Internal server error.");
  }
}

function handleBlog(request: IncomingMessage, response: ServerResponse, url: URL) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return methodNotAllowed(response, ["GET", "HEAD"]);
  }

  const match = url.pathname.match(/^\/blog\/([^/]+)\/?$/);
  if (!match) return apiError(response, 404, "NOT_FOUND", "Post not found.");

  const post = getPublishedPostBySlug(decodeURIComponent(match[1]));
  if (!post) return apiError(response, 404, "NOT_FOUND", "Post not found.");

  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "public, max-age=60",
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  response.end(buildPostHtml(post, url.toString()));
}

function handleTags(request: IncomingMessage, response: ServerResponse, url: URL) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return methodNotAllowed(response, ["GET", "HEAD"]);
  }

  const match = url.pathname.match(/^\/tags\/([^/]+)\/?$/);
  if (!match) return apiError(response, 404, "NOT_FOUND", "Tag not found.");

  const tag = decodeURIComponent(match[1]);
  const posts = getPublishedPostsByTag(tag);
  if (posts.length === 0) return apiError(response, 404, "NOT_FOUND", "Tag not found.");

  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "public, max-age=60",
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  response.end(buildTagHtml(tag, posts, url.toString()));
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

function handleRss(request: IncomingMessage, response: ServerResponse, url: URL) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return methodNotAllowed(response, ["GET", "HEAD"]);
  }

  const posts = getPublishedPostList();
  const items = posts
    .map((post) => {
      const link = new URL(`/blog/${post.slug}/`, url).toString();
      return `
    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid>${escapeXml(link)}</guid>
      <description>${escapeXml(post.description)}</description>
      <pubDate>${formatRssDate(post.pubDate)}</pubDate>
    </item>`;
    })
    .join("\n");

  response.writeHead(200, {
    "content-type": "application/rss+xml; charset=utf-8",
    "cache-control": "public, max-age=60",
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  response.end(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Sinxy Sai's Blog</title>
    <link>${escapeXml(new URL("/", url).toString())}</link>
    <description>notes, code, and tiny discoveries</description>
${items}
  </channel>
</rss>`);
}

const mimeTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

function handleMedia(request: IncomingMessage, response: ServerResponse, url: URL) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return methodNotAllowed(response, ["GET", "HEAD"]);
  }

  const key = decodeURIComponent(url.pathname.replace(/^\/media\/+/, ""));
  if (!key || key.includes("..") || key.startsWith("/")) {
    return apiError(response, 404, "NOT_FOUND", "Media not found.");
  }

  const filePath = normalize(resolve(mediaDir, key));
  if (!filePath.startsWith(mediaDir + sep) || !existsSync(filePath)) {
    return apiError(response, 404, "NOT_FOUND", "Media not found.");
  }

  response.writeHead(200, {
    "content-type": mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
    "cache-control": "public, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  createReadStream(filePath).pipe(response);
}

function handleRequest(request: IncomingMessage, response: ServerResponse) {
  const startedAt = performance.now();
  const host = request.headers.host || `127.0.0.1:${port}`;
  const url = new URL(request.url || "/", `http://${host}`);
  trackApiRequest(request, response, url, startedAt);

  try {
    if (url.pathname === "/api/health") return handleHealth(request, response);
    if (url.pathname === "/api/posts") return handlePosts(request, response);
    if (url.pathname === "/api/search") return handleSearch(request, response, url);
    if (url.pathname === "/api/assets") return handleAssets(request, response);
    if (url.pathname === "/api/music") return handleMusic(request, response);
    if (url.pathname === "/api/analytics/event") return handleAnalyticsEvent(request, response);
    if (url.pathname === "/api/admin/analytics") return handleAdminAnalytics(request, response, url);
    if (url.pathname === "/api/admin/assets" || url.pathname.startsWith("/api/admin/assets/")) {
      return handleAdminAssets(request, response, url);
    }
    if (url.pathname === "/api/admin/posts" || url.pathname.startsWith("/api/admin/posts/")) {
      return handleAdminPosts(request, response, url);
    }
    if (url.pathname === "/api/rss.xml" || url.pathname === "/rss.xml") {
      return handleRss(request, response, url);
    }
    if (url.pathname.startsWith("/blog/")) return handleBlog(request, response, url);
    if (url.pathname === "/tags" || url.pathname === "/tags/") {
      return handleStaticDistPage(request, response, "tags");
    }
    if (/^\/tags\/[^/]+\/?$/.test(url.pathname)) return handleTags(request, response, url);
    if (url.pathname.startsWith("/media/")) return handleMedia(request, response, url);

    return apiError(response, 404, "NOT_FOUND", "Route not found.");
  } catch (error) {
    console.error("VPS backend failed", error);
    return apiError(response, 500, "INTERNAL_ERROR", "Internal server error.");
  }
}

createServer(handleRequest).listen(port, () => {
  console.log(`sinxy-sai VPS backend listening on http://127.0.0.1:${port}`);
  console.log(`SQLite database: ${databasePath}`);
  console.log(`Media directory: ${mediaDir}`);
});
