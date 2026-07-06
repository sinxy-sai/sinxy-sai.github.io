# VPS backend notes

This project still keeps the Cloudflare Worker backend. The VPS backend is a
separate Node.js + SQLite entry point for learning server operations and for
running dynamic blog APIs behind Nginx.

## Local commands

```bash
npm run build
ADMIN_TOKEN="replace-with-a-long-random-token" npm run server:start
```

Default paths:

- SQLite database: `.data/blog.sqlite`
- Local media files: `.data/media`
- Static template source: `dist/dynamic-template/*`

The server auto-creates the SQLite schema from `db/schema.sql`.

Admin APIs require `ADMIN_TOKEN`. The `/admin/` page must use the same token in
its token field before it can create posts or upload media.

## Music player

The site includes a floating NetEase Cloud Music player. It is hidden by
default. Configure either a playlist ID or comma-separated song IDs on the VPS:

```bash
cat >> ~/.sinxy-blog.env <<'EOF'
MUSIC_PLAYLIST_ID='replace-with-netease-playlist-id'
MUSIC_IDS=''
EOF
chmod 600 ~/.sinxy-blog.env
```

Use `MUSIC_PLAYLIST_ID` for a full playlist. If it is empty, use `MUSIC_IDS`
for selected songs:

```text
MUSIC_IDS='1901371647,1824045033'
```

Restart the backend after changing the file:

```bash
sudo systemctl restart sinxy-blog
curl http://127.0.0.1:8787/api/music
```

The backend reads NetEase music metadata through `@meting/core`, caches results
in memory for 10 minutes, and returns only the fields needed by the frontend
player. Actual playback depends on whether NetEase returns a usable audio URL
for the selected songs.

## Giscus comments

Article pages can use Giscus for comments. Giscus stores comments in GitHub
Discussions, so visitors must sign in with GitHub before commenting. Moderation
also happens in GitHub Discussions instead of this blog's `/admin/` page.

First prepare GitHub:

1. Enable Discussions for the repository that will store comments.
2. Install or enable the Giscus GitHub App for that repository.
3. Open `https://giscus.app/`, choose the repository and discussion category,
   then copy these values from the generated config:

```text
PUBLIC_GISCUS_REPO=owner/repo
PUBLIC_GISCUS_REPO_ID=...
PUBLIC_GISCUS_CATEGORY=...
PUBLIC_GISCUS_CATEGORY_ID=...
```

On the VPS, save them once:

```bash
cat > ~/.sinxy-blog.env <<'EOF'
PUBLIC_GISCUS_REPO='owner/repo'
PUBLIC_GISCUS_REPO_ID='replace-with-repo-id'
PUBLIC_GISCUS_CATEGORY='Announcements'
PUBLIC_GISCUS_CATEGORY_ID='replace-with-category-id'
EOF
chmod 600 ~/.sinxy-blog.env
```

Then rebuild and redeploy the static files:

```bash
cd ~/sinxy-sai.github.io
set -a
. ~/.sinxy-blog.env
set +a
npm run build
rm -rf /var/www/sinxy-blog/*
cp -r dist/* /var/www/sinxy-blog/
sudo systemctl restart sinxy-blog
```

The GitHub Actions VPS deployment workflow also reads `~/.sinxy-blog.env`
before building on the VPS, so future pushes will keep the Giscus config.

## Import posts

Export or save posts as JSON, then import:

```bash
npm run server:import-posts -- posts.json
```

Accepted input shapes:

```json
[{ "slug": "hello", "title": "Hello", "description": "...", "contentMarkdown": "..." }]
```

or:

```json
{ "data": [{ "slug": "hello", "title": "Hello", "description": "...", "contentMarkdown": "..." }] }
```

The importer writes `posts`, `tags`, and `post_tags`. Media files are not copied
by this command.

## Nginx reverse proxy

Keep static files under `/var/www/sinxy-blog`, then proxy dynamic routes to the
Node backend:

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

Reload Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## systemd service

For a real VPS, do not keep the backend in an SSH terminal. Create a systemd
service:

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
Environment=ADMIN_TOKEN=replace-with-a-long-random-token
EnvironmentFile=-/home/ubuntu/.sinxy-blog.env
ExecStart=/usr/bin/npm run server:start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

Then enable it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now sinxy-blog
sudo systemctl status sinxy-blog --no-pager
```

After changing code:

```bash
git pull
npm ci
npm run build
rm -rf /var/www/sinxy-blog/*
cp -r dist/* /var/www/sinxy-blog/
sudo find /var/www/sinxy-blog -type d -exec chmod 755 {} \;
sudo find /var/www/sinxy-blog -type f -exec chmod 644 {} \;
sudo systemctl restart sinxy-blog
```

## GitHub Actions deployment

The VPS deployment workflow is `.github/workflows/deploy-vps.yml`. It runs on
pushes to `main`.

Create a deploy key on your local machine:

```bash
ssh-keygen -t ed25519 -C "github-actions-sinxy-blog" -f ./sinxy_blog_deploy_key
```

Add the public key to the VPS:

```bash
cat ./sinxy_blog_deploy_key.pub | ssh ubuntu@114.132.48.242 'mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys'
```

Add these GitHub repository secrets:

```text
VPS_HOST=114.132.48.242
VPS_USER=ubuntu
VPS_SSH_KEY=<contents of sinxy_blog_deploy_key>
```

Make sure the deploy user can update the static directory and restart the
service non-interactively:

```bash
sudo chown -R ubuntu:ubuntu /var/www/sinxy-blog
sudo -n systemctl status sinxy-blog --no-pager
```

If `sudo -n` asks for a password or fails, add a limited sudoers rule:

```bash
sudo tee /etc/sudoers.d/sinxy-blog-deploy > /dev/null <<'EOF'
ubuntu ALL=(root) NOPASSWD: /usr/bin/systemctl restart sinxy-blog, /usr/bin/systemctl status sinxy-blog --no-pager
EOF
sudo chmod 440 /etc/sudoers.d/sinxy-blog-deploy
```

After the secrets are configured, each push to `main` will:

1. install dependencies in GitHub Actions,
2. run `npm run build`,
3. SSH into the VPS,
4. reset the VPS checkout to `origin/main`,
5. install dependencies and build on the VPS,
6. copy `dist` into `/var/www/sinxy-blog`,
7. restart `sinxy-blog`.

## New server bootstrap

For a fresh Ubuntu VPS, clone the repo first, then run the bootstrap script:

```bash
git clone https://github.com/sinxy-sai/sinxy-sai.github.io.git
cd sinxy-sai.github.io
sudo ADMIN_TOKEN="$(openssl rand -hex 32)" APP_HOST="114.132.48.242" bash scripts/vps/bootstrap.sh
```

Variables:

```text
APP_USER=ubuntu
APP_REPO=https://github.com/sinxy-sai/sinxy-sai.github.io.git
APP_DIR=/home/ubuntu/sinxy-sai.github.io
WEB_ROOT=/var/www/sinxy-blog
APP_HOST=_
APP_PORT=8787
ADMIN_TOKEN=<required>
PUBLIC_GISCUS_REPO=<optional owner/repo>
PUBLIC_GISCUS_REPO_ID=<optional>
PUBLIC_GISCUS_CATEGORY=<optional>
PUBLIC_GISCUS_CATEGORY_ID=<optional>
MUSIC_PLAYLIST_ID=<optional NetEase playlist ID>
MUSIC_IDS=<optional comma-separated NetEase song IDs>
```

The bootstrap script installs Node.js 22, Nginx, build tools, configures the
systemd service, configures Nginx, builds the site, opens the firewall, and
starts the backend.

## Backup and restore

The production data is:

```text
/home/ubuntu/sinxy-sai.github.io/.data/blog.sqlite
/home/ubuntu/sinxy-sai.github.io/.data/media/
```

Create a backup on the VPS:

```bash
cd ~/sinxy-sai.github.io
bash scripts/vps/backup.sh
```

Restore on a new VPS after bootstrap:

```bash
scp sinxy-blog-data-YYYYMMDDTHHMMSSZ.tar.gz ubuntu@NEW_SERVER_IP:/home/ubuntu/
ssh ubuntu@NEW_SERVER_IP
cd ~/sinxy-sai.github.io
bash scripts/vps/restore.sh ~/sinxy-blog-data-YYYYMMDDTHHMMSSZ.tar.gz
```

Migration checklist:

1. Run `bootstrap.sh` on the new VPS.
2. Copy the latest backup archive to the new VPS.
3. Run `restore.sh`.
4. Update GitHub Secrets `VPS_HOST` to the new IP.
5. Update DNS to the new IP.
6. Check `/api/health`, `/api/posts`, `/admin/`, and a media URL.
