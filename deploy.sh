#!/usr/bin/env bash
set -euo pipefail

# ============================================
# Deploy da Pérola
# ============================================
# Conecta via SSH no VPS, faz git pull e
# rebuilda o container com docker compose.
# Ver DEPLOY.md pro passo a passo manual.
#
# Uso:
#   chmod +x deploy.sh
#   ./deploy.sh
#
# Espera um host "perola-vps" configurado no
# seu ~/.ssh/config, apontando pro VPS.
# ============================================

VPS_HOST="perola-vps"
APP_DIR="/root/perola-ai"

echo "================================================"
echo "  🐚 Deploy da Pérola"
echo "================================================"
echo ""
echo "Servidor: $VPS_HOST"
echo "Diretório: $APP_DIR"
echo ""
read -p "Pressione ENTER para continuar..."
echo ""

ssh -t "$VPS_HOST" "
  set -e
  echo '[DEPLOY] Conectado ao servidor'
  cd $APP_DIR
  echo '[DEPLOY] Git pull...'
  git pull origin main
  echo '[DEPLOY] Rebuildando container...'
  docker compose down
  docker compose up -d --build
  echo '[DEPLOY] ✅ Deploy concluído!'
"

echo ""
echo "================================================"
echo "  ✅ Deploy finalizado com sucesso!"
echo "================================================"
