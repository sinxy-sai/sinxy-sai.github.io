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

    location /tags/ {
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
