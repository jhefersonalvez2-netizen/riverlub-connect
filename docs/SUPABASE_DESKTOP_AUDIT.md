# Supabase Desktop Audit

## Regra de seguranca

`SUPABASE_SERVICE_ROLE_KEY` nao pode ser distribuida no RiverLub Desktop.

Motivo: qualquer chave embutida em app desktop, frontend ou bundle pode ser extraida por engenharia reversa. A service role ignora RLS e daria acesso amplo aos dados da oficina.

## Fontes auditadas

- `backend/src/server.js`
- `backend/src/database.js`
- rotas principais do backend RiverLub
- migrations em `backend/sql`
- `whatsapp riverlub brain/README.md`
- `whatsapp riverlub brain/agent/src/db/migrations/001_jobs_schema.sql`
- `riverlub-connect/src-tauri`
- `riverlub-connect/src`

## Modelo atual recomendado

O app web e o desktop devem conversar com o backend RiverLub para dados reais. O backend usa `DATABASE_URL` com `pg` e aplica autenticacao/permissoes nas rotas.

Acesso direto Supabase no desktop, se existir, deve ser limitado a:

- anon key;
- RLS forte;
- leitura estritamente necessaria;
- sem escrita privilegiada;
- sem dados sensiveis fora da oficina/autenticacao.

## Tabelas RiverLub relevantes

| Area | Tabelas |
| --- | --- |
| Auth/oficina | `usuarios`, `oficinas`, `auth_sessoes`, `auth_codigos_email` |
| Cliente/veiculo | `clientes`, `veiculos`, `cache_placas` |
| O.S. | `ordens_servico`, `os_itens`, `os_fluidos`, `logs_os`, `os_interacoes_cliente`, `os_sugestoes_internas` |
| Orcamentos | `orcamentos`, `orcamento_itens` |
| Estoque | `estoque_itens`, `estoque_movimentacoes` |
| Financeiro | `financeiro_recebiveis`, `financeiro_pagamentos` |
| Pagamentos | `pagamentos_contas`, `pagamentos_conta_itens`, `pagamentos_alertas` |
| WhatsApp | `whatsapp_agentes`, `whatsapp_agent_jobs`, `whatsapp_conexoes`, `whatsapp_telefone_verificacoes` |
| Notificacoes | `notificacoes_cliente` |
| IA/catalogos | `ia_consultas_cache`, `ia_consultas_tecnicas`, `ia_feedback_sugestoes`, `catalogo_filtros`, `catalogo_lubrificantes` |

## Tabelas do Brain lab

A migration `001_jobs_schema.sql` do Brain cria uma base isolada de laboratorio:

- `customers`
- `vehicles`
- `service_requests`
- `quotes`
- `quote_items`
- `payments`
- `appointments`
- `return_reminders`
- `job_events`
- `ai_actions`

Ela habilita RLS, revoga anon/authenticated e concede acesso a `service_role`. Isso confirma que o Brain lab foi desenhado para rodar com chave privilegiada somente no agente/backend, nao no desktop UI.

## Operacoes que o Desktop pode precisar

| Operacao | Caminho seguro |
| --- | --- |
| Ler status WhatsApp local | agente local `127.0.0.1:47851` |
| Parear WhatsApp | agente local existente |
| Ler conversas do Brain | Brain Agent local autenticado |
| Sugerir resposta | Brain Agent ou backend seguro |
| Enviar WhatsApp | Connect/Brain Agent com aprovacao humana |
| Registrar opt-out | backend seguro |
| Criar job WhatsApp | backend seguro |
| Ler cliente/veiculo/O.S. | backend API autenticada |
| Editar cliente/veiculo/O.S. | backend API autenticada |
| Consultar catalogos IA | backend API autenticada |

## Anon + RLS versus backend seguro

### Pode ser anon + RLS

Somente se houver politicas que limitem por usuario/oficina e se o dado nao exigir privilegio:

- leitura de configuracoes publicas nao sensiveis;
- telemetria local minima;
- feature flags sem segredo.

### Deve ser backend seguro

- clientes;
- telefones;
- veiculos;
- O.S.;
- financeiro;
- pagamentos;
- jobs WhatsApp;
- logs de atendimento;
- prompt operacional;
- opt-out;
- auditoria.

## RLS/migrations propostas, sem aplicar agora

Nao aplicar migrations nesta etapa. Propostas para revisao futura:

1. Criar tabelas especificas do Desktop/Brain com `oficina_id`, `criado_por`, `criado_em`, `atualizado_em`.
2. Habilitar RLS em todas as tabelas novas.
3. Politicas por `oficina_id` vinculadas ao usuario autenticado.
4. Proibir anon em tabelas sensiveis.
5. Criar views de leitura reduzida para cockpit, se acesso direto for indispensavel.
6. Registrar `ai_actions` com estado `SUGERIDA`, `APROVADA`, `ENVIADA`, `CANCELADA`.
7. Auditar prompt e alteracoes de politica por usuario.
8. Indexar `oficina_id`, `telefone`, `status`, `criado_em` e chaves de conversa.

## Variaveis permitidas no desktop

Permitidas:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_RIVERLUB_BRAIN_AGENT_URL
VITE_RIVERLUB_WEB_URL
```

Proibidas:

```text
SUPABASE_SERVICE_ROLE_KEY
VITE_SUPABASE_SERVICE_ROLE_KEY
SERVICE_ROLE_KEY
DATABASE_URL
OPENAI_API_KEY
```

Essas variaveis pertencem ao backend seguro ou agente local protegido, nunca ao bundle React/Tauri UI.

## Conclusao

A base Desktop desta etapa esta correta se:

- o WhatsApp Connect atual continua funcionando;
- Brain/Cockpit aparecem apenas como estrutura segura;
- nao existe service role no desktop;
- nenhuma migration foi aplicada;
- dados reais continuam passando pelo backend/API ou agente local apropriado.
