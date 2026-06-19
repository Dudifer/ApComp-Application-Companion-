#!/bin/bash
# deploy.sh — run on EC2 after SSH in
# Usage: bash deploy.sh yourdomain.com

set -e
DOMAIN=${1:-yourdomain.com}
APP_DIR="/home/ubuntu/apcomp"
WEB_DIR="/var/www/apcomp"

echo "==> Deploying ApComp to $DOMAIN"

# ── 1. System deps ────────────────────────────────────────────────────────────
echo "==> Installing system dependencies..."
sudo apt update -qq
sudo apt install -y nodejs npm nginx postgresql postgresql-contrib certbot python3-certbot-nginx

# Install pnpm and pm2
sudo npm install -g pnpm pm2

# ── 2. PostgreSQL ─────────────────────────────────────────────────────────────
echo "==> Setting up PostgreSQL..."
sudo -u postgres psql -c "CREATE USER apcomp_user WITH PASSWORD 'CHANGE_THIS_PASSWORD';" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE apcomp_db OWNER apcomp_user;" 2>/dev/null || true

# ── 3. Clone / pull repo ──────────────────────────────────────────────────────
echo "==> Pulling latest code..."
if [ -d "$APP_DIR" ]; then
  cd $APP_DIR && git pull
else
  git clone https://github.com/YOUR_USERNAME/apcomp.git $APP_DIR
  cd $APP_DIR
fi

# ── 4. Install deps ───────────────────────────────────────────────────────────
echo "==> Installing dependencies..."
cd $APP_DIR
pnpm install

# ── 5. Build ──────────────────────────────────────────────────────────────────
echo "==> Building types..."
cd $APP_DIR/packages/types
rm -rf dist && pnpm build

echo "==> Building API..."
cd $APP_DIR/apps/api
rm -rf dist
npx tsc --project tsconfig.build.json

echo "==> Building frontend..."
cd $APP_DIR/apps/web
VITE_API_URL=https://$DOMAIN pnpm build

# ── 6. Database migrations ────────────────────────────────────────────────────
echo "==> Running database migrations..."
cd $APP_DIR/apps/api
npx prisma migrate deploy
npx prisma generate

# ── 7. Frontend static files ──────────────────────────────────────────────────
echo "==> Deploying frontend..."
sudo mkdir -p $WEB_DIR
sudo cp -r $APP_DIR/apps/web/dist/* $WEB_DIR/
sudo chown -R www-data:www-data $WEB_DIR

# ── 8. Nginx config ───────────────────────────────────────────────────────────
echo "==> Configuring Nginx..."
sudo tee /etc/nginx/sites-available/apcomp > /dev/null <<EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    server_name $DOMAIN www.$DOMAIN;

    ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript;

    location / {
        root $WEB_DIR;
        try_files \$uri \$uri/ /index.html;
        location ~* \.(js|css|png|jpg|ico|svg|woff2)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    location /api/ {
        proxy_pass http://localhost:3000/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }

    location /applications/gmail/ {
        proxy_pass http://localhost:3000/applications/gmail/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/apcomp /etc/nginx/sites-enabled/apcomp
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# ── 9. SSL cert ───────────────────────────────────────────────────────────────
echo "==> Getting SSL certificate..."
sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos -m admin@$DOMAIN

# ── 10. Start API with pm2 ────────────────────────────────────────────────────
echo "==> Starting API..."
cd $APP_DIR/apps/api
pm2 delete apcomp-api 2>/dev/null || true
pm2 start dist/main.js --name apcomp-api --env production
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu

echo ""
echo "✅ Deployment complete!"
echo "   Site: https://$DOMAIN"
echo ""
echo "⚠️  Don't forget to:"
echo "   1. Create /home/ubuntu/apcomp/apps/api/.env with your production secrets"
echo "   2. Update Google OAuth redirect URI to https://$DOMAIN/applications/gmail/callback"
echo "   3. Update Clerk allowed origins to https://$DOMAIN"
