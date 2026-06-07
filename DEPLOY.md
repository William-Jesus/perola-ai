# Deploy no Servidor Próprio

## Requisitos

- Docker + Docker Compose
- Git
- Arquivo `.env.local` configurado (veja `.env.example`)

## Passo a passo

### 1. Clone o repositório no servidor

```bash
git clone https://github.com/William-Jesus/Jarvis.git
cd Jarvis
```

### 2. Crie o arquivo `.env.local`

Copie o exemplo e preencha com suas credenciais:

```bash
cp .env.example .env.local
nano .env.local
```

### 3. Build e start

```bash
docker compose up -d --build
```

A primeira build demora ~5-10 minutos porque baixa:
- Node.js deps
- Python + SpeechBrain + PyTorch
- Playwright Chromium
- Modelo ECAPA-TDNN ( SpeechBrain )

### 4. Verifique se subiu

```bash
docker compose logs -f jarvis
```

Acesse: `http://seu-servidor:3000`

### 5. Comandos úteis

```bash
# Restart
docker compose restart

# Logs
docker compose logs -f jarvis

# Stop
docker compose down

# Atualizar (após git pull)
docker compose down
docker compose up -d --build
```

### 6. Proxy reverso (recomendado)

Use Nginx ou Traefik com HTTPS. Exemplo Nginx:

```nginx
server {
    listen 443 ssl;
    server_name jarvis.seudominio.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

**Importante:** O WebSocket do WebRTC precisa do `upgrade` header como no exemplo acima.

---

## Variáveis de ambiente obrigatórias

| Variável | Descrição |
|----------|-----------|
| `OPENAI_API_KEY` | Chave da OpenAI (GPT-4o / Realtime) |
| `ANTHROPIC_API_KEY` | Chave da Anthropic (Claude) |
| `ELEVENLABS_API_KEY` | Chave do ElevenLabs (TTS) |
| `SESSION_SECRET` | Senha forte para criptografar cookies (min 32 chars) |
| `INTERNAL_API_SECRET` | Senha para chamadas internas entre APIs |
| `NEXT_PUBLIC_ORIGIN` | URL pública do app (ex: `https://jarvis.seudominio.com`) |

## Primeiro acesso

1. Acesse `/login`
2. Cadastre uma passkey (WebAuthn)
3. Faça login
4. O JARVIS já estará funcional

Para cadastrar uma voz:
```bash
curl -X POST http://localhost:3000/api/jarvis/voice/enroll \
  -H "Content-Type: application/json" \
  -d '{
    "audioBase64": "data:audio/webm;base64,...",
    "name": "William",
    "relationship": "dono"
  }'
```
