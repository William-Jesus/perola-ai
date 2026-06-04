#!/usr/bin/env bash
set -euo pipefail

# ============================================
# JARVIS Deploy Script
# ============================================
# Conecta via SSH interativo (com 2FA) no VPS,
# faz git pull, build e restart do PM2.
#
# Uso:
#   chmod +x deploy.sh
#   ./deploy.sh
# ============================================

VPS_HOST="jarvis-vps"
APP_DIR="/root/jarvis"

echo "================================================"
echo "  🚀 JARVIS Deploy"
echo "================================================"
echo ""
echo "Servidor: $VPS_HOST"
echo "Diretório: $APP_DIR"
echo ""
echo "Você precisará digitar o código 2FA quando"
echo "o servidor solicitar."
echo ""
read -p "Pressione ENTER para continuar..."
echo ""

# Executa os comandos no servidor via SSH interativo
ssh -t "$VPS_HOST" "
  set -e
  echo '[DEPLOY] Conectado ao servidor'
  cd $APP_DIR
  echo '[DEPLOY] Git pull...'
  git pull origin main
  echo '[DEPLOY] Buildando...'
  npm run build
  echo '[DEPLOY] Restartando PM2...'
  pm2 restart jarvis jarvis-ws
  echo '[DEPLOY] ✅ Deploy concluído!'
"

echo ""
echo "================================================"
echo "  ✅ Deploy finalizado com sucesso!"
echo "================================================"
