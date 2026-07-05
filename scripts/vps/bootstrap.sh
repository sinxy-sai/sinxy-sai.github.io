#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME:-sinxy-blog}"
APP_USER="${APP_USER:-ubuntu}"
APP_REPO="${APP_REPO:-https://github.com/sinxy-sai/sinxy-sai.github.io.git}"
APP_DIR="${APP_DIR:-/home/${APP_USER}/sinxy-sai.github.io}"
WEB_ROOT="${WEB_ROOT:-/var/www/sinxy-blog}"
APP_HOST="${APP_HOST:-_}"
APP_PORT="${APP_PORT:-8787}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"
PUBLIC_GISCUS_REPO="${PUBLIC_GISCUS_REPO:-}"
PUBLIC_GISCUS_REPO_ID="${PUBLIC_GISCUS_REPO_ID:-}"
PUBLIC_GISCUS_CATEGORY="${PUBLIC_GISCUS_CATEGORY:-}"
PUBLIC_GISCUS_CATEGORY_ID="${PUBLIC_GISCUS_CATEGORY_ID:-}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo APP_REPO=... ADMIN_TOKEN=... bash scripts/vps/bootstrap.sh" >&2
  exit 1
fi

if [[ -z "$ADMIN_TOKEN" ]]; then
  echo "ADMIN_TOKEN is required." >&2
  echo "Example: sudo ADMIN_TOKEN=\"$(openssl rand -hex 32)\" bash scripts/vps/bootstrap.sh" >&2
  exit 1
fi

if ! id "$APP_USER" >/dev/null 2>&1; then
  echo "User does not exist: $APP_USER" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y ca-certificates curl git nginx ufw build-essential python3 make g++

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/^v//' | cut -d. -f1)" -lt 22 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

install -d -o "$APP_USER" -g "$APP_USER" "$WEB_ROOT"

if [[ ! -d "$APP_DIR/.git" ]]; then
  rm -rf "$APP_DIR"
  sudo -u "$APP_USER" git clone "$APP_REPO" "$APP_DIR"
else
  sudo -u "$APP_USER" git -C "$APP_DIR" fetch origin main
  sudo -u "$APP_USER" git -C "$APP_DIR" reset --hard origin/main
fi

if [[ -n "$PUBLIC_GISCUS_REPO$PUBLIC_GISCUS_REPO_ID$PUBLIC_GISCUS_CATEGORY$PUBLIC_GISCUS_CATEGORY_ID" ]]; then
  cat > "/home/${APP_USER}/.sinxy-blog.env" <<EOF
PUBLIC_GISCUS_REPO='${PUBLIC_GISCUS_REPO}'
PUBLIC_GISCUS_REPO_ID='${PUBLIC_GISCUS_REPO_ID}'
PUBLIC_GISCUS_CATEGORY='${PUBLIC_GISCUS_CATEGORY}'
PUBLIC_GISCUS_CATEGORY_ID='${PUBLIC_GISCUS_CATEGORY_ID}'
EOF
  chown "$APP_USER:$APP_USER" "/home/${APP_USER}/.sinxy-blog.env"
  chmod 600 "/home/${APP_USER}/.sinxy-blog.env"
fi

sudo -u "$APP_USER" bash -lc "cd '$APP_DIR' && set -a && [ -f \"\$HOME/.sinxy-blog.env\" ] && . \"\$HOME/.sinxy-blog.env\" || true && set +a && npm ci && npm run build"
rm -rf "$WEB_ROOT"/*
cp -r "$APP_DIR"/dist/* "$WEB_ROOT"/
find "$WEB_ROOT" -type d -exec chmod 755 {} \;
find "$WEB_ROOT" -type f -exec chmod 644 {} \;
chown -R "$APP_USER:$APP_USER" "$WEB_ROOT"

cat > /etc/nginx/sites-available/sinxy-blog <<EOF
server {
    listen 80;
    server_name ${APP_HOST};

    client_max_body_size 6m;

    root ${WEB_ROOT};
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /blog/ {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /tags/ {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /media/ {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location / {
        try_files \$uri \$uri/ =404;
    }
}
EOF

ln -sf /etc/nginx/sites-available/sinxy-blog /etc/nginx/sites-enabled/sinxy-blog
rm -f /etc/nginx/sites-enabled/default
nginx -t

cat > /etc/systemd/system/sinxy-blog.service <<EOF
[Unit]
Description=Sinxy Sai Blog Node backend
After=network.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
Environment=PORT=${APP_PORT}
Environment=ADMIN_TOKEN=${ADMIN_TOKEN}
ExecStart=/usr/bin/npm run server:start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/sudoers.d/sinxy-blog-deploy <<EOF
${APP_USER} ALL=(root) NOPASSWD: /usr/bin/systemctl restart sinxy-blog, /usr/bin/systemctl status sinxy-blog --no-pager
EOF
chmod 440 /etc/sudoers.d/sinxy-blog-deploy

systemctl daemon-reload
systemctl enable --now sinxy-blog
systemctl reload nginx

ufw allow OpenSSH
ufw allow 80
ufw allow 443
if ! ufw status | grep -q "Status: active"; then
  ufw --force enable
fi

systemctl status sinxy-blog --no-pager
echo "Bootstrap complete."
echo "Health check: curl http://127.0.0.1:${APP_PORT}/api/health"
