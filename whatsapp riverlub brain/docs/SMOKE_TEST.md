# Smoke Test Local - riverlub-whatsapp-brain

Este checklist valida o fluxo real do MVP local antes de qualquer VPS. Nao envie mensagem real sem intencao clara; use primeiro `/test/llm`.

## 1. Preparar ambiente

Confirme o `.env` na raiz ou em `agent/.env`:

```env
OPENAI_KEY=
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

Confirme `desktop/.env.local`:

```env
VITE_API_BASE_URL=http://localhost:47852
VITE_AGENT_AUTH_TOKEN=dev-local-token
```

## 2. Subir agent

```powershell
cd agent
npm install
npm run dev
```

Validar health:

```powershell
Invoke-RestMethod http://localhost:47852/health
```

Resultado esperado:

- `ok: true`
- `service: riverlub-whatsapp-brain-agent`
- `whatsapp.status` inicialmente `stopped`

Validar debug seguro:

```powershell
Invoke-RestMethod `
  -Uri http://localhost:47852/debug/state `
  -Headers @{ Authorization = "Bearer dev-local-token" }
```

Resultado esperado:

- `env.hasOpenAIKey: true`
- `env.hasAuthToken: true`
- nao retornar `OPENAI_KEY` nem `AGENT_AUTH_TOKEN`
- `storage.promptExists: true`
- `settings.autoReplyMode: manual` em modo seguro
- `settings.globalPause: false`
- `provider.activeProvider: whatsapp_web`
- `policy.templatesCount` presente
- `policy.contactPoliciesCount` presente
- `jobs.supabaseConfigured` presente

## 3. Abrir desktop

Em outro terminal:

```powershell
cd desktop
npm install
npm run tauri:dev
```

Se Tauri falhar por dependencia nativa, use:

```powershell
npm run dev
```

Abra `http://localhost:1420`.

Resultado esperado:

- card do agent mostra `online`
- se token estiver errado, painel mostra erro amigavel de token
- se agent estiver desligado, painel mostra `Agent offline`

## 3.1. Validar controle da IA

No painel, abra `Controle da IA`.

Resultado esperado:

- `Modo de resposta da IA` em `Manual / Seguro` por padrao.
- `Permitir grupos` desligado por padrao; auto reply deve seguir apenas para conversas privadas validas.
- `Ignorar mensagens antigas ao conectar` ligado por padrao.
- Se escolher `Automatico aberto`, o painel exige marcar a confirmacao.
- `Pausa global da IA` bloqueia respostas automaticas sem desconectar WhatsApp.
- `Restaurar modo seguro` volta para `manual`, lista vazia e pausa desligada.

Por API:

```powershell
Invoke-RestMethod `
  -Uri http://localhost:47852/settings `
  -Headers @{ Authorization = "Bearer dev-local-token" }
```

## 4. Gerar QR

No painel, clique em `Iniciar WhatsApp`.

Resultado esperado:

- botao mostra loading
- `/whatsapp/start` responde com `reason: started` ou `already_initializing`
- status muda para `initializing` e depois `qr_available`
- QR aparece no painel

Tambem pode validar por API:

```powershell
Invoke-RestMethod http://localhost:47852/whatsapp/qr
```

## 5. Escanear QR

No celular:

1. Abra WhatsApp.
2. Va em aparelhos conectados.
3. Escaneie o QR do painel.

Resultado esperado:

- status muda para `authenticated`
- depois muda para `ready`
- QR some do painel e aparece `WhatsApp conectado`

Validar:

```powershell
Invoke-RestMethod http://localhost:47852/whatsapp/status
```

## 6. Testar OpenAI sem WhatsApp

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:47852/test/llm `
  -Headers @{ Authorization = "Bearer dev-local-token" } `
  -ContentType "application/json" `
  -Body '{"message":"Cliente pergunta se voces fazem troca de oleo hoje."}'
```

Resultado esperado:

- `ok: true`
- `reply` com resposta
- log `llm_response`

Se `OPENAI_KEY` estiver ausente, resultado esperado:

- HTTP `503`
- erro claro dizendo que `OPENAI_KEY` nao esta configurada
- log `error`

## 7. Testar envio manual

Use um numero real somente se quiser enviar mensagem real.

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:47852/whatsapp/send `
  -Headers @{ Authorization = "Bearer dev-local-token" } `
  -ContentType "application/json" `
  -Body '{"to":"+55 (87) 99999-9999","message":"Teste local RiverLub WhatsApp Brain."}'
```

Resultado esperado:

- log `send_attempt`
- se WhatsApp estiver `ready`, log `message_sent`
- se numero for invalido, erro amigavel e log `error`

## 8. Testar recebimento

Envie uma mensagem de outro WhatsApp para o numero conectado.

Resultado esperado:

- painel atualiza logs sem reiniciar
- log `message_received`
- com `autoReplyMode: manual`, nenhuma resposta automatica e enviada
- `status@broadcast`, canais/newsletters `@newsletter`, grupos/chats nao privados, broadcasts, mensagens vazias e mensagens antigas nao entram como `message_received`

## 8.1. Testar cockpit de Atendimento

Depois de receber uma mensagem valida:

1. Abra a secao `Atendimento`.
2. Confirme que a conversa apareceu na coluna esquerda.
3. Confirme que `unreadCount` aumentou.
4. Abra a conversa.
5. Confirme que as mensagens aparecem em ordem na timeline.
6. Clique em `Marcar como lida`.
7. Confirme que o contador zera.

Por API:

```powershell
Invoke-RestMethod `
  -Uri http://localhost:47852/conversations `
  -Headers @{ Authorization = "Bearer dev-local-token" }
```

Para gerar sugestao sem enviar:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:47852/conversations/CONTACT_ID_ENCODED/suggest" `
  -Headers @{ Authorization = "Bearer dev-local-token" } `
  -ContentType "application/json" `
  -Body '{"extraInstruction":"responda de forma curta"}'
```

Resultado esperado:

- `draftSuggestion` salvo na conversa
- log `llm_response` com `source: conversation_suggestion`
- nenhuma mensagem enviada automaticamente

No painel:

1. Edite a sugestao no textarea.
2. Clique em `Enviar resposta`.
3. Confirme outbound manual na timeline.
4. Confirme log `manual_conversation_message_sent`.
5. Clique em `Assumir atendimento`.
6. Envie nova mensagem do cliente.
7. Confirme que nao ha auto reply e que aparece `ignored_human_takeover`.
8. Desative humano e clique em `Pausar IA deste contato`.
9. Envie nova mensagem do cliente.
10. Confirme `ignored_contact_ai_paused`.
11. Clique em `Resolver` e confirme status `Resolvida`.

## 8.2. Testar Policy Engine no cockpit

Com uma conversa selecionada em `Atendimento`:

1. Envie uma resposta manual.
2. Confirme log `policy_decision` com `reason: manual_send_allowed` ou `outside_24h_window_manual_warning`.
3. Confirme log `provider_send_result`.
4. Marque `Humano assumiu`.
5. Envie mensagem do cliente em modo `open`.
6. Confirme `policy_blocked` com `reason: human_takeover` e sem resposta automatica.
7. Desmarque humano, ative `Pausar IA deste contato` e repita.
8. Confirme `policy_blocked` com `reason: contact_ai_paused`.

Para canais/newsletters:

1. Se aparecer evento com `from` ou `to` terminando em `@newsletter`, confirme log `message_ignored`.
2. O `reason` deve ser `ignored_newsletter_channel`.
3. Nao deve aparecer `message_received`, `llm_response` nem `message_sent`.
4. Uma tentativa de envio para `@newsletter` deve gerar `policy_blocked` com `reason: newsletter_channel_blocked`.

Na secao `Politica do contato`:

1. Marque `Opt-out` e salve.
2. Envie nova mensagem do cliente.
3. Confirme que auto reply nao responde e aparece `policy_blocked` com `reason: opted_out`.
4. Marque `Opt-in`.
5. Confirme que opt-out foi limpo.

Para opt-out automatico:

1. Cliente envia `pare`.
2. Confirme log `opt_out_detected`.
3. Confirme `GET /contacts/CONTACT_ID/policy` com `optOut: true`.

## 8.3. Testar janela de 24h e template interno

Para simular fora da janela, edite manualmente `lastInboundAt` da conversa em `agent/src/storage/data/conversations.json` para uma data com mais de 24h e reinicie o agent.

Resultado esperado:

- auto reply fica bloqueado com `outside_24h_window_template_required`;
- envio manual humano ainda e permitido com warning;
- envio por template interno pode ser permitido.

Enviar template:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:47852/messages/template `
  -Headers @{ Authorization = "Bearer dev-local-token" } `
  -ContentType "application/json" `
  -Body '{"to":"CONTACT_ID_OU_NUMERO","templateName":"service_finished","variables":{"nome":"Cliente","os":"123"}}'
```

Resultado esperado:

- `policy_decision` com `reason: template_allowed`;
- log `template_sent`;
- mensagem aparece na timeline como `Template`.

## 8.4. Testar Jobs e Supabase

Antes:

1. Crie um projeto Supabase de laboratorio.
2. Cole e execute `agent/src/db/migrations/001_jobs_schema.sql` no SQL Editor.
3. Configure `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` no `.env` do agent.
4. Opcionalmente configure `RECEPTION_NOTIFY_TO` com o numero interno da recepcao.
5. Reinicie o agent.

Health:

```powershell
Invoke-RestMethod `
  -Uri http://localhost:47852/jobs/health `
  -Headers @{ Authorization = "Bearer dev-local-token" }
```

Placa de teste:

```powershell
Invoke-RestMethod `
  -Uri http://localhost:47852/jobs/vehicles/by-plate/AAA1234 `
  -Headers @{ Authorization = "Bearer dev-local-token" }
```

Resultado esperado: Toyota Corolla 2018.

Disponibilidade:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:47852/jobs/appointments/availability?datetime=2026-05-27T09:00:00-03:00&serviceType=troca_de_oleo" `
  -Headers @{ Authorization = "Bearer dev-local-token" }
```

Criar agendamento pendente:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:47852/jobs/appointments `
  -Headers @{ Authorization = "Bearer dev-local-token" } `
  -ContentType "application/json" `
  -Body '{"scheduledAt":"2026-05-27T09:00:00-03:00","serviceType":"troca_de_oleo","conversationContactId":"test@lid"}'
```

Resultado esperado:

- se livre: `status=pending_confirmation`;
- se ocupado: HTTP 409 com `slot_conflict`;
- fora do expediente: HTTP 409 com `outside_business_hours`.

Fluxo da IA:

1. Cliente: `quero agendar troca de oleo`.
2. IA: pede placa.
3. Cliente: `AAA1234`.
4. IA: encontra Corolla 2018 e pede dados de horario.
5. Cliente: `e esse mesmo, amanha 9h`.
6. Sistema cria `pending_confirmation` se houver disponibilidade.
7. IA pergunta se pode confirmar.
8. Cliente: `pode confirmar`.
9. Sistema muda para `confirmed`.
10. Se `RECEPTION_NOTIFY_TO` estiver configurado e WhatsApp pronto, recepcao recebe notificacao.

Painel:

- a secao `Jobs` deve mostrar health do Supabase;
- busca `AAA1234`;
- lista agendamentos `pending_confirmation`, `confirmed` e `cancelled`;
- permite confirmar, cancelar e notificar recepcao manualmente.

## 9. Testar persistencia LocalAuth

1. Pare o agent com `Ctrl+C`.
2. Suba novamente:

```powershell
cd agent
npm run dev
```

3. Clique em `Iniciar WhatsApp` se necessario.

Resultado esperado:

- sessao em `agent/.wwebjs_auth/` e reaproveitada
- status deve chegar em `ready` sem novo QR, se o WhatsApp ainda considerar a sessao valida

Se novo QR aparecer, a sessao expirou ou foi removida no WhatsApp.

## 9.1. Recuperar depois de desconectar pelo celular

Quando o WhatsApp for removido em `Aparelhos conectados`, use:

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

Resultado esperado:

- estado volta para `stopped`
- sessao `agent/.wwebjs_auth` e removida
- novo `/whatsapp/start` gera QR novo

## 10. Confirmar ausencia de duplicacao

Chame start varias vezes:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:47852/whatsapp/start `
  -Headers @{ Authorization = "Bearer dev-local-token" }
```

Resultado esperado:

- se ja pronto: `reason: already_ready`
- se iniciando ou aguardando QR: `reason: already_initializing`
- nao criar multiplos clients
- nao duplicar eventos de uma mesma mensagem

## 11. Smoke script opcional

Com o agent ja rodando:

```powershell
cd agent
npm run smoke
```

Esse script valida `/health` e `/debug/state`.

## 12. Usar resposta automatica com seguranca

### Manual

1. Selecione `Manual / Seguro`.
2. Envie uma mensagem de cliente.
3. Confirme `message_received`.
4. Confirme que nao aparece `llm_response` com `source: auto_reply`.

### Automatico apenas permitidos

1. Revise o prompt.
2. Teste `/test/llm`.
3. Se o WhatsApp entregar remetente como `@lid`, copie o `from` do log `message_received`.
4. Adicione em `Permitidos` o numero, `@c.us` ou `@lid`, um por linha.
5. Selecione `Automatico apenas permitidos`.
6. Salve.
7. Envie mensagem do contato permitido.
8. Confirme `llm_response`, `message_sent` e `auto_reply_sent`.
9. Remova o permitido, salve e envie outra mensagem.
10. Confirme `message_ignored` com `reason: ignored_not_in_allowlist`.

### Automatico aberto

1. Selecione `Automatico aberto`.
2. Marque a confirmacao obrigatoria.
3. Salve.
4. Envie mensagem de uma conversa privada qualquer.
5. Confirme `llm_response`, `message_sent` e `auto_reply_sent`.
6. Envie ou simule mensagem de canal/newsletter `@newsletter`.
7. Confirme `message_ignored` com `reason: ignored_newsletter_channel`.
8. Envie mensagem de grupo/chat nao privado.
9. Confirme que nao ha auto reply.

### Memoria do auto reply

1. Em modo `open` ou `allowlist` permitido, cliente manda `Oi`.
2. Cliente manda `Meu carro e um Corolla 2018`.
3. Cliente manda `qual oleo vai nele?`.
4. Confirme que o `llm_response` considera o historico recente e nao reinicia com saudacao longa.
5. A resposta deve ser cautelosa: usar apenas informacao presente no prompt/base ou dizer que vai confirmar com atendente.

Modo aberto e o mais proximo do uso real, mas deve ser testado primeiro com numero proprio. O prompt precisa estar revisado. Grupos ficam bloqueados por padrao.

### Pausa global

1. Ative `Pausa global da IA`.
2. Envie uma mensagem de cliente.
3. Confirme que nao ha resposta automatica.
4. Confirme `message_ignored` com `reason: ignored_global_pause`.

### Prompt editavel e seguranca

1. Altere a identidade/persona no prompt pelo painel.
2. Teste `/test/llm`.
3. Confirme que a IA usa a identidade configurada.
4. Teste uma mensagem pedindo para esquecer instrucoes ou trocar de identidade.
5. Confirme que as regras fixas de seguranca continuam valendo.
