# VPS 后端部署与迁移

本文档说明如何在 VPS 上运行博客后端、配置 Nginx、管理 systemd 服务，以及如何备份和迁移数据。

当前 VPS 版本是项目主线。Cloudflare Worker 版本仍保留，但不再作为主要部署方式。

## 本地启动后端

```bash
npm run build
ADMIN_TOKEN="replace-with-a-long-random-token" npm run server:start
```

默认路径：

- SQLite 数据库：`.data/blog.sqlite`
- 上传媒体：`.data/media/`
- 静态构建产物：`dist/`
- 动态模板：`dist/dynamic-template/*`

后端启动时会自动读取 [db/schema.sql](../db/schema.sql) 并创建缺失的数据表。

## VPS 环境变量

生产环境建议保存到：

```text
/home/ubuntu/.sinxy-blog.env
```

并设置权限：

```bash
chmod 600 ~/.sinxy-blog.env
```

常用变量：

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `ADMIN_TOKEN` | 是 | 后台管理 API 令牌 |
| `PORT` | 否 | Node 后端端口，默认 `8787` |
| `BLOG_DATA_DIR` | 否 | 数据目录，默认 `.data` |
| `BLOG_DB_PATH` | 否 | SQLite 文件路径 |
| `BLOG_MEDIA_DIR` | 否 | 媒体文件目录 |
| `BLOG_DIST_DIR` | 否 | 静态构建目录，默认 `dist` |
| `MUSIC_PLAYLIST_ID` | 否 | 网易云歌单 ID |
| `MUSIC_IDS` | 否 | 逗号分隔的网易云歌曲 ID |
| `PUBLIC_GISCUS_REPO` | 否 | Giscus 仓库 |
| `PUBLIC_GISCUS_REPO_ID` | 否 | Giscus 仓库 ID |
| `PUBLIC_GISCUS_CATEGORY` | 否 | Giscus 分类 |
| `PUBLIC_GISCUS_CATEGORY_ID` | 否 | Giscus 分类 ID |

生成后台令牌：

```bash
openssl rand -hex 32
```

## 音乐配置

使用网易云歌单：

```bash
cat >> ~/.sinxy-blog.env <<'EOF'
MUSIC_PLAYLIST_ID='replace-with-netease-playlist-id'
MUSIC_IDS=''
EOF
chmod 600 ~/.sinxy-blog.env
sudo systemctl restart sinxy-blog
curl http://127.0.0.1:8787/api/music
```

如果不用歌单，也可以指定歌曲 ID：

```text
MUSIC_IDS='1901371647,1824045033'
```

音乐系统详情见 [music-system.md](music-system.md)。

## Giscus 评论配置

文章页评论使用 Giscus。评论数据保存在 GitHub Discussions，不进入本地 SQLite。

准备步骤：

1. 在用于评论的 GitHub 仓库开启 Discussions。
2. 为该仓库启用 Giscus GitHub App。
3. 打开 `https://giscus.app/` 生成配置。
4. 将下面变量写入 `~/.sinxy-blog.env`：

```bash
cat >> ~/.sinxy-blog.env <<'EOF'
PUBLIC_GISCUS_REPO='owner/repo'
PUBLIC_GISCUS_REPO_ID='replace-with-repo-id'
PUBLIC_GISCUS_CATEGORY='Announcements'
PUBLIC_GISCUS_CATEGORY_ID='replace-with-category-id'
EOF
chmod 600 ~/.sinxy-blog.env
```

Giscus 配置会在构建前注入静态页面，所以修改后需要重新构建并部署静态文件。

## Nginx 反向代理

生产结构：

```text
Nginx
  |-- /、/_astro/        -> /var/www/sinxy-blog
  |-- /api/              -> http://127.0.0.1:8787
  |-- /blog/             -> http://127.0.0.1:8787
  |-- /tags/:tag         -> http://127.0.0.1:8787
  `-- /media/            -> http://127.0.0.1:8787
```

示例配置：

```nginx
server {
    listen 80;
    server_name 114.132.48.242;

    root /var/www/sinxy-blog;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:8787;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /blog/ {
        proxy_pass http://127.0.0.1:8787;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location ~ ^/tags/[^/]+/?$ {
        proxy_pass http://127.0.0.1:8787;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /media/ {
        proxy_pass http://127.0.0.1:8787;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ =404;
    }
}
```

检查并重载：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## systemd 服务

不要长期在 SSH 终端里直接运行后端。生产环境使用 systemd：

```bash
sudo tee /etc/systemd/system/sinxy-blog.service > /dev/null <<'EOF'
[Unit]
Description=Sinxy Sai Blog Node backend
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/sinxy-sai.github.io
Environment=NODE_ENV=production
Environment=PORT=8787
EnvironmentFile=-/home/ubuntu/.sinxy-blog.env
ExecStart=/usr/bin/npm run server:start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

启用服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now sinxy-blog
sudo systemctl status sinxy-blog --no-pager
```

查看日志：

```bash
journalctl -u sinxy-blog -n 100 --no-pager
```

重启服务：

```bash
sudo systemctl restart sinxy-blog
```

## 手动部署

```bash
cd ~/sinxy-sai.github.io
git pull
npm ci
npm run build
rm -rf /var/www/sinxy-blog/*
cp -r dist/* /var/www/sinxy-blog/
sudo find /var/www/sinxy-blog -type d -exec chmod 755 {} \;
sudo find /var/www/sinxy-blog -type f -exec chmod 644 {} \;
sudo systemctl restart sinxy-blog
```

## GitHub Actions 自动部署

自动部署工作流位于：

```text
.github/workflows/deploy-vps.yml
```

推送到 `main` 后会：

1. SSH 登录 VPS。
2. 在 VPS 上拉取最新代码。
3. 执行 `npm ci`。
4. 执行 `npm run build`。
5. 同步 `dist/` 到 `/var/www/sinxy-blog`。
6. 重启 `sinxy-blog` systemd 服务。

需要配置 GitHub Secrets：

| Secret | 说明 |
| --- | --- |
| `VPS_HOST` | VPS IP 或域名 |
| `VPS_USER` | 部署用户，例如 `ubuntu` |
| `VPS_SSH_KEY` | 自动部署使用的 SSH 私钥 |

生成部署密钥：

```bash
ssh-keygen -t ed25519 -C "github-actions-sinxy-blog" -f ./sinxy_blog_deploy_key
```

把公钥加入 VPS：

```bash
cat ./sinxy_blog_deploy_key.pub | ssh ubuntu@114.132.48.242 'mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys'
```

私钥内容写入 GitHub Secret：`VPS_SSH_KEY`。

## 新 VPS 初始化

脚本位于：

```text
scripts/vps/bootstrap.sh
```

示例：

```bash
sudo ADMIN_TOKEN="$(openssl rand -hex 32)" APP_HOST="114.132.48.242" bash scripts/vps/bootstrap.sh
```

脚本会安装基础依赖、配置 Nginx、创建 systemd 服务并准备数据目录。真实迁移前建议先读一遍脚本内容。

## 数据备份

备份脚本：

```bash
bash scripts/vps/backup.sh
```

备份内容：

- `.data/blog.sqlite`
- `.data/media/`

备份文件默认生成在当前用户目录，名称类似：

```text
sinxy-blog-data-YYYYMMDDTHHMMSSZ.tar.gz
```

## 数据恢复

```bash
bash scripts/vps/restore.sh ~/sinxy-blog-data-YYYYMMDDTHHMMSSZ.tar.gz
sudo systemctl restart sinxy-blog
```

恢复前建议先停止服务：

```bash
sudo systemctl stop sinxy-blog
```

## 迁移服务器流程

1. 在旧 VPS 执行备份。
2. 复制备份文件到新 VPS。
3. 在新 VPS clone 仓库。
4. 运行 `scripts/vps/bootstrap.sh`。
5. 恢复备份。
6. 配置 `~/.sinxy-blog.env`。
7. 更新 GitHub Secrets 中的 `VPS_HOST` 和 `VPS_SSH_KEY`。
8. 推送一次 `main`，确认自动部署成功。

## 常见排查

检查后端：

```bash
curl http://127.0.0.1:8787/api/health
```

检查 Nginx 到后端代理：

```bash
curl http://127.0.0.1/api/health
```

检查外网：

```bash
curl http://114.132.48.242/api/health
```

查看端口占用：

```bash
sudo ss -lntp | grep 8787
```

如果音乐播放 403，通常是网易云临时直链过期。可以访问：

```bash
curl "http://127.0.0.1:8787/api/music?refresh=1"
```

确认后端能重新获取直链。
