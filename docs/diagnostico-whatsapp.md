# Diagnostico do fluxo WhatsApp atual

## Componentes

- RiverLub Web: tela `frontend/src/app/whatsapp/page.js`.
- Instalador legado: `frontend/public/riverlub-agent/instalar-riverlub-whatsapp.cmd`.
- Agente local: `backend/whatsapp-agent/src/index.js`.
- API backend: `backend/src/routes/whatsapp.js`.
- Servico de agente: `backend/src/services/whatsappAgent.js`.
- Ponte atual: `backend/src/services/whatsappBridgeLocal.js`.
- Alias da ponte: `backend/src/services/whatsappBridge.js`.

## Fluxo atual

1. Admin acessa a tela Web de WhatsApp.
2. A tela consulta `GET /api/whatsapp/ponte/status`.
3. Ao conectar, a tela chama `POST /api/whatsapp/ponte/ativar`.
4. O backend cria ou reaproveita um registro em `whatsapp_agentes`.
5. Se precisar, o backend devolve `agent_token` uma unica vez.
6. A tela tenta chamar o agente local em `POST http://127.0.0.1:47851/ativar`.
7. Se o agente nao responder, a tela baixa o `.cmd`.
8. O agente salva `apiUrl` e `agentToken` em `%APPDATA%/RiverLub/whatsapp-agent/config.json`.
9. O agente inicia `whatsapp-web.js`, gera QR e envia `qr_data_url` para o backend.
10. A tela Web mostra o QR que veio do backend.
11. Quando conectado, o agente faz heartbeat pelo endpoint `POST /api/whatsapp/agente/ping`.
12. Jobs sao buscados em `POST /api/whatsapp/agente/jobs/proximo`.
13. Jobs sao finalizados em `POST /api/whatsapp/agente/jobs/:id/concluir`.

## Dependencias do agente atual

- `whatsapp-web.js`
- `qrcode`
- `qrcode-terminal`
- `puppeteer` transitive pelo WhatsApp Web
- Node.js local ou Node portatil baixado pelo `.cmd`
- Chrome/Edge local preferencialmente; caso contrario Puppeteer tenta navegador proprio

## Estado e arquivos locais

- Porta: `47851`.
- Host: `127.0.0.1`.
- Config: `%APPDATA%/RiverLub/whatsapp-agent/config.json`.
- Sessao: `%APPDATA%/RiverLub/whatsapp-agent/session`.
- Logs: `%APPDATA%/RiverLub/whatsapp-agent/logs/agent.log`.
- Startup atual: atalho no Startup do Windows apontando para VBS/CMD.

## Pontos bons para reaproveitar

- O agente ja e isolado por oficina via token.
- O backend ja tem tabelas de status e jobs.
- A tela Web ja sabe ativar, baixar instalador, mostrar QR e testar envio.
- A API ja evita expor token depois da criacao.
- O agente ja roda em background via VBS.

## Pontos de atencao

- O `.cmd` embute o agente em Base64 e baixa Node portatil, o que pode parecer suspeito para antivirus.
- O QR real nao e exposto pelo endpoint local `/health`; ele e enviado ao backend.
- O app desktop precisa evitar mostrar `agentToken`.
- O sidecar Tauri deve preservar sessao e logs sem apagar dados atuais.
- O instalador final precisa assinatura digital para reduzir falso positivo.

