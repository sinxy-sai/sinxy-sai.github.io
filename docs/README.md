# 文档索引

这里收集项目的运行、部署、接口和组件说明。所有 `docs/` 文档应使用中文维护。

## 推荐阅读顺序

1. [后端资源规划](backend-resource-plan.md)：了解当前 VPS 主线架构、数据库、媒体和统计资源。
2. [VPS 后端部署与迁移](vps-backend.md)：部署、systemd、Nginx、备份和迁移。
3. [API 文档](api.md)：公开 API、后台 API、响应格式和鉴权方式。
4. [音乐系统](music-system.md)：网易云音乐配置、后端缓存、前端播放器和故障排查。
5. [前端组件说明](frontend-components.md)：主题背景、音乐播放器、桌宠、评论、圆盘导航等组件的职责。

## 文档维护约定

- 文档以当前 `main` 分支行为为准。
- VPS 版本是主线，Cloudflare Worker 版本只作为备选适配说明。
- 涉及密钥时只写变量名，不写真实值。
- 涉及命令时优先给 PowerShell 和 Bash 都能理解的写法；确实是 Windows 专属时标明 PowerShell。
- 修改接口、部署脚本、音乐系统、后台鉴权、数据表结构后，应同步更新对应文档。

## 相关仓库文件

| 文件 | 说明 |
| --- | --- |
| [../README.md](../README.md) | 项目总览 |
| [../SECURITY.md](../SECURITY.md) | 安全策略 |
| [../db/schema.sql](../db/schema.sql) | SQLite schema |
| [../server/index.ts](../server/index.ts) | VPS Node.js 后端 |
| [../src/components/FloatingMusicPlayer.astro](../src/components/FloatingMusicPlayer.astro) | 悬浮音乐播放器 |
| [../scripts/vps/bootstrap.sh](../scripts/vps/bootstrap.sh) | 新 VPS 初始化 |
| [../.github/workflows/deploy-vps.yml](../.github/workflows/deploy-vps.yml) | VPS 自动部署 |
