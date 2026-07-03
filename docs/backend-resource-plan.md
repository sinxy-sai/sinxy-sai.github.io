# Blog Backend And Resource Plan

This project stays static-first while adding Cloudflare backend capabilities.

## Short-Term Architecture

- Astro continues to build static pages into `dist/`.
- Cloudflare Workers serves static assets and handles `/api/*`.
- D1 will store post metadata, markdown content, tags, and asset references.
- R2 will store uploaded images and downloadable resources.
- Existing Markdown posts remain the source of truth until D1 import is ready.

## API Contract

All API responses use one of these shapes:

```ts
type ApiSuccess<T> = { data: T };

type ApiFailure = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};
```

Planned endpoints:

- `GET /api/health` checks the Worker runtime.
- `GET /api/posts` lists published posts from D1.
- `GET /api/posts/:slug` returns a single post from D1.
- `GET /api/assets` lists uploaded asset metadata.
- `GET /media/:key` serves an uploaded R2 asset.
- `GET /api/admin/posts` lists all posts including drafts.
- `POST /api/admin/posts` creates a post.
- `GET /api/admin/posts/:id` returns one admin post.
- `PATCH /api/admin/posts/:id` updates a post.
- `POST /api/admin/assets` uploads an image to R2 and stores metadata in D1.

Admin endpoints must be added only after authentication is in place.

## Admin Asset Upload

Set the admin token as a Cloudflare secret:

```powershell
npx wrangler secret put ADMIN_TOKEN
```

Use a long random value. Do not commit it to Git.

Upload an image:

```powershell
curl.exe -X POST "https://sinxy-sai-blog.sinxy-sai.workers.dev/api/admin/assets" `
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" `
  -F "file=@C:\path\to\image.png" `
  -F "alt=Image description"
```

The response includes a public `url` like:

```text
/media/uploads/2026/07/{asset-id}-image.png
```

Current upload constraints:

- Allowed types: JPEG, PNG, WebP, GIF.
- Max file size: 5 MB.
- Uploaded binary data lives in R2.
- Asset metadata lives in D1.

## Admin Post API

All admin post endpoints require the same bearer token:

```powershell
-H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

Create a published post:

```powershell
curl.exe --proxy "http://127.0.0.1:10794" --ssl-no-revoke -X POST "https://sinxy-sai-blog.sinxy-sai.workers.dev/api/admin/posts" -H "Authorization: Bearer YOUR_ADMIN_TOKEN" -H "Content-Type: application/json" --data-raw "{\"title\":\"D1 发布测试\",\"description\":\"从后端发布的一篇文章。\",\"contentMarkdown\":\"# D1 发布测试\n\n这篇文章来自 Cloudflare D1。\",\"status\":\"PUBLISHED\",\"tags\":[\"Backend\",\"D1\"]}"
```

Create a draft by omitting `status` or setting it to `DRAFT`.

Update a post:

```powershell
curl.exe --proxy "http://127.0.0.1:10794" --ssl-no-revoke -X PATCH "https://sinxy-sai-blog.sinxy-sai.workers.dev/api/admin/posts/POST_ID" -H "Authorization: Bearer YOUR_ADMIN_TOKEN" -H "Content-Type: application/json" --data-raw "{\"status\":\"PUBLISHED\",\"tags\":[\"Backend\",\"Cloudflare\"]}"
```

Supported post fields:

- `title`: required on create.
- `description`: required on create.
- `contentMarkdown`: required on create.
- `slug`: optional; generated from title when omitted.
- `status`: `DRAFT` or `PUBLISHED`.
- `pubDate`: optional ISO-compatible date; defaults to now.
- `updatedDate`: optional ISO-compatible date or `null`.
- `coverAssetId`: optional asset id or `null`.
- `tags`: optional string array.

## Resource Rules

- R2 keys should be stable and human-readable:
  - `posts/{postSlug}/{yyyyMMdd}-{safeFilename}`
  - `avatars/{safeFilename}`
  - `site/{safeFilename}`
- Store asset metadata in D1 even though the binary file lives in R2.
- Markdown content should reference images by public URL or by asset id resolved at render time.
- Keep old local `public/` assets supported while migrating.

## Migration Order

1. Add Worker API shell.
2. Create D1 database and run `db/schema.sql`.
3. Create R2 bucket for blog media.
4. Add D1 and R2 bindings to `wrangler.jsonc`.
5. Implement read-only post API.
6. Build a private admin editor and upload flow.
7. Import existing Markdown posts into D1.
8. Switch the public blog listing/detail pages to backend data.

## Cloudflare Resources

Suggested names:

- D1 database: `sinxy-sai-blog-db`
- R2 bucket: `sinxy-sai-blog-media`

Do not commit secrets. Admin auth configuration should use Cloudflare secrets or Access policies.
