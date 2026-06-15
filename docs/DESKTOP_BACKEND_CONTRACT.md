# Desktop Backend Contract

Este contrato descreve rotas futuras para o RiverLub Desktop consumir dados reais sem embutir o web em iframe e sem acesso privilegiado direto ao Supabase.

Nenhuma rota abaixo foi implementada nesta etapa. Nao aplicar migrations sem revisao separada.

## Regras gerais

- Todas as rotas devem passar pelo backend seguro.
- Autenticacao obrigatoria por sessao/token RiverLub.
- Escopo por `oficina_id` em todas as consultas.
- Nao aceitar `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` ou `OPENAI_API_KEY` no desktop.
- Retornar apenas dados necessarios para a tela nativa.
- Registrar auditoria em acoes sensiveis.
- Manter rotas web existentes sem quebra.

## Overview

```text
GET /desktop/overview
```

Finalidade: resumo central do Desktop: status operacional, indicadores principais, avisos locais e atalhos.

Origem dos dados: agregacoes seguras do backend.

Tabelas provaveis: `ordens_servico`, `clientes`, `veiculos`, `estoque_itens`, `financeiro_recebiveis`, `whatsapp_agentes`.

Riscos: vazamento de resumo financeiro ou dados de outra oficina.

Autenticacao: obrigatoria, com `oficina_id`.

Backend seguro: sim.

## Customers

```text
GET /desktop/customers
GET /desktop/customers/:id
GET /desktop/customers/:id/vehicles
```

Finalidade: listar, buscar e detalhar clientes e seus veiculos.

Origem dos dados: cadastro RiverLub.

Tabelas provaveis: `clientes`, `veiculos`, `ordens_servico`.

Riscos: telefone, historico e dados pessoais.

Autenticacao: obrigatoria; limitar por oficina.

Backend seguro: sim.

## Vehicles

```text
GET /desktop/vehicles
GET /desktop/vehicles/:id
```

Finalidade: consulta de veiculos por placa, cliente, modelo e historico.

Origem dos dados: cadastro RiverLub e cache de placa quando permitido.

Tabelas provaveis: `veiculos`, `clientes`, `cache_placas`, `ordens_servico`.

Riscos: placas, chassi e vinculo com cliente.

Autenticacao: obrigatoria; limitar por oficina.

Backend seguro: sim.

## Service Orders

```text
GET /desktop/service-orders
GET /desktop/service-orders/:id
POST /desktop/service-orders
PUT /desktop/service-orders/:id
```

Finalidade: abrir, consultar e atualizar O.S. no fluxo desktop.

Origem dos dados: fluxo operacional RiverLub.

Tabelas provaveis: `ordens_servico`, `os_itens`, `os_fluidos`, `logs_os`, `clientes`, `veiculos`.

Riscos: mudanca indevida de status, valores, itens e dados incompletos.

Autenticacao: obrigatoria; respeitar permissoes de ADMIN, ATENDENTE e MECANICO.

Backend seguro: sim.

## Quotes

```text
GET /desktop/quotes
GET /desktop/quotes/:id
POST /desktop/quotes
POST /desktop/quotes/:id/approve
POST /desktop/quotes/:id/reject
```

Finalidade: listar, criar e aprovar/rejeitar orcamentos em fluxo nativo.

Origem dos dados: comercial/orcamentos RiverLub.

Tabelas provaveis: `orcamentos`, `orcamento_itens`, `ordens_servico`, `clientes`, `veiculos`.

Riscos: aprovacao indevida, valores divergentes e duplicidade por versao.

Autenticacao: obrigatoria; auditar aprovar/rejeitar.

Backend seguro: sim.

## Stock

```text
GET /desktop/stock/summary
GET /desktop/stock/items
GET /desktop/stock/movements
```

Finalidade: consultar itens, resumo e movimentos de estoque.

Origem dos dados: estoque RiverLub.

Tabelas provaveis: `estoque_itens`, `estoque_movimentacoes`.

Riscos: custo/margem visivel por perfil, baixa indevida e divergencia offline.

Autenticacao: obrigatoria; permissao por perfil.

Backend seguro: sim.

## Finance

```text
GET /desktop/finance/summary
GET /desktop/finance/payments
POST /desktop/finance/payments
```

Finalidade: recebiveis, pagamentos recebidos, saldo em aberto e fluxo de caixa.

Origem dos dados: financeiro RiverLub.

Tabelas provaveis: `financeiro_recebiveis`, `financeiro_pagamentos`, `ordens_servico`, `clientes`.

Riscos: exposicao financeira, baixa indevida e recibos.

Autenticacao: obrigatoria; auditar registro de pagamento.

Backend seguro: sim.

## Cockpit

```text
GET /desktop/cockpit/conversations
GET /desktop/cockpit/conversations/:id
POST /desktop/cockpit/conversations/:id/suggest
POST /desktop/cockpit/conversations/:id/send-approved
POST /desktop/cockpit/conversations/:id/human-takeover
```

Finalidade: conversas, sugestoes da IA, envio aprovado e tomada humana.

Origem dos dados: WhatsApp Agent, Brain Agent e backend RiverLub.

Tabelas provaveis: `whatsapp_agent_jobs`, `whatsapp_agentes`, `notificacoes_cliente`, futuras tabelas de conversas e `ai_actions`.

Riscos: envio automatico indevido, dados pessoais em conversa e opt-out.

Autenticacao: obrigatoria; aprovacao humana para `send-approved`.

Backend seguro: sim.

## Brain

```text
GET /desktop/brain/settings
PUT /desktop/brain/settings
```

Finalidade: ler e configurar politicas da IA, prompt, allowlist e pausa global.

Origem dos dados: backend seguro ou agente Brain protegido.

Tabelas provaveis: futuras tabelas de configuracao da IA, `ai_actions`, auditoria.

Riscos: ativar automacao aberta sem governanca.

Autenticacao: obrigatoria; permissao ADMIN para alterar politica.

Backend seguro: sim.

## Diagnostics

```text
GET /desktop/diagnostics
```

Finalidade: consolidar diagnostico seguro do desktop, agentes locais, versoes e integracoes.

Origem dos dados: backend seguro e agentes locais.

Tabelas provaveis: `whatsapp_agentes`, `whatsapp_agent_jobs`, auditoria futura.

Riscos: expor tokens, QR, paths sensiveis ou segredo local.

Autenticacao: obrigatoria; sanitizar respostas.

Backend seguro: sim.
