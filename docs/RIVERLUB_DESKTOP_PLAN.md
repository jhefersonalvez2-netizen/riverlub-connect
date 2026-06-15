# RiverLub Desktop - plano inicial

## Objetivo

Transformar o `riverlub-connect` em uma base profissional do **RiverLub Desktop**, preservando o WhatsApp Connect atual e abrindo espaco para Brain, Cockpit, Sistema e Diagnosticos locais.

Esta etapa e propositalmente conservadora: cria a estrutura visual e tecnica sem alterar o web RiverLub, sem trocar o agente WhatsApp atual e sem expor credenciais privilegiadas.

## Estado atual auditado

- App Tauri v2 em `riverlub-connect`.
- Frontend React/Vite em `src/`.
- Runtime WhatsApp atual preservado em `127.0.0.1:47851`.
- Comandos Tauri atuais:
  - `local_agent_health`
  - `local_agent_qr`
  - `disconnect_agent_session`
  - `agent_process_status`
  - `start_agent_process`
  - `stop_agent_process`
  - `restart_agent_process`
  - `cleanup_runtime_orphans`
  - `read_agent_logs`
  - `clear_agent_logs`
  - `reset_agent_test_session`
  - `open_external_url`
- Produto Tauri renomeado visualmente para RiverLub Desktop.
- Identificador mantido como `br.com.riverlub.connect` para compatibilidade com instalacoes/protocolo existentes.

## Estrutura criada

```text
src/modules/whatsapp
src/modules/brain
src/modules/cockpit
src/modules/system
src/modules/diagnostics
src/lib/localAgentClient.js
src/lib/desktopDataProvider.js
```

## Modulos

### WhatsApp

O modulo atual continua operacional no `App.jsx` nesta primeira etapa. Ele segue usando o agente local existente e os comandos Tauri ja aprovados.

Proxima etapa: extrair a tela WhatsApp para `src/modules/whatsapp/WhatsAppModule.jsx`, depois de validar que a navegacao nova nao afetou pareamento, logs e controle de processo.

### Brain

Tela inicial criada com:

- status da IA;
- modo manual como padrao;
- pausa global ativa;
- grupos bloqueados;
- aviso de envio somente com aprovacao humana;
- prompt operacional visual;
- logs iniciais.

O Brain ainda nao envia mensagens e nao executa automacao perigosa.

### Cockpit

Tela inicial criada para:

- fila de conversas;
- atendimento humano;
- opt-out;
- detalhe de conversa vazio ate conectar o Brain Agent.

Sem envio automatico nesta etapa.

### Sistema

Tela inicial criada para:

- status dos modulos;
- politica de dados;
- fronteira Supabase/backend;
- resumo de seguranca.

### Diagnosticos

Tela inicial criada para:

- endpoints locais previstos;
- verificacao de ambiente;
- guarda de build contra service role e chaves privadas no desktop;
- checklist de riscos.

## Politica de IA

Padrao obrigatorio nesta etapa:

- `AUTO_REPLY=false`;
- modo manual;
- aprovacao humana antes do envio;
- grupos bloqueados;
- opt-out obrigatorio;
- tomada humana pausa IA;
- logs obrigatorios;
- allowlist antes de qualquer modo mais aberto.

Modo aberto deve exigir nova etapa de produto, revisao de seguranca e protecao por oficina.

## Politica Supabase

Regra central:

> `SUPABASE_SERVICE_ROLE_KEY` nunca deve entrar no desktop distribuido, frontend, Tauri UI, `.env.example` publico ou bundle.

O desktop pode ter, no maximo:

- `VITE_SUPABASE_URL`;
- `VITE_SUPABASE_ANON_KEY`;
- acesso anonimo somente com RLS forte.

Operacoes privilegiadas devem passar por:

- backend seguro do RiverLub;
- agente local protegido, quando houver desenho formal de autenticacao local.

## Plano de proximas etapas

1. Extrair WhatsApp para componente modular sem alterar comportamento.
2. Definir contrato do Brain Agent em `127.0.0.1:47852`.
3. Conectar Cockpit a conversas reais somente leitura.
4. Adicionar controles de prompt/politica persistidos no backend seguro.
5. Implementar allowlist e opt-out reais.
6. Criar migracoes/RLS somente depois da revisao documentada em `SUPABASE_DESKTOP_AUDIT.md`.
7. Adicionar testes de runtime Tauri em Windows limpo.

## Como rodar

```powershell
npm install
npm run dev
npm run build:ui
```

Para build Tauri completo:

```powershell
npm run tauri:build
```

## Garantia desta etapa

- Nenhuma mudanca incompatavel no web RiverLub.
- Nenhuma migracao aplicada.
- Nenhum backend alterado.
- WhatsApp Connect atual preservado.
- Service role nao adicionada ao desktop.
