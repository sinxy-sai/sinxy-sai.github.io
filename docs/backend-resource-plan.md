# 后端资源规划

本文档说明博客后端当前的资源边界、数据存储方式和后续演进方向。当前项目以 VPS 版本作为主线，Cloudflare Worker 版本保留为备选适配。

## 当前主线架构

```text
浏览器
  |
  v
Nginx
  |-- 静态资源 /、/_astro/、/assets/  -> /var/www/sinxy-blog
  |-- API /api/*                     -> Node.js 后端
  |-- 动态文章 /blog/:slug/          -> Node.js 后端
  |-- 动态标签 /tags/:tag/           -> Node.js 后端
  `-- 媒体资源 /media/*              -> Node.js 后端

Node.js 后端
  |-- SQLite: .data/blog.sqlite
  `-- 媒体文件: .data/media/
```

## 资源分类

| 资源 | 当前实现 | 说明 |
| --- | --- | --- |
| 文章元数据 | SQLite `posts` | 标题、描述、slug、状态、可见性、日期等 |
| Markdown 正文 | SQLite `posts.content_markdown` | 动态文章渲染时读取 |
| 标签 | SQLite `tags`、`post_tags` | 多对多关联 |
| 媒体文件 | 本地 `.data/media/` | 由 `/media/*` 对外提供访问 |
| 媒体元数据 | SQLite `assets` | 文件名、类型、大小、alt、访问 key |
| 访问统计 | SQLite `analytics_events` | 页面访问、Web Vitals、客户端错误、API 延迟 |
| 音乐列表 | 网易云音乐 + `.data/music-cache.json` | 通过 `@meting/core` 获取，缓存短期直链 |
| 评论 | Giscus / GitHub Discussions | 不写入本地数据库 |

## SQLite 数据表

数据库 schema 位于 [db/schema.sql](../db/schema.sql)。

核心表：

- `posts`：文章主体。
- `tags`：标签名称。
- `post_tags`：文章与标签的关联。
- `assets`：上传媒体元数据。
- `post_assets`：文章与媒体的关联。
- `analytics_events`：访问统计和性能事件。

后端启动时会自动创建 schema。生产数据应定期备份：

```bash
bash scripts/vps/backup.sh
```

## 媒体资源规则

上传文件会存放到：

```text
.data/media/uploads/YYYY/MM/{asset-id}-{safe-filename}
```

对外访问 URL 为：

```text
/media/uploads/YYYY/MM/{asset-id}-{safe-filename}
```

当前约束：

- 允许类型：JPEG、PNG、WebP、GIF。
- 单文件最大：5 MB。
- 文件名会被转成安全字符。
- 删除媒体时会同步删除数据库记录和本地文件。

## 后台权限

后台管理 API 使用单一 `ADMIN_TOKEN`：

```http
Authorization: Bearer <ADMIN_TOKEN>
```

该项目暂时不是多用户 CMS，不区分角色和用户。`ADMIN_TOKEN` 泄露等同于后台管理权限泄露，应立即轮换。

## Cloudflare 备选适配

仓库仍保留 Cloudflare Worker 适配代码和 `wrangler.jsonc`。早期规划是：

- D1 存储文章、标签和媒体元数据。
- R2 存储上传文件。
- Worker 处理 `/api/*`。

但当前主线已经迁到 VPS：

- SQLite 替代 D1。
- 本地 `.data/media/` 替代 R2。
- Node.js 后端替代 Worker 动态 API。
- GitHub Actions 负责自动部署到 VPS。

如果未来重新启用 Cloudflare 版本，应单独更新 Worker API、D1/R2 绑定和安全策略，不应直接假设它与 VPS 版本完全等价。

## 后续改进方向

- 增加后台 API 的速率限制。
- 给上传图片补充尺寸识别和缩略图生成。
- 给访问统计增加数据清理任务。
- 给音乐直链失效增加更细的观测日志。
- 如果后台需要多人使用，再引入用户、会话和权限模型。
