# Sinxy Sai Blog

一个面向个人写作、技术笔记与前端实验的全栈博客。前台由 Astro 构建，生产环境以 Node.js + SQLite 提供文章、媒体、统计和动态渲染能力，并部署在 VPS 上，由 Nginx 对外提供静态资源与反向代理。

![Astro](https://img.shields.io/badge/Astro-7.0-ff5d01?logo=astro&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178c6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-22-5fa04e?logo=nodedotjs&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-3-003b57?logo=sqlite&logoColor=white)
![Nginx](https://img.shields.io/badge/Nginx-Reverse%20Proxy-009639?logo=nginx&logoColor=white)
![GitHub Actions](https://img.shields.io/badge/GitHub%20Actions-CI%2FCD-2088ff?logo=githubactions&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue)

## 项目特性

- **完整博客前台**：首页、文章、归档、标签、关于、RSS 与站内搜索。
- **沉浸式阅读**：文章页提供沉浸阅读开关；桌面端目录为固定侧栏，移动端目录可折叠。
- **增强 Markdown**：支持 GFM 表格、任务列表、删除线、链接、图片、数学公式和代码块。
- **服务端代码高亮**：使用 Shiki 在后端渲染代码，支持浅色/深色主题、语言标签与复制按钮。
- **文章编辑器**：提供标题、列表、引用、链接、图片、表格、公式和代码块等编辑工具；支持 Markdown、对照与预览模式。
- **发布控制**：文章可设置原创/转载/翻译、创作声明、公开或仅自己可见、封面和标签。
- **媒体资源管理**：图片上传、资源列表、复制可直接访问的完整 URL，并可用作封面或正文插图。
- **互动体验**：主题切换、Tab 圆盘导航、桌宠、首页时间组件、欢迎区 Canvas 动效。
- **Galaxy 背景**：基于 OGL 的 WebGL 星光背景，日间为雾蓝色、夜间为银白色，并支持鼠标交互与减少动态效果偏好。
- **音乐播放**：从网易云歌单或歌曲 ID 获取播放列表；提供首页卡片播放器和跨路由持续播放的悬浮播放器。
- **评论系统**：文章页接入 Giscus，评论由 GitHub Discussions 保存和管理。
- **统计面板**：后台可查看访问量、热门页面、接口延迟、Web Vitals 与最近错误。
- **VPS 主线部署**：Node.js + SQLite + Nginx + systemd，GitHub Actions 在推送到 `main` 后自动部署。

## 技术栈

| 分类 | 技术 |
| --- | --- |
| 前端框架 | Astro 7、TypeScript、Astro Components |
| 图标与界面 | lucide-astro、原生 CSS、响应式布局 |
| Markdown | remark-gfm、remark-math、rehype-katex、KaTeX |
| 代码高亮 | Shiki（服务端渲染，GitHub Light / GitHub Dark） |
| 视觉动效 | OGL、Three.js、Canvas、CSS Motion |
| 后端运行时 | Node.js 22、tsx |
| 数据库 | SQLite、better-sqlite3 |
| 音乐 | @meting/core、网易云音乐 |
| 评论 | Giscus、GitHub Discussions |
| Web 服务 | Nginx 反向代理 |
| 部署 | VPS、systemd、GitHub Actions |
| 备选适配 | Cloudflare Worker |

## 页面与模块

| 页面/模块 | 路径 | 说明 |
| --- | --- | --- |
| 首页 | `/` | 欢迎区、个人资料、时间、音乐、最新文章与桌宠 |
| 文章 | `/blog/:slug/` | Markdown 正文、目录、沉浸阅读、代码复制、Giscus 评论、上一篇/下一篇 |
| 归档 | `/archive/` | 按时间聚合文章 |
| 标签 | `/tags/`、`/tags/:tag/` | 标签列表与对应文章 |
| 关于 | `/about/` | 个人介绍 |
| 后台 | `/admin/` | Token 验证、文章编辑、媒体资源、统计面板 |
| RSS | `/rss.xml` | 文章订阅 |

## Markdown 与代码块

文章正文和后台编辑器均支持 GFM 与数学公式：

- 表格、任务列表、删除线、自动链接与普通 Markdown 语法。
- 行内公式 `$E = mc^2$` 与块级公式 `$$...$$`，由 KaTeX 渲染。
- 后台工具栏可以插入表格（行、列、标题）、公式、链接、图片和代码块。
- 动态文章由服务端 Shiki 高亮；支持 `javascript`、`typescript`、`html`、`css`、`bash`、`python`、`c`、`cpp`、`java`、`csharp`、`go`、`rust`、`php`、`kotlin`、`swift`、`sql`、`json`、`yaml`、`markdown`。
- 代码块会显示语言标识，并提供复制按钮；浅色和深色主题均有独立配色。

## 项目结构

```text
.
├── db/
│   └── schema.sql                 # SQLite 数据表定义
├── docs/
│   ├── backend-resource-plan.md   # 后端资源规划
│   └── vps-backend.md             # VPS 部署、备份与迁移说明
├── nginx/
│   └── local.conf                 # 本地 Docker Nginx 代理配置
├── public/
│   ├── pet-clean/                 # 桌宠静态资源
│   └── ...
├── scripts/
│   ├── optimize-pet-assets.mjs    # 桌宠资源优化
│   └── vps/
│       ├── bootstrap.sh           # 新 VPS 初始化
│       ├── backup.sh              # 数据备份
│       └── restore.sh             # 数据恢复
├── server/
│   ├── index.ts                   # Node.js + SQLite API 与动态文章渲染
│   └── import-posts.ts            # 文章导入脚本
├── src/
│   ├── components/                # Galaxy、音乐、桌宠、评论、圆盘导航等组件
│   ├── layouts/BaseLayout.astro   # 全站布局、主题、阅读与统计脚本
│   ├── pages/                     # Astro 页面
│   └── worker/                    # Cloudflare Worker 适配实现
├── .github/workflows/
│   ├── deploy-vps.yml             # VPS 自动部署
│   └── static.yml                 # 静态构建流程
├── docker-compose.local.yml       # 本地完整集成测试代理
├── astro.config.mjs
└── package.json
```

## 本地开发

### 前置条件

- Node.js 22 或更高版本
- npm
- Docker Desktop（仅完整集成测试需要）

安装依赖：

```bash
npm ci
```

只查看 Astro 前端页面：

```bash
npm run dev
```

打开终端输出的本地地址，通常是 `http://127.0.0.1:4321/`。

### 完整集成测试

`npm run dev` 适合调整静态页面和组件。要测试真实文章、后台 API、媒体上传、动态代码高亮、沉浸阅读和同源路由，需要同时启动 Node 后端与 Nginx 代理。

终端一：构建并启动后端。Windows PowerShell 可从本地、被 Git 忽略的 `Admin_TOKEN` 文件读取令牌：

```powershell
npm run local:test:prepare
$env:ADMIN_TOKEN = (Get-Content .\Admin_TOKEN -Raw).Trim()
npm run local:test:backend
```

终端二：启动本地 Nginx 代理：

```bash
npm run local:test:proxy
```

访问 `http://127.0.0.1:8080/`。可先访问 `http://127.0.0.1:8080/api/posts` 查看文章列表，再通过 `/blog/<slug>/` 测试文章页。

测试结束后，停止后端进程，并关闭本地代理：

```bash
npm run local:test:stop
```

### 质量检查

```bash
npx tsc --noEmit
npm run build
```

## 环境变量

生产环境建议将变量保存在 VPS 的 `~/.sinxy-blog.env`，并设置仅当前用户可读：

```bash
chmod 600 ~/.sinxy-blog.env
```

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `ADMIN_TOKEN` | 是 | 后台管理 API 的访问令牌，使用足够长的随机值 |
| `PORT` | 否 | Node 后端端口，默认 `8787` |
| `BLOG_DATA_DIR` | 否 | `.data` 数据目录位置 |
| `BLOG_DB_PATH` | 否 | SQLite 数据库路径 |
| `BLOG_MEDIA_DIR` | 否 | 上传媒体目录路径 |
| `BLOG_DIST_DIR` | 否 | Astro 构建产物目录，默认 `dist` |
| `MUSIC_PLAYLIST_ID` | 否 | 网易云歌单 ID |
| `MUSIC_IDS` | 否 | 逗号分隔的网易云歌曲 ID；未设置歌单时使用 |
| `PUBLIC_GISCUS_REPO` | 否 | Giscus 仓库，例如 `owner/repo` |
| `PUBLIC_GISCUS_REPO_ID` | 否 | Giscus 仓库 ID |
| `PUBLIC_GISCUS_CATEGORY` | 否 | GitHub Discussions 分类名称 |
| `PUBLIC_GISCUS_CATEGORY_ID` | 否 | Giscus 分类 ID |

生成后台令牌：

```bash
openssl rand -hex 32
```

不要提交 `ADMIN_TOKEN`、`.env`、SSH 私钥、数据库文件或备份文件。

## VPS 部署

生产架构：

```text
浏览器
  │
  ▼
Nginx
  ├── /、/_astro/        → /var/www/sinxy-blog 的静态文件
  ├── /api/、/media/     → Node.js 服务（端口 8787）
  └── /blog/、/tags/:tag → Node.js 动态渲染
                              │
                              ├── SQLite: .data/blog.sqlite
                              └── 媒体: .data/media/
```

推送到 `main` 后，GitHub Actions 会在 VPS 上执行依赖安装、构建、同步静态产物，并重启 `sinxy-blog` systemd 服务。工作流依赖以下 GitHub Secrets：

| Secret | 说明 |
| --- | --- |
| `VPS_HOST` | VPS IP 或域名 |
| `VPS_USER` | 部署用户，例如 `ubuntu` |
| `VPS_SSH_KEY` | 仅用于自动部署的 SSH 私钥 |

新服务器初始化、Nginx 配置、systemd 服务、数据迁移、备份与恢复，请参阅：

- [VPS 后端部署与迁移](docs/vps-backend.md)
- [后端资源规划](docs/backend-resource-plan.md)

## 数据备份与迁移

生产数据位于：

```text
.data/blog.sqlite
.data/media/
```

备份：

```bash
bash scripts/vps/backup.sh
```

恢复：

```bash
bash scripts/vps/restore.sh ~/sinxy-blog-data-YYYYMMDDTHHMMSSZ.tar.gz
```

迁移服务器时，先完成数据库与媒体备份，在新 VPS 运行 `scripts/vps/bootstrap.sh`，恢复备份后再设置环境变量和 GitHub Actions Secrets。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动 Astro 前端开发服务 |
| `npm run build` | 构建静态前端产物 |
| `npm run preview` | 预览构建产物 |
| `npm run server:dev` | 以 watch 模式启动 Node 后端 |
| `npm run server:start` | 启动 Node 后端 |
| `npm run server:import-posts` | 从 JSON 导入文章 |
| `npm run local:test:prepare` | 构建完整本地测试需要的静态文件 |
| `npm run local:test:backend` | 启动完整本地测试后端，需要 `ADMIN_TOKEN` |
| `npm run local:test:proxy` | 使用 Docker Nginx 启动本地反向代理，默认端口 `8080` |
| `npm run local:test:stop` | 停止本地 Nginx 代理 |
| `npm run assets:pet` | 优化桌宠图片资源 |
| `npm run deploy:worker` | 构建并部署 Cloudflare Worker 适配版本 |

## 安全说明

- 后台接口必须携带 `Authorization: Bearer <ADMIN_TOKEN>`。
- `ADMIN_TOKEN` 和部署 SSH 私钥只能保存在本地安全位置、VPS 环境文件或 GitHub Secrets 中。
- 生产环境应定期备份 SQLite 数据库和上传媒体。
- SSH 建议关闭密码登录，仅保留权限受限的密钥登录；执行前应先在新的终端确认密钥能够登录。
- Giscus 配置值可公开，但 GitHub 仓库权限和 Discussions 设置应按实际需要配置。

## License

代码采用 [MIT License](LICENSE)。博客文章、图片、笔记和其他原创内容除非单独声明，否则不授权复用。
