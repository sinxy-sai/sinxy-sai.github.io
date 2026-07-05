# VPS backend notes

This project still keeps the Cloudflare Worker backend. The VPS backend is a
separate Node.js + SQLite entry point for learning server operations and for
running dynamic blog APIs behind Nginx.

## Local commands

```bash
npm run build
npm run server:start
```

Default paths:

- SQLite database: `.data/blog.sqlite`
- Local media files: `.data/media`
- Static template source: `dist/dynamic-template/*`

The server auto-creates the SQLite schema from `db/schema.sql`.

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
