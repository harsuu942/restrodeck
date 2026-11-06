#!/usr/bin/env bash
set -e

# RestroDeck Cloud POS - 1-Click Production VPS Deployer
# Compatible with Ubuntu 22.04 / 24.04 LTS & Debian 11/12

DOMAIN="${1:-restrodeck.com}"
APP_DIR="/var/www/restrodeck-pos"
PORT=3000

echo "=================================================="
echo "🚀 RestroDeck Production VPS Deployment"
echo "🌐 Domain: $DOMAIN (and *.$DOMAIN)"
echo "📁 Target: $APP_DIR"
echo "=================================================="

# 1. Install prerequisites
echo "📦 Installing system dependencies (Python3, Nginx, Certbot)..."
sudo apt-get update -y
sudo apt-get install -y python3 python3-pip nginx certbot python3-certbot-nginx git curl

# 2. Setup user and application directory
echo "👤 Setting up posuser and application directory..."
sudo id -u posuser &>/dev/null || sudo useradd -r -s /bin/false posuser
sudo mkdir -p "$APP_DIR"
sudo cp -r . "$APP_DIR/"
sudo chown -R posuser:posuser "$APP_DIR"
sudo chmod -R 755 "$APP_DIR"
sudo chmod -R 775 "$APP_DIR/data"

# 3. Setup Systemd Service
echo "⚙️ Configuring systemd service: restrodeck-pos.service..."
cat << 'EOF' | sudo tee /etc/systemd/system/restrodeck-pos.service > /dev/null
[Unit]
Description=RestroDeck Multi-Tenant Cloud POS Enterprise Engine
After=network.target

[Service]
Type=simple
User=posuser
WorkingDirectory=/var/www/restrodeck-pos
ExecStart=/usr/bin/python3 /var/www/restrodeck-pos/server.py
Restart=always
RestartSec=3
KillMode=process

Environment=PYTHONUNBUFFERED=1
Environment=PORT=3000

LimitNOFILE=65536
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable restrodeck-pos.service
sudo systemctl restart restrodeck-pos.service

# 4. Configure Nginx Reverse Proxy with Wildcard Subdomains
echo "🌐 Configuring Nginx reverse proxy..."
cat << EOF | sudo tee /etc/nginx/sites-available/restrodeck > /dev/null
server {
    listen 80;
    server_name $DOMAIN *.$DOMAIN;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        # WebSocket & long-polling sync support
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/restrodeck /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

echo ""
echo "=================================================="
echo "✅ RestroDeck POS is LIVE on your server!"
echo "🌐 HTTP Access: http://$DOMAIN"
echo ""
echo "🔒 To enable Free Wildcard HTTPS / SSL with Let's Encrypt, run:"
echo "   sudo certbot --nginx -d $DOMAIN -d *.$DOMAIN"
echo "=================================================="
