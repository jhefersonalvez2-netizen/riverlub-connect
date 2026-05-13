# RiverLub Connect

RiverLub Connect e o aplicativo desktop local do RiverLub para Windows. Nesta fase, ele e uma base Tauri v2 isolada que nao altera o RiverLub Web, o backend Render, nem o banco Supabase.

## Objetivo

- Substituir futuramente o instalador `.cmd` do agente WhatsApp por um app instalavel.
- Rodar integracoes locais sem terminal visivel.
- Preparar base para WhatsApp, impressoras, notificacoes locais, modo offline e futuras automacoes.
- Manter o painel Web como sistema principal.

## Diagnostico do WhatsApp atual

O fluxo atual ja esta maduro o bastante para ser reaproveitado pelo Connect:

- Agente atual: `backend/whatsapp-agent/src/index.js`.
- Instalador atual: `frontend/public/riverlub-agent/instalar-riverlub-whatsapp.cmd`.
- Tela Web atual: `frontend/src/app/whatsapp/page.js`.
- Backend: `backend/src/routes/whatsapp.js`, `backend/src/services/whatsappAgent.js` e `backend/src/services/whatsappBridgeLocal.js`.
- Engine WhatsApp: `whatsapp-web.js` com `LocalAuth`, `qrcode`, `qrcode-terminal` e Puppeteer.
- Servidor local: `http://127.0.0.1:47851`.
- Sessao local: `%APPDATA%/RiverLub/whatsapp-agent/session`.
- Config local: `%APPDATA%/RiverLub/whatsapp-agent/config.json`.
- Logs: `%APPDATA%/RiverLub/whatsapp-agent/logs/agent.log`.
- Status remoto: `POST /api/whatsapp/agente/ping`.
- Fila de envio: `POST /api/whatsapp/agente/jobs/proximo`.
- Conclusao de jobs: `POST /api/whatsapp/agente/jobs/:id/concluir`.
- Desconexao: `POST /api/whatsapp/ponte/desconectar` no backend e `POST /desconectar` no agente local.

O token do agente e criado pelo backend em `POST /api/whatsapp/ponte/ativar`, salvo localmente pelo agente e enviado ao backend como `Authorization: Bearer <token>`. A UI nao deve exibir esse token.

## Plano tecnico

### Fase 1: base isolada

Feito nesta pasta:

- App Tauri v2 com React + Vite.
- Tela inicial premium RiverLub.
- Status visual: parado, iniciando, aguardando QR, conectado e erro.
- Leitura segura do agente atual via `GET http://127.0.0.1:47851/health`.
- Botao de desconectar chamando `POST http://127.0.0.1:47851/desconectar`.
- Logs de interface em memoria, sem ler arquivos locais ainda.
- Bundle preparado para NSIS (`RiverLub Connect Setup`) quando o ambiente Rust estiver pronto.

### Fase 2: gerenciamento local do agente

Feito nesta fase:

- Comandos Tauri nativos para consultar processo, porta, caminhos locais e logs.
- Inicio do agente atual em `backend/whatsapp-agent/src/index.js` por `node src/index.js`.
- Processo iniciado sem terminal visivel no Windows.
- Parada segura limitada ao processo criado pelo Connect.
- Deteccao de agente externo iniciado pelo `.cmd` ou terminal, sem encerrar esse processo.
- Leitura nativa de `GET /health` e `POST /desconectar` em `127.0.0.1:47851`, evitando problema de CORS da WebView.
- Logs recentes lidos de `%APPDATA%/RiverLub/whatsapp-agent/logs/agent.log`.
- UI com estados: parado, iniciando, aguardando QR, conectado, reconectando, desconectado, erro e agente externo.

O `@tauri-apps/plugin-shell` ainda nao foi instalado nesta fase porque o agente atual continua sendo um app Node em pasta irma do repo. Para usar sidecar corretamente, o binario precisa estar declarado no bundle/capabilities do Tauri e empacotado junto do instalador. A abstracao criada em `src/agent` deixa essa troca preparada.

### Fase 3: sidecar do agente

Proxima implementacao recomendada:

- Extrair `backend/whatsapp-agent` para um pacote controlavel pelo Connect.
- Empacotar o agente como sidecar Tauri.
- Usar plugin shell do Tauri para iniciar, reiniciar e encerrar o processo sem terminal.
- Manter logs em `%APPDATA%/RiverLub/connect/logs`.
- Preservar a sessao atual em `%APPDATA%/RiverLub/whatsapp-agent/session` ou migrar com cuidado.

### Fase 4: pareamento nativo

- Web gera codigo temporario de pareamento.
- Connect recebe o codigo.
- Backend valida codigo e devolve token do agente.
- Connect salva token localmente sem expor na UI.
- Status continua aparecendo no painel Web.

### Fase 5: instalador

- Gerar `RiverLub-Connect-Setup.exe` via Tauri/NSIS.
- Assinar o executavel para reduzir bloqueios de antivirus e SmartScreen.
- Manter o `.cmd` antigo disponivel ate o Connect estar validado em oficinas reais.

## Como rodar em desenvolvimento

Requisitos:

- Node.js LTS.
- Rust instalado.
- Dependencias de Windows exigidas pelo Tauri v2.

Comandos:

```powershell
npm install
npm run dev
```

Gerar instalador local:

```powershell
npm run build
```

O instalador Tauri/NSIS ficara em `src-tauri/target/release/bundle/nsis` quando o build for concluido.

## Riscos

- `whatsapp-web.js` depende de Puppeteer/Chromium e pode aumentar o tamanho do app.
- Antiviruses podem continuar sensiveis ate haver assinatura digital.
- Sidecar Node precisa ser empacotado com cuidado para nao depender de terminal ou PATH do usuario.
- QR Code real hoje fica no backend/painel Web, nao no servidor local. Para QR nativo no Connect, o agente precisa expor o QR localmente ou o Connect precisa consultar o backend autenticado.
- Desconectar e uma acao real quando o agente atual estiver rodando.
