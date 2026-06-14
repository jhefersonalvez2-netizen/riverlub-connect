# Notas para VPS - riverlub-whatsapp-brain

Nao subir ainda sem validar o smoke test local. Estas notas sao preparacao tecnica.

## Requisitos minimos recomendados

- Ubuntu 22.04 LTS ou 24.04 LTS.
- 2 vCPU.
- 4 GB RAM.
- 20 GB disco.
- Node.js 20+.
- Nginx.
- PM2 ou systemd.

## Dependencias provaveis para Chromium/Puppeteer

Em Ubuntu, o `whatsapp-web.js` usa Puppeteer/Chromium. Dependendo da imagem da VPS, podem faltar bibliotecas:

```bash
sudo apt update
sudo apt install -y \
  ca-certificates fonts-liberation libasound2t64 libatk-bridge2.0-0 \
  libatk1.0-0 libcups2 libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 \
  libnspr4 libnss3 libx11-xcb1 libxcomposite1 libxdamage1 \
  libxrandr2 xdg-utils
```

Em Ubuntu 22.04, o pacote de audio pode se chamar `libasound2` em vez de `libasound2t64`.

## Variaveis de producao

```env
OPENAI_KEY=
PORT=47852
AGENT_AUTH_TOKEN=
FRONTEND_ORIGIN=https://painel.seudominio.com
OPENAI_MODEL=gpt-4o-mini
AUTO_REPLY=false
AUTO_SUGGEST=false
ALLOW_GROUPS=false
AUTO_REPLY_ALLOWED_NUMBERS=
IGNORE_OLD_MESSAGES_ON_START=true
OLD_MESSAGE_MAX_AGE_SECONDS=120
META_WA_TOKEN=
META_WA_PHONE_NUMBER_ID=
META_WA_BUSINESS_ACCOUNT_ID=
META_WA_VERIFY_TOKEN=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=
RECEPTION_NOTIFY_TO=
RECEPTION_NOTIFY_ENABLED=true
```

Use token forte e rotacionavel. Token fixo simples nao e autenticacao suficiente para producao.

## Exemplo com PM2

```bash
cd /opt/riverlub-whatsapp-brain/agent
npm ci
npm run build
pm2 start dist/index.js --name riverlub-whatsapp-brain-agent
pm2 save
pm2 startup
```

Logs:

```bash
pm2 logs riverlub-whatsapp-brain-agent
```

Restart:

```bash
pm2 restart riverlub-whatsapp-brain-agent
```

## Exemplo de Nginx reverse proxy

```nginx
server {
  listen 443 ssl;
  server_name agent.seudominio.com;

  location / {
    proxy_pass http://127.0.0.1:47852;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location /events {
    proxy_pass http://127.0.0.1:47852/events;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_cache off;
  }
}
```

## Storage persistente

Preserve:

- `agent/.wwebjs_auth/`
- `agent/src/storage/data/prompt.json`
- `agent/src/storage/data/logs.json`
- `agent/src/storage/data/runtimeSettings.json`
- `agent/src/storage/data/conversations.json`
- `agent/src/storage/data/contactPolicies.json`
- `agent/src/storage/data/templates.json`
- Supabase laboratorio para jobs, quando configurado.

Para producao, migrar logs/prompt para banco ou storage transacional.

## Alertas importantes

- `whatsapp-web.js` nao e API oficial da Meta/WhatsApp.
- WhatsApp Web pode mudar e quebrar automacao.
- Sessao pode expirar e exigir novo QR.
- Nao exponha `OPENAI_KEY` ou `AGENT_AUTH_TOKEN` no frontend publico.
- Nao habilite `AUTO_REPLY=true` sem politica operacional e testes com numeros permitidos.
- O provider padrao ainda e `whatsapp_web`; o `meta_cloud_api` desta rodada e stub, nao envia mensagens reais.
- A janela de 24h e templates internos foram criados para preparar a migracao, mas a aprovacao oficial de templates so existira na Meta Cloud API.

## Plano futuro

- Validar estabilidade do laboratorio local.
- Isolar agent em VPS com TLS e autenticao robusta.
- Adicionar observabilidade e alertas de desconexao.
- Definir contrato de integracao com RiverLub principal.
- Avaliar migracao para WhatsApp Cloud API oficial para producao.
- Implementar provider Meta Cloud API real usando `META_WA_TOKEN` e `META_WA_PHONE_NUMBER_ID`.
- Migrar JSON local para banco antes de alto volume ou multiplos processos.
- Separar Supabase laboratorio do banco RiverLub real ate haver contrato oficial de integracao.
