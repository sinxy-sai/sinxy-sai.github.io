# Security Policy

本文档说明本项目的安全边界、漏洞报告方式和密钥处理原则。

## 支持范围

当前主要维护 `main` 分支，并以 VPS 版本作为主线部署目标。Cloudflare Worker 适配代码仍保留，但不是当前生产主线。

| 范围 | 安全支持 |
| --- | --- |
| `main` 分支 | 支持 |
| VPS 部署脚本、Node.js 后端、Astro 前端 | 支持 |
| Cloudflare Worker 适配代码 | 尽力支持 |
| 历史提交、个人本地配置、第三方托管服务配置 | 不承诺支持 |

## 漏洞报告

请不要在公开 issue、评论区或社交平台直接披露漏洞细节。

推荐报告方式：

1. 优先使用 GitHub 的私有安全通告功能报告漏洞。
2. 如果仓库没有开启私有安全通告，请新建一个不包含漏洞细节的 issue，标题可写为 `Security contact request`，只说明需要私下沟通安全问题。

报告时建议包含：

- 受影响的页面、接口或部署路径。
- 复现步骤和影响范围。
- 是否需要登录后台或持有 `ADMIN_TOKEN`。
- 可能的修复建议。

收到报告后，会优先确认影响范围，再安排修复、验证和发布。

## 当前安全边界

本项目是个人博客系统，不提供多用户账号体系。后台管理权限主要依赖 `ADMIN_TOKEN`。

关键边界：

- 后台管理 API 必须携带 `Authorization: Bearer <ADMIN_TOKEN>`。
- `ADMIN_TOKEN` 应使用足够长的随机值，例如 `openssl rand -hex 32`。
- 生产数据位于 SQLite 数据库和媒体目录中，默认是 `.data/blog.sqlite` 与 `.data/media/`。
- GitHub Actions 通过 `VPS_SSH_KEY` 登录 VPS 自动部署。
- Giscus 评论数据由 GitHub Discussions 管理，相关公开配置不是密钥。

## 密钥与敏感文件

以下内容不得提交到 Git：

- `ADMIN_TOKEN`
- `.env`、本地环境文件和 VPS 环境文件
- SSH 私钥和部署密钥
- SQLite 数据库文件
- 媒体备份包和数据库备份包
- 包含真实服务器密码、Token、Cookie 的日志

本仓库已在 `.gitignore` 中忽略常见本地密钥和数据目录。如果密钥曾经被提交或推送到远端，应立即轮换密钥；仅删除文件或重新提交并不安全。

## 生产环境建议

- 使用 HTTPS 访问后台和 API。
- 定期轮换 `ADMIN_TOKEN` 和部署 SSH 密钥。
- GitHub Secrets 只保存部署所需的最小权限密钥。
- VPS 上的环境文件建议设置为 `chmod 600 ~/.sinxy-blog.env`。
- SSH 建议关闭密码登录，仅保留密钥登录；执行前应先确认密钥登录可用。
- 定期备份 `.data/blog.sqlite` 和 `.data/media/`。
- 定期运行依赖检查，例如 `npm audit`，并优先处理 high / critical 风险。

## 依赖与第三方服务

项目依赖 Node.js、Astro、SQLite、Nginx、Giscus、网易云音乐接口等组件。第三方服务自身的安全事件不由本项目控制，但会尽量减少敏感数据暴露：

- 不将后台令牌传给第三方评论或音乐服务。
- 不把 GitHub Actions 部署密钥写入代码或日志。
- 依赖升级应保留 `package-lock.json`，CI/部署优先使用 `npm ci`。

## 安全修复验证

涉及安全的修改至少应完成：

```bash
npx tsc --noEmit
npm run build
git diff --check
```

如果修改涉及后端 API、上传、后台鉴权或部署脚本，还应在本地或 VPS 测试对应路径，并确认未泄露 Token、堆栈信息或服务器内部路径。
