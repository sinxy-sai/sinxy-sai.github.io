# API 文档

本文档说明 VPS Node.js 后端提供的接口。后端入口位于 [server/index.ts](../server/index.ts)。

## 通用响应格式

成功响应：

```ts
type ApiSuccess<T> = {
  data: T;
};
```

失败响应：

```ts
type ApiFailure = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};
```

常见错误码：

| code | 含义 |
| --- | --- |
| `UNAUTHORIZED` | 缺少或错误的后台令牌 |
| `NOT_CONFIGURED` | 服务端缺少必要配置，例如 `ADMIN_TOKEN` |
| `VALIDATION_ERROR` | 请求参数或请求体不合法 |
| `NOT_FOUND` | 资源不存在 |
| `CONFLICT` | 资源冲突，例如 slug 重复 |
| `METHOD_NOT_ALLOWED` | HTTP 方法不允许 |
| `INTERNAL_ERROR` | 服务端内部错误 |

## 后台鉴权

后台接口必须带 Bearer Token：

```http
Authorization: Bearer <ADMIN_TOKEN>
```

`ADMIN_TOKEN` 在 VPS 上通过环境变量提供。不要把真实 token 写入文档、代码或 Git。

## 公开接口

### `GET /api/health`

健康检查。

返回示例：

```json
{
  "data": {
    "ok": true,
    "service": "sinxy-sai-blog",
    "runtime": "node-sqlite",
    "databasePath": "/home/ubuntu/sinxy-sai.github.io/.data/blog.sqlite",
    "timestamp": "2026-07-18T00:00:00.000Z"
  }
}
```

### `GET /api/posts`

返回公开、已发布文章列表。

返回字段：

| 字段 | 说明 |
| --- | --- |
| `slug` | 文章 slug |
| `title` | 标题 |
| `description` | 描述 |
| `pubDate` | 发布时间 |
| `updatedDate` | 更新时间，可为 `null` |
| `tags` | 标签数组 |
| `coverAssetKey` | 封面媒体 key，可为 `null` |
| `url` | 文章访问路径 |

### `GET /api/search?q=关键词`

站内搜索。`q` 最长 80 个字符。

返回字段：

| 字段 | 说明 |
| --- | --- |
| `slug` | 文章 slug |
| `title` | 标题 |
| `description` | 描述 |
| `excerpt` | 搜索摘要 |
| `pubDate` | 发布时间 |
| `updatedDate` | 更新时间 |
| `tags` | 标签数组 |
| `url` | 文章路径 |

### `GET /api/assets`

返回最近上传的媒体资源列表。该接口是公开读接口，主要用于页面展示。

### `GET /api/music`

返回音乐播放器所需的歌曲列表。数据来自网易云音乐，后端通过 `@meting/core` 获取并缓存。

返回字段：

| 字段 | 说明 |
| --- | --- |
| `id` | 歌曲 ID |
| `title` | 歌名 |
| `artist` | 歌手 |
| `cover` | 封面 URL |
| `src` | 音频临时直链 |
| `lrcUrl` | 歌词 URL，可为空 |

强制刷新直链：

```http
GET /api/music?refresh=1
```

该模式会尽量跳过本地缓存，重新向网易云获取临时播放链接。音乐系统详情见 [music-system.md](music-system.md)。

### `POST /api/analytics/event`

前端统计事件上报。

支持事件类型：

| type | 说明 |
| --- | --- |
| `pageview` | 页面访问 |
| `web_vital` | Web Vitals 指标 |
| `client_error` | 客户端错误 |

请求示例：

```json
{
  "type": "pageview",
  "path": "/blog/example/",
  "pageTitle": "Example",
  "visitorId": "visitor_xxx",
  "sessionId": "session_xxx"
}
```

`web_vital` 事件必须带 `metricName` 和 `metricValue`。

## 动态页面接口

### `GET /blog/:slug/`

动态渲染文章详情页。只返回 `PUBLISHED` 且 `PUBLIC` 的文章。

### `GET /tags/:tag/`

动态渲染指定标签下的文章列表。

### `GET /rss.xml`

生成 RSS。

### `GET /media/:key`

读取上传媒体文件。媒体文件来自 `.data/media/`。

安全限制：

- 不允许 `..` 路径穿越。
- 只允许访问媒体目录内文件。
- 响应带 `x-content-type-options: nosniff`。

## 后台文章接口

### `GET /api/admin/posts`

返回后台文章列表，包括草稿和私有文章。

### `POST /api/admin/posts`

创建文章。

请求体字段：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `title` | 是 | 标题，最长 180 |
| `description` | 是 | 描述，最长 320 |
| `contentMarkdown` | 是 | Markdown 正文，最长 120000 |
| `slug` | 否 | 不传则由标题生成 |
| `status` | 否 | `DRAFT` 或 `PUBLISHED` |
| `pubDate` | 否 | ISO 日期，不传则使用当前时间 |
| `coverAssetId` | 否 | 封面资源 ID |
| `contentOrigin` | 否 | `ORIGINAL`、`REPOST`、`TRANSLATION` |
| `creationStatement` | 否 | `NONE`、`AI_ASSISTED`、`AGGREGATED`、`PERSONAL_VIEW` |
| `visibility` | 否 | `PUBLIC` 或 `PRIVATE` |
| `tags` | 否 | 字符串数组 |

示例：

```bash
curl -X POST "http://127.0.0.1:8787/api/admin/posts" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"title":"测试文章","description":"测试描述","contentMarkdown":"# Hello","status":"PUBLISHED","tags":["Test"]}'
```

### `GET /api/admin/posts/:id`

返回单篇后台文章详情。

### `PATCH /api/admin/posts/:id`

更新文章。字段与创建接口相同，未传字段保持原值。

### `DELETE /api/admin/posts/:id`

删除文章，同时删除文章与标签、媒体的关联。

## 后台媒体接口

### `GET /api/admin/assets`

返回媒体列表。

### `POST /api/admin/assets`

上传图片。请求必须是 `multipart/form-data`，文件字段名为 `file`。

可选字段：

| 字段 | 说明 |
| --- | --- |
| `alt` | 图片替代文本，最长 240 |

限制：

- JPEG、PNG、WebP、GIF。
- 最大 5 MB。

示例：

```bash
curl -X POST "http://127.0.0.1:8787/api/admin/assets" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -F "file=@/path/to/image.png" \
  -F "alt=图片说明"
```

### `DELETE /api/admin/assets/:id`

删除媒体。删除时会：

1. 清空引用它作为封面的文章字段。
2. 删除 `post_assets` 关联。
3. 删除 `assets` 记录。
4. 删除本地媒体文件。

## 后台统计接口

### `GET /api/admin/analytics?days=7`

返回后台统计数据。`days` 范围为 1 到 30，默认 7。

返回模块：

| 字段 | 说明 |
| --- | --- |
| `summary` | 指定时间范围总览 |
| `today` | 今日总览 |
| `daily` | 每日访问 |
| `popularPages` | 热门页面 |
| `api` | API 请求量、平均延迟、错误数 |
| `webVitals` | 前端性能指标 |
| `recentErrors` | 最近错误 |

## 本地测试

前端开发：

```bash
npm run dev
```

完整集成测试：

```powershell
npm run local:test:prepare
$env:ADMIN_TOKEN = (Get-Content .\Admin_TOKEN -Raw).Trim()
npm run local:test:backend
```

另开终端：

```bash
npm run local:test:proxy
```

访问：

```text
http://127.0.0.1:8080/
```
