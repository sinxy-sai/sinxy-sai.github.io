# Sinxy Sai Blog

一个用于个人写作、知识记录和前端实验的博客项目。前台使用 Astro 构建静态页面，后台使用 Node.js + SQLite 提供文章、媒体、统计等动态能力，生产环境部署在 VPS，并通过 Nginx 反向代理对外服务。

![Astro](https://img.shields.io/badge/Astro-7.0-ff5d01?logo=astro&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178c6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-22-5fa04e?logo=nodedotjs&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-3-003b57?logo=sqlite&logoColor=white)
![Nginx](https://img.shields.io/badge/Nginx-Reverse%20Proxy-009639?logo=nginx&logoColor=white)
![GitHub Actions](https://img.shields.io/badge/GitHub%20Actions-CI%2FCD-2088ff?logo=githubactions&logoColor=white)
![Cloudflare](https://img.shields.io/badge/Cloudflare-Worker%20Ready-f38020?logo=cloudflare&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue)

## 项目特点

- 个人博客前台：包含首页、文章、归档、标签、关于等基础页面。
- 后台管理系统：支持文章创建、编辑、发布设置、标签管理、Markdown 预览和媒体资源管理。
- Markdown 增强：支持 GFM 表格、数学公式、代码块、图片、链接、删除线等内容。
- 媒体管理：支持图片上传、媒体列表、复制可访问 URL，并可用于文章封面和正文插图。
- 评论系统：文章页接入 Giscus，评论数据由 GitHub Discussions 管理。
- 音乐播放器：支持网易云歌单或歌曲 ID，包含首页卡片播放器和右下角悬浮播放器。
- 访问统计：后台可查看访客流量、页面访问、接口延迟和 Web Vitals 等基础性能数据。
- 阅读体验：文章页包含桌面端 sticky 目录，移动端可折叠目录侧栏。
- 交互组件：包含桌宠、Tab 圆盘导航、主题切换、搜索、时间组件等增强体验。
- VPS 主线部署：Node 后端 + SQLite 数据库 + Nginx 反代 + GitHub Actions 自动部署。

## 技术栈

| 分类 | 技术 |
| --- | --- |
| 前端框架 | Astro 7 |
| 开发语言 | TypeScript |
| UI 与图标 | Astro Components, CSS, lucide-astro |
| Markdown | remark-gfm, remark-math, rehype-katex, KaTeX |
| 动效与视觉 | Three.js, Canvas, CSS Motion |
| 后端运行时 | Node.js 22, tsx |
| 数据库 | SQLite, better-sqlite3 |
| Web 服务 | Nginx reverse proxy |
| 评论 | Giscus / GitHub Discussions |
| 音乐 | @meting/core / NetEase Cloud Music |
| 部署 | VPS, systemd, GitHub Actions |
| 备用架构 | Cloudflare Worker |

## 功能模块

### 博客前台

| 页面 | 路径 | 说明 |
| --- | --- | --- |
| 首页 | `/` | Profile、时间组件、最新文章、音乐播放器等入口 |
| 文章 | `/blog/:slug/` | 文章正文、目录、标签、评论、上一篇/下一篇 |
| 归档 | `/archive/` | 按时间聚合文章 |
| 标签 | `/tags/` | 标签列表与标签文章页入口 |
| 关于 | `/about/` | 个人介绍页面 |
| RSS | `/rss.xml` | 文章订阅 |

### 后台管理

| 模块 | 说明 |
| --- | --- |
| Token 登录 | 进入管理系统前需要填写正确的 `ADMIN_TOKEN` |
| 文章编辑 | Markdown 编辑、实时预览、文章目录、发布状态 |
| 发布设置 | 文章类型、创作声明、可见范围、封面设置 |
| 媒体资源 | 图片上传、资源列表、URL 复制 |
| 统计面板 | 流量、访问路径、接口延迟、Web Vitals |

### 动态 API

| 接口 | 说明 |
| --- | --- |
| `GET /api/health` | 后端健康检查 |
| `GET /api/posts` | 获取公开文章列表 |
| `GET /api/music` | 获取音乐清单 |
| `POST /api/analytics/event` | 上报访问与性能事件 |
| `/api/admin/*` | 后台文章、媒体、统计等管理接口，需要 `ADMIN_TOKEN` |

## 项目结构

```text
.
├── db/
│   └── schema.sql                 # SQLite 数据库结构
├── docs/
│   ├── backend-resource-plan.md    # 后端资源规划
│   └── vps-backend.md              # VPS 部署与迁移说明
├── public/
│   ├── pet-clean/                  # 桌宠资源
│   └── ...                         # 静态资源
├── scripts/
│   └── vps/
│       ├── bootstrap.sh            # 新 VPS 初始化脚本
│       ├── backup.sh               # 数据备份脚本
│       └── restore.sh              # 数据恢复脚本
├── server/
│   ├── index.ts                    # Node + SQLite 后端入口
│   └── import-posts.ts             # 文章导入脚本
├── src/
│   ├── components/                 # 页面组件、音乐、桌宠、评论、导航等
│   ├── layouts/
│   │   └── BaseLayout.astro         # 全站布局、主题、搜索、统计脚本
│   ├── pages/                      # Astro 页面
│   ├── worker/                     # Cloudflare Worker 版本后端
│   └── lib/                        # 公共数据与工具
├── .github/
│   └── workflows/
│       ├── deploy-vps.yml          # VPS 自动部署
│       └── static.yml              # 静态构建流程
├── astro.config.mjs
├── package.json
└── wrangler.jsonc
```

## 本地开发

安装依赖：

```bash
npm ci
```

启动 Astro 前端：

```bash
npm run dev
```

启动 Node 后端：

```bash
ADMIN_TOKEN="replace-with-a-long-random-token" npm run server:start
```

### 真实文章页集成测试

`npm run dev` 适合快速查看 Astro 静态页面。真实文章页、后台 API、媒体资源和沉浸阅读需要 Node 后端与 Nginx 同时工作；仓库提供了本地 Docker Nginx 配置，要求本机已启动 Docker Desktop。

终端一：构建页面并启动本地后端。Windows PowerShell 可以直接从被忽略的 `Admin_TOKEN` 文件读取 Token：

```powershell
npm run local:test:prepare
$env:ADMIN_TOKEN = (Get-Content .\Admin_TOKEN -Raw).Trim()
npm run local:test:backend
```

终端二：启动本地 Nginx 代理：

```powershell
npm run local:test:proxy
```

访问 `http://127.0.0.1:8080/`。真实文章通过 `http://127.0.0.1:8080/blog/<slug>/` 打开；可先访问 `http://127.0.0.1:8080/api/posts` 查看本地文章的 `slug`。完成后按 `Ctrl+C` 停止后端，再运行：

```powershell
npm run local:test:stop
```

常用检查：

```bash
npx tsc --noEmit
npm run build
```

## 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `ADMIN_TOKEN` | 是 | 后台管理接口访问令牌 |
| `PORT` | 否 | Node 后端端口，默认 `8787` |
| `MUSIC_PLAYLIST_ID` | 否 | 网易云歌单 ID |
| `MUSIC_IDS` | 否 | 逗号分隔的网易云歌曲 ID |
| `PUBLIC_GISCUS_REPO` | 否 | Giscus 仓库，例如 `owner/repo` |
| `PUBLIC_GISCUS_REPO_ID` | 否 | Giscus 仓库 ID |
| `PUBLIC_GISCUS_CATEGORY` | 否 | Giscus Discussions 分类 |
| `PUBLIC_GISCUS_CATEGORY_ID` | 否 | Giscus 分类 ID |

生产环境建议写入 VPS 的 `~/.sinxy-blog.env`，并设置权限：

```bash
chmod 600 ~/.sinxy-blog.env
```

## VPS 部署

当前主线部署方式是：

```text
GitHub Actions -> VPS git pull/reset -> npm ci -> npm run build
              -> copy dist to /var/www/sinxy-blog
              -> systemctl restart sinxy-blog
              -> Nginx serves static files and proxies dynamic routes
```

新服务器可以使用脚本初始化：

```bash
git clone https://github.com/sinxy-sai/sinxy-sai.github.io.git
cd sinxy-sai.github.io
sudo ADMIN_TOKEN="$(openssl rand -hex 32)" APP_HOST="your-domain-or-ip" bash scripts/vps/bootstrap.sh
```

更多部署、备份、恢复和迁移说明见：

- [`docs/vps-backend.md`](docs/vps-backend.md)
- [`docs/backend-resource-plan.md`](docs/backend-resource-plan.md)

## 数据与备份

生产数据主要位于：

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

## 安全注意事项

- 不要提交 `ADMIN_TOKEN`、SSH 私钥、`.env`、数据库文件和媒体备份。
- GitHub Actions 的 VPS 登录私钥应只放在 GitHub Secrets。
- 生产环境建议关闭密码 SSH 登录，仅保留密钥登录。
- 后台管理接口必须带 `Authorization: Bearer <ADMIN_TOKEN>`。
- SQLite 数据库和上传媒体需要定期备份。

## 开发命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动 Astro 开发服务器 |
| `npm run build` | 构建静态前端 |
| `npm run preview` | 预览构建结果 |
| `npm run server:dev` | 以 watch 模式启动 Node 后端 |
| `npm run server:start` | 启动 Node 后端 |
| `npm run server:import-posts` | 从 JSON 导入文章 |
| `npm run local:test:prepare` | 构建本地集成测试所需的静态文件 |
| `npm run local:test:backend` | 启动本地集成测试后端，需先设置 `ADMIN_TOKEN` |
| `npm run local:test:proxy` | 使用 Docker Nginx 启动本地代理，默认端口 `8080` |
| `npm run local:test:stop` | 关闭本地 Nginx 代理 |
| `npm run deploy:worker` | 构建并部署 Cloudflare Worker |

## License

代码采用 MIT License。博客文章、图片、笔记和其他原创内容除非单独声明，否则不授权复用。
