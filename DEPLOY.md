# Deploy no Servidor Próprio

## Requisitos

- Docker + Docker Compose
- Git
- Arquivo `.env.local` configurado (veja `.env.example`)

## Passo a passo

### 1. Envie o repositório para o servidor

O remote `origin` deste repositório foi removido de propósito (fork independente do jarvis-ai-assistant). Configure seu próprio remote e faça o clone/push a partir dele, ou copie a pasta diretamente para o servidor.

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

A build é só Node.js — sem dependências de Python ou browser automation.

### 4. Verifique se subiu

```bash
docker compose logs -f perola
```

Acesse: `http://seu-servidor:3000`

### 5. Comandos úteis

```bash
# Restart
docker compose restart

# Logs
docker compose logs -f perola

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
    server_name perola.seudominio.com;

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
| `OPENAI_API_KEY` | Chave da OpenAI (Realtime + gpt-4o vision) |

Opcional: `PEROLA_VOICE` (padrão `coral`) — voz do OpenAI Realtime.

## Primeiro acesso

Acesse `/perola` — a Pérola já estará funcional, sem login.
