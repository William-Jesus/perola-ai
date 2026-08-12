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

### 6. Proxy reverso com HTTPS (obrigatório, não só recomendado)

O microfone e a câmera só funcionam em origem segura — o iOS Safari bloqueia
`getUserMedia` em qualquer coisa que não seja HTTPS (ou `localhost`). Sem
isso, dá pra ver a tela mas não dá pra conversar com ela.

Aponte o DNS do domínio (ou subdomínio, tipo `perola.seudominio.com`) pro IP
do VPS antes de seguir.

```bash
sudo apt install nginx certbot python3-certbot-nginx
```

Exemplo de config do Nginx (`/etc/nginx/sites-available/perola`):

```nginx
server {
    listen 80;
    server_name perola.seudominio.com;

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

```bash
sudo ln -s /etc/nginx/sites-available/perola /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d perola.seudominio.com
```

O Certbot edita o bloco do Nginx pra HTTPS automaticamente e cuida da
renovação do certificado. **Importante:** o WebSocket do WebRTC precisa do
`upgrade` header como no exemplo acima.

---

## Variáveis de ambiente obrigatórias

| Variável | Descrição |
|----------|-----------|
| `OPENAI_API_KEY` | Chave da OpenAI (Realtime + gpt-4o vision) |

Opcional:
- `PEROLA_VOICE` (padrão `coral`) — voz do OpenAI Realtime.
- `PEROLA_NOME` (padrão `amiga`) — nome da criança.
- `PEROLA_IDADE` (padrão `9`) — idade da criança.
- `NEXT_PUBLIC_PEROLA_MAX_MINUTOS` (padrão `20`) — corta a chamada sozinha
  depois de X minutos, pra sessão não ficar aberta e gastando à toa se
  esquecerem de desligar.

## Limite de gasto na OpenAI

O cap de duração acima protege contra sessão esquecida aberta, mas não
contra uso normal virar custo alto sem ninguém perceber. Configure um teto
direto na conta:

1. [platform.openai.com/settings/organization/limits](https://platform.openai.com/settings/organization/limits)
2. Defina um **limite de gasto mensal** (soft limit avisa por e-mail, hard
   limit corta a API quando bate o teto).

Isso é configuração da conta, não tem como fazer por código — só quem tem
login na OpenAI consegue setar.

## Primeiro acesso

Acesse `/perola` — a Pérola já estará funcional, sem login.

## Memória

A Pérola guarda fatos soltos sobre a criança (nome de uma amiga, um hobby, uma
dificuldade recorrente) em `data/memoria.json`, criado automaticamente na
primeira vez que ela usa a função `lembrar`. É dado pessoal — não vai pro
git (`.gitignore`) e, no Docker, precisa do volume `./data:/app/data` do
`docker-compose.yml` pra sobreviver a um restart do container.
