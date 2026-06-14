# riverlub-whatsapp-brain

MVP local e isolado para testar uma ponte entre WhatsApp, painel desktop Tauri e LLM OpenAI. Este projeto nao integra diretamente com o sistema RiverLub principal; ele foi criado como laboratorio tecnico para validar o fluxo antes de qualquer VPS ou integracao oficial.

## Visao Geral

- `agent/`: API local em Node.js + TypeScript.
- `desktop/`: painel Tauri com React/Vite.
- WhatsApp via `whatsapp-web.js` com `LocalAuth`.
- QR Code disponivel por API e SSE.
- Prompt da IA salvo localmente em JSON.
- Logs locais limitados aos ultimos 300 eventos.
- OpenAI chamada somente no backend; a chave nunca vai para o frontend.

## Arvore

```text
riverlub-whatsapp-brain/
  agent/
    src/
      index.ts
      env.ts
      auth.ts
      events.ts
      whatsapp/
        client.ts
        contactResolver.ts
        status.ts
      llm/
        openai.ts
        promptStore.ts
      ai/
        aiActionOrchestrator.ts
      db/
        supabase.ts
        types.ts
        seed.ts
        migrations/
          001_jobs_schema.sql
      jobs/
        appointmentService.ts
        customerService.ts
        vehicleService.ts
        plateLookupService.ts
        receptionNotifyService.ts
      messages/
        messageGateway.ts
      policy/
        contactPolicyStore.ts
        policyEngine.ts
        ratePolicy.ts
        templateStore.ts
        types.ts
      providers/
        MetaCloudApiProvider.ts
        providerRegistry.ts
        types.ts
        WhatsAppProvider.ts
        WhatsAppWebProvider.ts
      routes/
        contacts.ts
        conversations.ts
        debug.ts
        health.ts
        jobs.ts
        messages.ts
        whatsapp.ts
        prompt.ts
        logs.ts
        settings.ts
        test.ts
        templates.ts
      storage/
        contactMapStore.ts
        conversationStore.ts
        data/
          contactMap.json
          contactPolicies.json
          conversations.json
          prompt.json
          logs.json
          runtimeSettings.json
          templates.json
    package.json
    tsconfig.json
    .env.example
  desktop/
    src/
      App.tsx
      main.tsx
      styles.css
      components/
        StatusCard.tsx
        QrPanel.tsx
        PromptEditor.tsx
        AiAutomationPanel.tsx
        AttendancePanel.tsx
        SendTestPanel.tsx
        LogsPanel.tsx
      lib/
        api.ts
    src-tauri/
      icons/
        icon.ico
      Cargo.toml
      Cargo.lock
      build.rs
      tauri.conf.json
      src/main.rs
    package.json
    .env.example
  .env.example
  .gitignore
  README.md
```

## Requisitos

- Node.js 20+.
- npm.
- WhatsApp ativo em um celular para escanear o QR.
- Uma chave OpenAI em `OPENAI_KEY`.
- Para rodar o desktop Tauri: Rust + dependencias do Tauri instaladas no Windows.

Se Rust, Visual Studio Build Tools/WebView2 ou dependencias nativas do Tauri nao existirem na maquina, o painel web ainda pode rodar com `npm run dev`, mas `npm run tauri:dev` vai falhar ate a instalacao manual ser feita.

## Variaveis de Ambiente

O agent tenta carregar `.env` da pasta `agent/` e tambem o `.env` da raiz. O `.env` real nao deve ser commitado.

```env
OPENAI_KEY=
OPENAI_API_KEY=
PORT=47852
AGENT_AUTH_TOKEN=dev-local-token
FRONTEND_ORIGIN=http://localhost:1420
OPENAI_MODEL=gpt-4o-mini
AUTO_REPLY=false
AUTO_SUGGEST=false
ALLOW_GROUPS=false
AUTO_REPLY_ALLOWED_NUMBERS=
IGNORE_OLD_MESSAGES_ON_START=true
OLD_MESSAGE_MAX_AGE_SECONDS=120

# Futuro provider oficial Meta Cloud API (stub nesta rodada)
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

Notas:

- `OPENAI_KEY` tem prioridade.
- `OPENAI_API_KEY` e fallback.
- `AGENT_AUTH_TOKEN` protege envio, prompt, logs, teste de LLM e SSE.
- `AUTO_REPLY=false` e apenas o valor inicial seguro usado quando `runtimeSettings.json` ainda nao existe.
- Depois da primeira inicializacao, `agent/src/storage/data/runtimeSettings.json` passa a ser a fonte operacional do painel.
- `ALLOW_GROUPS=false` permanece como configuracao de seguranca; nesta fase o auto reply so deve seguir para conversas privadas validas.
- O painel opera com `autoReplyMode`: `manual`, `allowlist` ou `open`.
- `AUTO_REPLY_ALLOWED_NUMBERS` pode iniciar uma lista com numeros, IDs `@c.us` ou IDs `@lid`.
- O modo aberto deve ser usado apenas com prompt revisado e ambiente controlado; ele responde conversas privadas validas sem exigir allowlist.
- A pausa global no painel bloqueia qualquer resposta automatica sem desligar o WhatsApp.
- O provider ativo padrao e `whatsapp_web`. O provider `meta_cloud_api` existe apenas como stub preparado para migracao futura.
- `SUPABASE_SERVICE_ROLE_KEY` fica somente no backend `agent`; nunca colocar no desktop/Tauri.
- `RECEPTION_NOTIFY_TO` define o WhatsApp interno da recepcao para avisos de agendamento confirmado.
- Para o desktop, crie `desktop/.env.local`:

```env
VITE_API_BASE_URL=http://localhost:47852
VITE_AGENT_AUTH_TOKEN=dev-local-token
```

## Como Rodar

### 1. Agent

```powershell
cd agent
npm install
npm run dev
```

Porta padrao: `http://localhost:47852`.

Para desenvolvimento com reload automatico, use `npm run dev:watch`. O comando principal `npm run dev` compila TypeScript e executa `dist/index.js`, que e mais previsivel em ambientes Windows restritos.

### 2. Desktop

```powershell
cd desktop
npm install
Copy-Item .env.example .env.local
npm run tauri:dev
```

Alternativa sem janela Tauri, util para testar o painel web:

```powershell
cd desktop
npm run dev
```

Vite/Tauri dev usa `http://localhost:1420`.

## Endpoints

Todos os endpoints protegidos aceitam:

```http
Authorization: Bearer dev-local-token
```

| Metodo | Rota | Protegido | Funcao |
| --- | --- | --- | --- |
| `GET` | `/health` | Nao | Status basico do agent e WhatsApp |
| `GET` | `/whatsapp/status` | Nao | Estado completo do WhatsApp |
| `GET` | `/whatsapp/qr` | Nao | QR atual ou mensagem clara se nao existir |
| `POST` | `/whatsapp/start` | Sim | Inicializa o client WhatsApp |
| `POST` | `/whatsapp/stop` | Sim | Destroi/desconecta o client |
| `POST` | `/whatsapp/reset-session` | Sim | Remove sessao LocalAuth para gerar QR novo |
| `POST` | `/whatsapp/send` | Sim | Envia mensagem manual |
| `GET` | `/contacts/resolve/:chatId` | Sim | Diagnostico local de numero, `@c.us` ou `@lid` |
| `GET` | `/contacts/:contactId/policy` | Sim | Politica do contato, opt-in/out e notas |
| `PUT` | `/contacts/:contactId/policy` | Sim | Atualiza politica do contato |
| `POST` | `/contacts/:contactId/opt-out` | Sim | Marca contato como opt-out |
| `POST` | `/contacts/:contactId/opt-in` | Sim | Marca contato como opt-in |
| `GET` | `/conversations` | Sim | Lista conversas recentes do cockpit |
| `GET` | `/conversations/:contactId` | Sim | Retorna conversa completa |
| `POST` | `/conversations/:contactId/suggest` | Sim | Gera sugestao da IA sem enviar |
| `POST` | `/conversations/:contactId/send` | Sim | Envia resposta manual aprovada |
| `POST` | `/conversations/:contactId/read` | Sim | Marca conversa como lida |
| `POST` | `/conversations/:contactId/clear-draft` | Sim | Limpa sugestao salva |
| `POST` | `/conversations/:contactId/human-takeover` | Sim | Liga/desliga atendimento humano |
| `POST` | `/conversations/:contactId/pause-ai` | Sim | Pausa IA apenas nesse contato |
| `POST` | `/conversations/:contactId/status` | Sim | Atualiza status open/resolved/archived |
| `POST` | `/messages/template` | Sim | Renderiza e envia template interno com policy |
| `GET` | `/templates` | Sim | Lista templates internos |
| `POST` | `/templates` | Sim | Cria template interno |
| `PUT` | `/templates/:name` | Sim | Atualiza template interno |
| `POST` | `/templates/:name/disable` | Sim | Desativa template interno |
| `GET` | `/jobs/health` | Sim | Diagnostico Supabase do laboratorio de jobs |
| `GET` | `/jobs/vehicles/by-plate/:plate` | Sim | Busca placa no banco de teste |
| `GET` | `/jobs/appointments` | Sim | Lista agendamentos |
| `POST` | `/jobs/appointments` | Sim | Cria agendamento pending_confirmation com disponibilidade |
| `GET` | `/jobs/appointments/availability` | Sim | Verifica disponibilidade de horario |
| `GET` | `/jobs/appointments/suggest-slots` | Sim | Sugere horarios livres |
| `POST` | `/jobs/appointments/:id/confirm` | Sim | Confirma agendamento |
| `POST` | `/jobs/appointments/:id/cancel` | Sim | Cancela agendamento |
| `POST` | `/jobs/appointments/:id/notify-reception` | Sim | Notifica recepcao |
| `GET/POST` | `/jobs/customers`, `/jobs/vehicles`, `/jobs/quotes`, `/jobs/payments`, `/jobs/reminders`, `/jobs/ai-actions` | Sim | CRUD MVP do mini sistema de jobs |
| `GET` | `/settings` | Sim | Retorna configuracoes operacionais da IA |
| `PUT` | `/settings` | Sim | Atualiza configuracoes operacionais da IA |
| `POST` | `/settings/reset` | Sim | Restaura modo seguro da IA |
| `GET` | `/prompt` | Sim | Retorna prompt salvo |
| `PUT` | `/prompt` | Sim | Atualiza prompt salvo |
| `GET` | `/logs` | Sim | Retorna ultimos logs |
| `POST` | `/test/llm` | Sim | Testa OpenAI sem enviar WhatsApp |
| `GET` | `/events?token=...` | Sim | SSE de status, QR, mensagens, LLM e erros |
| `GET` | `/debug/state` | Sim | Diagnostico seguro sem segredos |

## Testes Rapidos por API

Health:

```powershell
Invoke-RestMethod http://localhost:47852/health
```

Iniciar WhatsApp:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:47852/whatsapp/start `
  -Headers @{ Authorization = "Bearer dev-local-token" }
```

Ver QR:

```powershell
Invoke-RestMethod http://localhost:47852/whatsapp/qr
```

Testar LLM sem WhatsApp:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:47852/test/llm `
  -Headers @{ Authorization = "Bearer dev-local-token" } `
  -ContentType "application/json" `
  -Body '{"message":"Cliente pergunta se voces fazem troca de oleo hoje."}'
```

Enviar WhatsApp manual:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:47852/whatsapp/send `
  -Headers @{ Authorization = "Bearer dev-local-token" } `
  -ContentType "application/json" `
  -Body '{"to":"5587999999999","message":"teste"}'
```

## Smoke Test Local

Use [docs/SMOKE_TEST.md](docs/SMOKE_TEST.md) para validar o fluxo completo: agent, desktop, QR, sessao, OpenAI, envio manual, recebimento, cockpit, Policy Engine, Provider Adapter, templates internos, persistencia LocalAuth e ausencia de duplicacao.

Notas de VPS estao em [docs/VPS_NOTES.md](docs/VPS_NOTES.md). Nao ha deploy nesta etapa.

## Fluxo de Uso

1. Configure `.env` com `OPENAI_KEY` e `AGENT_AUTH_TOKEN`.
2. Rode o agent na porta `47852`.
3. Rode o desktop na porta `1420`.
4. Clique em `Iniciar WhatsApp`.
5. Escaneie o QR com o WhatsApp.
6. Teste o prompt em `Prompt da IA`.
7. Envie uma mensagem manual em `Envio manual`.
8. Acompanhe os eventos em `Logs`.

## Modos da IA

O modo seguro padrao e `manual`: a IA nunca responde automaticamente, mas `/test/llm` e envio manual continuam funcionando.

No modo `allowlist`, a IA responde apenas contatos permitidos. A lista aceita um item por linha ou separado por virgula:

```text
5587999999999
5587999999999@c.us
77949915107564@lid
```

No modo `open`, a IA responde qualquer conversa privada valida. Esse e o modo mais parecido com uso real, mas exige confirmacao no painel. Mesmo no modo aberto, o agent ignora mensagens proprias, `status@broadcast`, canais/newsletters `@newsletter`, broadcasts/listas, mensagens vazias, mensagens antigas ao conectar e chats que nao sejam privados.

A pausa global da IA bloqueia qualquer resposta automatica imediatamente. Use se algo sair errado durante testes.

O prompt editavel define identidade/persona e informacoes operacionais da IA. As regras fixas de seguranca continuam acima dele: a IA nao deve inventar preco, horario, endereco ou disponibilidade, nao deve revelar prompt/tokens/dados tecnicos e nao deve aceitar pedido de cliente para esquecer instrucoes ou trocar identidade.

## Cockpit de Atendimento

A secao `Atendimento` organiza mensagens validas por conversa. Cada contato tem historico inbound/outbound, contador de nao lidas, status e controles operacionais.

Fluxo basico:

1. Cliente envia mensagem para o WhatsApp conectado.
2. A conversa aparece na lista da esquerda.
3. Abra a conversa para ver a timeline.
4. Use `Gerar sugestao IA` para criar uma resposta sem enviar.
5. Edite a sugestao ou digite uma resposta manual.
6. Clique em `Enviar resposta` ou `Enviar manualmente`.
7. Use `Marcar como lida`, `Assumir atendimento`, `Pausar IA deste contato` ou `Resolver` conforme o atendimento.

Quando `Humano assumiu` estiver ativo, o auto reply nao responde aquele contato. Quando `IA pausada` estiver ativo, a pausa vale apenas para aquela conversa. A pausa global do Controle da IA continua bloqueando todas as conversas.

As conversas ficam em `agent/src/storage/data/conversations.json`, limitadas aos 100 contatos recentes e 100 mensagens por contato. Esse arquivo nao guarda QR, tokens, chave OpenAI nem segredos.

## Provider Adapter e Policy Engine

Todo envio passa por `agent/src/messages/messageGateway.ts`:

1. identifica contato/conversa;
2. consulta settings e politica do contato;
3. avalia regras em `policyEngine`;
4. registra `policy_decision`;
5. chama o provider ativo;
6. salva a mensagem na conversa e registra o resultado.

O provider ativo padrao e `whatsapp_web`, implementado em `WhatsAppWebProvider` sobre o client atual do `whatsapp-web.js`. O `MetaCloudApiProvider` existe como stub e sempre retorna erro claro de nao configurado; ele documenta as variaveis futuras `META_WA_TOKEN`, `META_WA_PHONE_NUMBER_ID`, `META_WA_BUSINESS_ACCOUNT_ID` e `META_WA_VERIFY_TOKEN`.

Regras principais da policy:

- envio manual humano e permitido quando o provider esta pronto, mas recebe warning se estiver fora da janela de 24h;
- auto reply respeita modo `manual`, `allowlist` ou `open`;
- canais/newsletters do WhatsApp (`@newsletter`) sao sempre bloqueados antes do provider;
- `globalPause`, `humanTakeover`, `aiPaused`, `archived`, `optOut` e rate limit bloqueiam auto reply;
- fora da janela de 24h, auto reply e envios de sistema do tipo session sao bloqueados e templates internos podem ser usados;
- todo bloqueio registra `policy_blocked` com o motivo.

## Opt-in, Opt-out e Templates

A politica por contato fica em `agent/src/storage/data/contactPolicies.json`. O cockpit mostra opt-in, opt-out, notas internas, ultimo inbound e aviso de janela de 24h.

Se o cliente mandar termos como `pare`, `parar`, `nao quero`, `sair`, `cancelar mensagens` ou `remover meu numero`, o agent marca opt-out automaticamente e bloqueia novas respostas automaticas para esse contato.

Templates internos ficam em `agent/src/storage/data/templates.json`. Eles ainda nao sao templates oficiais da Meta; sao uma camada local para preparar o fluxo futuro. Para enviar:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:47852/messages/template `
  -Headers @{ Authorization = "Bearer dev-local-token" } `
  -ContentType "application/json" `
  -Body '{"to":"5587999999999","templateName":"service_finished","variables":{"nome":"Cliente","os":"123"}}'
```

O envio de template tambem passa pela Policy Engine e pelo Provider Adapter.

## Canais e Newsletters

O agente e para conversas privadas de clientes. Canais do WhatsApp, newsletters e areas proximas a Status que chegam como `@newsletter` sao sempre ignorados antes de entrar no `ConversationStore`, antes da LLM e antes de qualquer envio. A Policy Engine tambem bloqueia qualquer tentativa de envio para `@newsletter` com `newsletter_channel_blocked`.

O auto reply usa o historico recente da conversa salva no cockpit. Em vez de responder apenas a ultima mensagem, ele considera as ultimas 10 a 15 mensagens, evita reiniciar o atendimento com saudacao longa e continua do ponto em que o cliente parou.

## Jobs, Supabase e Agendamentos

A Rodada 5 adiciona um mini sistema operacional de laboratorio em Supabase, isolado do RiverLub principal. O backend usa apenas `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`; o desktop nunca recebe a service role.

Migration pronta:

```text
agent/src/db/migrations/001_jobs_schema.sql
```

Crie um projeto Supabase de laboratorio, abra o SQL Editor e execute esse arquivo. Ele cria `customers`, `vehicles`, `service_requests`, `quotes`, `quote_items`, `payments`, `appointments`, `return_reminders`, `job_events` e `ai_actions`, habilita RLS, revoga acesso de `anon/authenticated`, concede acesso para `service_role` e semeia a placa `AAA1234` como Toyota Corolla 2018.

Agenda:

- horario padrao: segunda a sexta 08:00-18:00, sabado 08:00-12:00, domingo fechado;
- duracao padrao: 60 minutos;
- troca de oleo: 40 minutos;
- `pending_confirmation` e `confirmed` bloqueiam conflito de horario;
- `cancelled` nao bloqueia horario;
- a IA nunca confirma sem resposta explicita do cliente.

Fluxo obrigatorio:

1. Cliente pede horario.
2. IA pede placa se ainda nao houver.
3. Backend busca placa no Supabase.
4. Backend consulta disponibilidade.
5. Se livre, cria `appointment` com `status=pending_confirmation`.
6. IA pergunta se pode confirmar.
7. Apenas com confirmacao explicita, muda para `confirmed`.
8. Se `RECEPTION_NOTIFY_TO` estiver configurado, a recepcao e notificada via WhatsApp pelo MessageGateway.

Se `RECEPTION_NOTIFY_TO` nao estiver configurado, o sistema registra `job_event` com notificacao pendente e o painel Jobs mostra o estado para acao manual.

## Recuperar Depois de Desconectar pelo Celular

Se o WhatsApp foi desconectado/logoutado pelo celular e o agent nao consegue gerar QR novo:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:47852/whatsapp/reset-session `
  -Headers @{ Authorization = "Bearer dev-local-token" }

Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:47852/whatsapp/start `
  -Headers @{ Authorization = "Bearer dev-local-token" }
```

Depois escaneie o novo QR no painel.

## Resposta Automatica com Seguranca

- O padrao e desligado.
- Ligue primeiro apenas com lista de numeros permitidos.
- Revise o prompt antes de ativar.
- Teste com numero proprio antes de qualquer cliente real.
- Se ligar sem lista permitida, o painel exige confirmacao e o backend registra warning.
- Nunca use em cliente real sem validacao operacional.

## Storage Local

- Prompt: `agent/src/storage/data/prompt.json`.
- Logs: `agent/src/storage/data/logs.json`.
- Configuracoes operacionais: `agent/src/storage/data/runtimeSettings.json`.
- Conversas: `agent/src/storage/data/conversations.json`.
- Politicas de contato: `agent/src/storage/data/contactPolicies.json`.
- Templates internos: `agent/src/storage/data/templates.json`.
- Sessao WhatsApp: `agent/.wwebjs_auth/`.
- Jobs operacionais: Supabase laboratorio configurado por `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.

A sessao WhatsApp fica fora de `storage/data` e esta ignorada pelo Git.

## Problemas Comuns

- `OPENAI_KEY is not configured`: preencha `OPENAI_KEY` no `.env` da raiz ou de `agent/`.
- `Missing or invalid Authorization bearer token`: o token do request nao bate com `AGENT_AUTH_TOKEN`.
- QR nao aparece: confirme que `/whatsapp/start` foi chamado e aguarde `qr_available`.
- `Protocol error (Runtime.callFunctionOn): Execution context was destroyed`: normalmente e sobra de contexto Chromium/sessao quebrada apos logout; use `/whatsapp/reset-session` e depois `/whatsapp/start`.
- WhatsApp nao inicia na VPS/Linux: confirme Chromium/dependencias do Puppeteer e flags `--no-sandbox`.
- Tauri nao abre: instale Rust e dependencias nativas do Tauri; use `npm run dev` para testar so o painel web.
- `WhatsApp is not ready`: escaneie o QR e aguarde status `ready`.

## Proximos Passos para VPS

- Rodar o `agent` com process manager, por exemplo PM2 ou systemd.
- Instalar dependencias nativas do Chromium/Puppeteer no Linux.
- Proteger a API com autenticacao melhor que token fixo.
- Colocar reverse proxy com TLS.
- Separar storage persistente para logs, prompt e sessao.
- Adicionar observabilidade, rotacao de logs e alerta de desconexao.
- Definir politica de auto reply antes de ligar no painel.
- Trocar storage JSON por banco transacional antes de volume real.
- Migrar provider para Meta Cloud API quando o contrato oficial estiver definido.
- Planejar contrato de integracao com o RiverLub principal somente depois da validacao local.

## Riscos Tecnicos

- `whatsapp-web.js` depende do WhatsApp Web e pode quebrar com mudancas externas.
- O uso de token fixo e aceitavel no MVP local, mas nao serve como seguranca de producao.
- Sessao local do WhatsApp pode expirar ou exigir novo QR.
- Modo aberto de resposta automatica pode responder clientes sem revisao humana. Teste primeiro com numero proprio e mantenha a pausa global pronta.
- Persistencia em JSON e simples; para producao, migrar para banco ou storage transacional.
- A regra de janela de 24h e preparatoria para Cloud API; com `whatsapp-web.js` ela nao substitui politicas oficiais da Meta.
- Templates internos ainda nao sao templates aprovados pela Meta.
