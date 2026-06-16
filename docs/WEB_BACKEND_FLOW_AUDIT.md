# Auditoria do fluxo web/backend para RiverLub Desktop

## Escopo

Esta auditoria documenta como o RiverLub Web e o backend funcionam hoje para orientar a proxima etapa do RiverLub Desktop.

Nao foi implementado nesta etapa:

- tela de login no Tauri;
- conexao de telas reais do Desktop;
- endpoint novo;
- alteracao de backend;
- alteracao de web;
- migration;
- mudanca no WhatsApp Connect.

## Fontes auditadas

### Frontend web

Arquivos principais lidos:

- `src/app/login/page.js`
- `src/lib/auth.js`
- `src/lib/http.js`
- `src/lib/navigation.js`
- `src/components/AppPageShell.js`
- `src/components/AppSidebar.js`
- `src/components/AppTopbar.js`
- `src/app/page.js`
- `src/app/fila/page.js`
- `src/app/cadastro/page.js`
- `src/app/os/page.js`
- `src/app/os/[id]/page.js`
- `src/app/clientes/page.js`
- `src/app/veiculos/page.js`
- `src/app/orcamentos/page.js`
- `src/app/estoque/page.js`
- `src/app/financeiro/page.js`
- `src/app/whatsapp/page.js`
- `src/app/configuracoes/page.js`
- `src/app/acessos/page.js`
- `src/app/pagamentos/page.js`
- shared modules de `financeiro`, `estoque`, `fluidos`, `relatorios` e `notificacoes`.

### Backend

Arquivos principais lidos:

- `src/server.js`
- `src/routes/auth.js`
- `src/middlewares/auth.js`
- `src/services/authCore.js`
- `src/services/authEmail.js`
- `src/routes/dashboard.js`
- `src/routes/clientes.js`
- `src/routes/os.js`
- `src/routes/osCadastroEdicao.js`
- `src/routes/osCancelamento.js`
- `src/routes/osExclusao.js`
- `src/routes/osItensOperacional.js`
- `src/routes/estoque.js`
- `src/routes/estoqueImportacao.js`
- `src/routes/financeiro.js`
- `src/routes/pagamentos.js`
- `src/routes/whatsapp.js`
- `src/routes/configuracoes.js`
- `src/routes/orcamentosAvulsos.js`
- `src/routes/notificacoes.js`
- `src/routes/ia.js`
- `src/routes/comercial.js`
- `src/routes/relatorios.js`
- `src/routes/fluidos.js`
- `src/routes/placa.js`
- `src/routes/auditoria.js`

### Desktop

Arquivos conferidos:

- `src/lib/riverlubApiClient.js`
- `src/lib/desktopDataProvider.js`
- `src/modules/diagnostics/DiagnosticsModule.jsx`
- `src/desktop/desktopNavigation.js`
- `docs/DESKTOP_BACKEND_INTEGRATION.md`

## Resumo da arquitetura real

O RiverLub Web e um frontend Next.js que usa `NEXT_PUBLIC_API_URL` como base de API. No web, essa variavel aponta para a base ja com `/api`, por exemplo:

```text
https://api.riverlub.com.br/api
```

Por isso o web chama:

```text
${NEXT_PUBLIC_API_URL}/auth/login
${NEXT_PUBLIC_API_URL}/os/listar
${NEXT_PUBLIC_API_URL}/financeiro/resumo
```

O backend Express monta as rotas reais em `/api`:

```text
/api/auth
/api/os
/api/financeiro
/api/estoque
...
```

O endpoint `/health` fica fora de `/api` e fora da autenticacao.

No Desktop, a variavel criada e `VITE_RIVERLUB_API_URL`. A recomendacao e manter essa env apontando para a origem da API, sem `/api`:

```text
https://api.riverlub.com.br
```

Assim o cliente desktop chama explicitamente:

```text
/api/auth/login
/api/auth/me
/api/auth/logout
```

Isso evita confusao entre o padrao do web (`NEXT_PUBLIC_API_URL` com `/api`) e o padrao do Desktop (`VITE_RIVERLUB_API_URL` como origem).

## Fluxo real de login do web

Arquivo:

```text
src/app/login/page.js
```

Endpoint usado:

```text
POST ${NEXT_PUBLIC_API_URL}/auth/login
```

Payload:

```json
{
  "email": "usuario@oficina.com",
  "senha": "senha digitada"
}
```

Fetch:

```text
credentials: "include"
Content-Type: application/json
```

Resposta esperada:

```json
{
  "sucesso": true,
  "usuario": {
    "id": 1,
    "oficina_id": 1,
    "oficina_nome": "Oficina",
    "nome": "Usuario",
    "email": "usuario@oficina.com",
    "tipo": "ADMIN",
    "email_verificado_em": "..."
  },
  "sessao": {
    "id": 1,
    "expira_em": "..."
  }
}
```

O backend tambem envia cookie HttpOnly de sessao. O web nao le esse cookie; ele apenas usa `credentials: "include"` nas chamadas seguintes.

## Armazenamento local usado pelo web

Arquivo:

```text
src/lib/auth.js
```

Chave:

```text
riverlub_auth
```

Formato salvo:

```json
{
  "usuario": {
    "id": 1,
    "oficina_id": 1,
    "oficina_nome": "Oficina",
    "nome": "Usuario",
    "email": "usuario@oficina.com",
    "tipo": "ADMIN"
  },
  "sessao": {
    "id": 1,
    "expira_em": "..."
  }
}
```

Regras:

- se `lembrar` for verdadeiro, salva em `localStorage`;
- se `lembrar` for falso, salva em `sessionStorage`;
- remove a copia alternativa para evitar sessao duplicada;
- nao salva senha;
- nao salva token;
- `getAuthToken()` retorna `null`;
- `montarAuthHeaders()` nao adiciona `Authorization`.

Verificacao local:

- `getUsuarioLogado()` le `riverlub_auth`;
- valida se `usuario.id` existe;
- se `sessao.expira_em` estiver vencida, limpa o storage e retorna `null`;
- paginas protegidas redirecionam para `/login` quando nao ha usuario local.

Logout:

```text
encerrarSessaoAuth()
```

Comportamento:

- limpa `localStorage` e `sessionStorage`;
- chama `POST ${NEXT_PUBLIC_API_URL}/auth/logout`;
- usa `credentials: "include"`;
- usa `keepalive`;
- por padrao nao aguarda o servidor para redirecionar.

## Cookie e sessao do backend

Arquivos:

```text
src/services/authCore.js
src/middlewares/auth.js
src/routes/auth.js
```

Cookie:

```text
nome: riverlub_session
httpOnly: true
sameSite: lax
secure: true em producao
path: /api
domain: AUTH_COOKIE_DOMAIN, se configurado
duracao: AUTH_SESSION_DURATION_DAYS ou 14 dias
```

Sessao:

- token aleatorio de 32 bytes;
- token e salvo no banco apenas como SHA-256 (`token_hash`);
- tabela `auth_sessoes`;
- campos relevantes: `usuario_id`, `token_hash`, `expira_em`, `revogado_em`, `ultimo_uso_em`, `user_agent`, `ip`.

Middleware:

```text
app.use("/api", authMiddleware)
```

O middleware:

- ignora rotas publicas exatas e por prefixo;
- busca token no cookie `riverlub_session`;
- opcionalmente aceita Bearer se `AUTH_ALLOW_BEARER_SESSION` permitir;
- valida `token_hash`, `revogado_em IS NULL`, `expira_em > NOW()`;
- valida `usuarios.ativo`;
- popula `req.usuario` e `req.authSession`;
- atualiza `ultimo_uso_em`;
- retorna 401 para sessao ausente/expirada;
- retorna 403 para usuario inativo.

Rotas publicas exatas:

```text
/
/auth/login
/auth/cadastro/iniciar
/auth/cadastro/confirmar
/auth/cadastro/reenviar
/auth/senha/esqueci
/auth/senha/reenviar
/auth/senha/redefinir
```

Rotas publicas por prefixo:

```text
/os/publico/orcamento/
/os/publico/
/orcamentos-avulsos/publico/
/financeiro/publico/recibo/
/notificacoes/webhook/whatsapp
/totem/publico/
/whatsapp/agente/
```

Rotas protegidas de auth:

```text
POST /api/auth/logout
GET /api/auth/me
GET /api/auth/usuarios
POST /api/auth/usuarios
PUT /api/auth/usuarios/:id/status
```

Criacao de usuarios:

- apenas `ADMIN`;
- perfis validos: `ADMIN`, `ATENDENTE`, `MECANICO`;
- senha minima de 8 caracteres com letras e numeros;
- usuario criado ja ativo e email verificado.

Cadastro publico:

- controlado por `AUTH_PUBLIC_SIGNUP_ENABLED`;
- cria oficina e primeiro usuario `ADMIN`;
- usa codigo por email ou preview fora de producao.

Reset de senha:

- fluxo por codigo de email;
- ao redefinir, revoga sessoes anteriores;
- cria nova sessao e novo cookie.

## CORS, CSRF e origem

Arquivo:

```text
src/server.js
```

CORS:

- `credentials: true`;
- origens permitidas por `FRONTEND_URL`, localhost e `ADDITIONAL_ALLOWED_ORIGINS`;
- previews Vercel podem ser liberados por env.

Protecao de origem:

- `POST`, `PUT`, `PATCH`, `DELETE` exigem `Origin` ou `Referer` permitido;
- bypass apenas para agente WhatsApp e webhook WhatsApp;
- Desktop Tauri precisa ter origem aceita pelo backend antes de escrita real;
- nesta etapa o Desktop nao faz escrita real.

## Permissoes por perfil

### Frontend web

Arquivo:

```text
src/lib/auth.js
```

Regras principais:

| Acao/modulo | ADMIN | ATENDENTE | MECANICO |
| --- | --- | --- | --- |
| Ver valores | sim | sim | nao |
| Criar O.S. | sim | sim | nao |
| Gerar orcamento | sim | sim | nao |
| Excluir item de O.S. | sim | sim | nao |
| Editar preco | sim | sim | nao |
| Alterar quantidade | sim | sim | sim |
| Adicionar itens | sim | sim | sim |
| Usar IA/catalogo/fluidos | sim | sim | sim |
| Gerenciar estoque | sim | sim | nao |
| Usar financeiro/pagamentos | sim | sim | nao |
| Usar relatorios | sim | sim | nao |
| Usar notificacoes | sim | sim | nao |
| Gerenciar usuarios/configuracoes | sim | nao | nao |
| Reabrir/cancelar O.S. | sim | sim | nao |

Transicoes de O.S. no frontend:

- `ADMIN` e `ATENDENTE`:
  - `ABERTA -> FILA_DE_ESPERA` ou `AGUARDANDO_APROVACAO`
  - `AGUARDANDO_APROVACAO -> ABERTA`
  - `FILA_DE_ESPERA -> EM_EXECUCAO`
  - `EM_EXECUCAO -> FILA_DE_ESPERA` ou `FINALIZADA`
  - `FINALIZADA -> ABERTA`
- `MECANICO`:
  - `FILA_DE_ESPERA -> EM_EXECUCAO`
  - `EM_EXECUCAO -> FILA_DE_ESPERA` ou `FINALIZADA`

### Backend

As rotas repetem a protecao por `req.usuario.tipo` e `req.usuario.oficina_id`.

Resumo por modulo:

- O.S.: criar/gerar orcamento/cancelar/reabrir ficam em ADMIN/ATENDENTE; mecanico pode executar fluxo tecnico permitido.
- Itens de O.S.: mecanico pode adicionar/alterar quantidade, mas nao editar preco nem excluir.
- Estoque: ADMIN/ATENDENTE gerenciam e veem custos; MECANICO consulta sem custos.
- Financeiro e pagamentos: ADMIN/ATENDENTE.
- Orcamentos avulsos: ADMIN/ATENDENTE.
- Configuracoes e usuarios: ADMIN.
- WhatsApp conexao: ADMIN; validacao de telefone: ADMIN/ATENDENTE.
- IA: ADMIN/ATENDENTE/MECANICO.
- Notificacoes: ADMIN/ATENDENTE.
- Clientes/veiculos comerciais: ADMIN/ATENDENTE/MECANICO para leitura; exclusao de cliente: ADMIN/ATENDENTE.

## Navegacao por perfil no web

Arquivo:

```text
src/lib/navigation.js
```

### ADMIN

Desktop/sidebar:

- Visao Geral
- Atendimento
- Ordens de Servico
- Orcamentos
- Clientes
- Veiculos
- Estoque
- Financeiro
- Pagamentos
- Relatorios
- Notificacoes
- Consulta Tecnica
- Minha Oficina
- Configuracoes
- Integracoes
- Auditoria
- Usuarios
- Cadastro

Mobile:

- Inicio
- Fila
- Financeiro
- Relatorios
- Mais

### ATENDENTE

Desktop/sidebar:

- Visao Geral
- Atendimento
- Ordens de Servico
- Orcamentos
- Clientes
- Veiculos
- Estoque
- Financeiro
- Pagamentos
- Relatorios
- Notificacoes
- Consulta Tecnica
- Cadastro

Nao ve menus administrativos: Minha Oficina, Configuracoes, Integracoes, Auditoria, Usuarios.

Mobile:

- Inicio
- Nova O.S.
- Fila
- Orcamentos
- Mais

### MECANICO

Desktop/sidebar:

- Visao Geral
- Atendimento
- Ordens de Servico
- Clientes
- Veiculos
- Estoque
- Consulta Tecnica

Nao ve:

- Orcamentos
- Financeiro
- Pagamentos
- Relatorios
- Notificacoes
- Configuracoes
- Usuarios
- Cadastro

Mobile:

- Inicio
- Fila
- Consulta
- Estoque
- Mais

## Paginas principais do web

### Visao Geral (`src/app/page.js`)

Leitura:

- `GET /api/os/listar`
- `GET /api/dashboard/resumo`
- `GET /api/financeiro/resumo`, somente se perfil pode usar financeiro.

Estados:

- redireciona para login se `getUsuarioLogado()` falhar;
- mecanico recebe resumo sem financeiro.

Risco para Desktop:

- Dashboard deve respeitar ocultacao financeira por perfil.

### Fila (`src/app/fila/page.js`)

Leitura:

- `GET /api/os/listar?visao=fila&limite=200`

Escrita:

- `PUT /api/os/:id/status` com `{ "status": "EM_EXECUCAO" }`

Filtros locais:

- busca por cliente, placa, veiculo ou O.S.;
- etapa/status.

Permissoes:

- mecanico nao ve etapas `ABERTA` e `AGUARDANDO_APROVACAO`;
- finalizar redireciona para detalhe da O.S.

### Cadastro/Nova O.S. (`src/app/cadastro/page.js`)

Leitura:

- `GET /api/whatsapp/ponte/status`
- `GET /api/os/buscar-placa/:placa`

Escrita:

- `POST /api/whatsapp/ponte/telefone/enviar-codigo`
- `POST /api/whatsapp/ponte/telefone/confirmar`
- `POST /api/os`

Payload de criacao de O.S.:

```json
{
  "cliente": "...",
  "telefone": "...",
  "placa": "...",
  "marca": "...",
  "modelo": "...",
  "ano": "...",
  "motor": "...",
  "vin": "...",
  "descricaoCompleta": "...",
  "telefone_verificacao_id": 1
}
```

Regra atual:

- cliente obrigatorio;
- placa/telefone opcionais na abertura;
- backend gera placa tecnica `SEM...` quando necessario;
- validacao WhatsApp ajuda, mas nao bloqueia abertura.

### Historico de O.S. (`src/app/os/page.js`)

Leitura:

- `GET /api/os/historico`

Filtros:

- busca;
- status;
- periodo/data inicial/data final;
- limite.

### Detalhe de O.S. (`src/app/os/[id]/page.js`)

Leitura principal:

- `GET /api/os/:id`
- `GET /api/os/:id/itens`
- `GET /api/estoque/itens`
- `GET /api/os/:id/orcamentos`
- `GET /api/financeiro/recebiveis?os_id=:id&limite=20`
- `GET /api/os/:id/logs`
- `GET /api/os/:id/sugestoes`
- `GET /api/os/:id/fluidos`
- `GET /api/os/:id/arvore`
- `GET /api/os/:id/candidatos-catalogo`
- `GET /api/os/:id/grupos-montagem`

Escrita operacional:

- `POST /api/os/:id/cancelar`
- `DELETE /api/os/:id?motivo=...`
- `PUT /api/os/:id/cadastro`
- `PUT /api/os/:id/status`
- `PUT /api/os/:id/finalizar`
- `PUT /api/os/:id/reabrir`
- `POST /api/os/:id/itens`
- `POST /api/os/:id/itens/lote`
- `PUT /api/os/itens/:id`
- `PUT /api/os/itens/:id/estoque-status`
- `DELETE /api/os/itens/:id`
- `POST /api/os/:id/orcamentos`
- `PUT /api/os/orcamentos/:orcamentoId/aprovar`
- `PUT /api/os/orcamentos/:orcamentoId/rejeitar`
- `POST /api/ia/os/:id/sugestoes`
- `POST /api/ia/os/:id/feedback`
- `POST /api/os/:id/fluidos`
- `PUT /api/os/:id/fluidos/:fluidoId`
- `DELETE /api/os/:id/fluidos/:fluidoId`
- `POST /api/os/:id/fluidos/aplicar-referencia`
- `POST /api/os/:id/selecionar-catalogo`
- `POST /api/os/:id/vincular-catalogo`
- `POST /api/os/:id/documento/enviar-whatsapp`

Riscos:

- muitas escritas com impacto em estoque, financeiro, notificacoes e logs;
- Desktop deve comecar por leitura, nunca por escrita;
- finalizar exige validacoes de cadastro, KM e retorno no backend.

### Clientes (`src/app/clientes/page.js`)

Leitura:

- `GET /api/comercial/clientes/resumo`
- `GET /api/comercial/clientes?limite=120`

Escrita:

- `DELETE /api/clientes/:id`

Permissoes:

- leitura de relacionamento para ADMIN/ATENDENTE/MECANICO;
- exclusao para ADMIN/ATENDENTE.

### Veiculos (`src/app/veiculos/page.js`)

Leitura:

- `GET /api/comercial/veiculos/resumo`
- `GET /api/comercial/veiculos?limite=160`

Permissoes:

- leitura de relacionamento para ADMIN/ATENDENTE/MECANICO.

### Orcamentos (`src/app/orcamentos/page.js`)

Leitura:

- `GET /api/orcamentos-avulsos`
- `GET /api/orcamentos-avulsos/:id`
- `GET /api/estoque/itens`
- `GET /api/os/buscar-placa/:placa`

Escrita:

- `POST /api/placa`
- `POST /api/orcamentos-avulsos`
- `PUT /api/orcamentos-avulsos/:id`
- `DELETE /api/orcamentos-avulsos/:id`
- `POST /api/orcamentos-avulsos/:id/itens`
- `PUT /api/orcamentos-avulsos/itens/:itemId`
- `DELETE /api/orcamentos-avulsos/itens/:itemId`
- `POST /api/orcamentos-avulsos/consulta-tecnica`
- `POST /api/orcamentos-avulsos/:id/enviar-whatsapp`

Permissoes:

- ADMIN/ATENDENTE.

Risco:

- envio WhatsApp cria job;
- itens de estoque sao referencia no orcamento avulso e nao devem baixar estoque.

### Estoque (`src/app/estoque/page.js`)

Leitura:

- `GET /api/estoque/resumo`
- `GET /api/estoque/itens?busca=&alerta=`

Escrita:

- `POST /api/estoque/itens`
- `PUT /api/estoque/itens/:id`
- `DELETE /api/estoque/itens/:id`
- `POST /api/estoque/movimentacoes`

Permissoes:

- ADMIN/ATENDENTE gerenciam e veem custos;
- MECANICO consulta sem custos.

Risco:

- movimentacoes alteram saldo real; Desktop deve iniciar somente leitura.

### Financeiro (`src/app/financeiro/page.js`)

Leitura:

- `GET /api/financeiro/resumo`
- `GET /api/financeiro/recebiveis`
- `GET /api/financeiro/recebiveis/:id`
- `GET /api/financeiro/pagamentos`

Filtros:

- busca;
- status;
- forma_pagamento;
- data_inicial;
- data_final;
- vencidos;
- limite.

Escrita:

- `POST /api/financeiro/recebiveis`
- `POST /api/financeiro/recebiveis/:id/pagamentos`
- `PUT /api/financeiro/recebiveis/:id`
- `DELETE /api/financeiro/pagamentos/:id`

Permissoes:

- ADMIN/ATENDENTE.

Risco:

- dados financeiros sensiveis; Desktop nao deve mostrar para MECANICO.

### Pagamentos/contas a pagar (`src/app/pagamentos/page.js`)

Leitura:

- `GET /api/pagamentos/resumo`
- `GET /api/pagamentos`
- `GET /api/pagamentos/:id/itens`
- `GET /api/pagamentos/alertas`
- `GET /api/estoque/itens`

Escrita:

- `POST /api/pagamentos`
- `PUT /api/pagamentos/:id`
- `DELETE /api/pagamentos/:id`
- `PUT /api/pagamentos/:id/pagar`
- `PUT /api/pagamentos/:id/cancelar`
- `POST /api/pagamentos/:id/itens`
- `PUT /api/pagamentos/itens/:itemId`
- `DELETE /api/pagamentos/itens/:itemId`
- `POST /api/pagamentos/:id/testar-aviso`
- `POST /api/pagamentos/gerar-alertas`

Permissoes:

- ADMIN/ATENDENTE.

Risco:

- cria jobs WhatsApp e alertas; nao conectar no Desktop antes da fase de escrita.

### WhatsApp/Integracoes (`src/app/whatsapp/page.js`)

Leitura:

- `GET /api/whatsapp/ponte/status`
- chamadas locais para `VITE_RIVERLUB_LOCAL_AGENT_URL`.

Escrita:

- `POST /api/whatsapp/ponte/ativar`
- `POST /api/whatsapp/ponte/desconectar`
- `POST /api/whatsapp/ponte/teste`
- `POST /api/whatsapp/ponte/telefone/enviar-codigo`
- `POST /api/whatsapp/ponte/telefone/confirmar`

Permissoes:

- conectar/desconectar/testar ponte: ADMIN;
- validar telefone: ADMIN/ATENDENTE.

Observacao:

- o Desktop ja preserva o Connect local; nao mudar este modulo nesta auditoria.

### Configuracoes (`src/app/configuracoes/page.js`)

Leitura:

- `GET /api/configuracoes/oficina`

Escrita:

- `PUT /api/configuracoes/oficina`

Permissao:

- ADMIN.

### Acessos (`src/app/acessos/page.js`)

Leitura:

- `GET /api/auth/usuarios`

Escrita:

- `POST /api/auth/usuarios`
- `PUT /api/auth/usuarios/:id/status`

Permissao:

- ADMIN.

## Rotas backend por modulo

### Auth

```text
POST /api/auth/login
POST /api/auth/logout
GET /api/auth/me
GET /api/auth/usuarios
POST /api/auth/usuarios
PUT /api/auth/usuarios/:id/status
POST /api/auth/cadastro/iniciar
POST /api/auth/cadastro/confirmar
POST /api/auth/cadastro/reenviar
POST /api/auth/senha/esqueci
POST /api/auth/senha/reenviar
POST /api/auth/senha/redefinir
```

### Dashboard/comercial

```text
GET /api/dashboard/resumo
GET /api/comercial/clientes/resumo
GET /api/comercial/clientes
GET /api/comercial/veiculos/resumo
GET /api/comercial/veiculos
GET /api/comercial/orcamentos/resumo
GET /api/comercial/orcamentos
```

### O.S.

```text
GET /api/os/listar
GET /api/os/historico
POST /api/os
GET /api/os/:id
PUT /api/os/:id/cadastro
PUT /api/os/:id/status
PUT /api/os/:id/finalizar
PUT /api/os/:id/reabrir
POST /api/os/:id/cancelar
DELETE /api/os/:id
GET /api/os/:id/itens
POST /api/os/:id/itens
POST /api/os/:id/itens/lote
PUT /api/os/itens/:id
PUT /api/os/itens/:id/estoque-status
DELETE /api/os/itens/:id
GET /api/os/:id/orcamentos
POST /api/os/:id/orcamentos
GET /api/os/orcamentos/:orcamentoId/impressao
PUT /api/os/orcamentos/:orcamentoId/aprovar
PUT /api/os/orcamentos/:orcamentoId/rejeitar
GET /api/os/publico/orcamento/:token
POST /api/os/publico/orcamento/:token/aprovar
POST /api/os/publico/orcamento/:token/rejeitar
POST /api/os/publico/orcamento/:token/alteracao
GET /api/os/publico/:id/documento
POST /api/os/:id/documento/enviar-whatsapp
GET /api/os/buscar-placa/:placa
GET /api/os/:id/logs
GET /api/os/:id/sugestoes
POST /api/os/:id/sugestoes
PUT /api/os/sugestoes/:sugestaoId/resolver
GET /api/os/:id/arvore
```

### Estoque/fluidos

```text
GET /api/estoque/resumo
GET /api/estoque/itens
POST /api/estoque/itens
PUT /api/estoque/itens/:id
DELETE /api/estoque/itens/:id
GET /api/estoque/movimentacoes
POST /api/estoque/movimentacoes
POST /api/estoque/importar
POST /api/estoque/itens/bulk-upsert
GET /api/fluidos/resumo
GET /api/fluidos/referencias
POST /api/fluidos/referencias
PUT /api/fluidos/referencias/:id
DELETE /api/fluidos/referencias/:id
```

### Financeiro/pagamentos

```text
GET /api/financeiro/resumo
GET /api/financeiro/recebiveis
GET /api/financeiro/recebiveis/:id
POST /api/financeiro/recebiveis
PUT /api/financeiro/recebiveis/:id
POST /api/financeiro/recebiveis/:id/pagamentos
GET /api/financeiro/pagamentos
DELETE /api/financeiro/pagamentos/:id
GET /api/financeiro/publico/recibo/:token
GET /api/pagamentos/resumo
GET /api/pagamentos
POST /api/pagamentos
PUT /api/pagamentos/:id
DELETE /api/pagamentos/:id
PUT /api/pagamentos/:id/pagar
PUT /api/pagamentos/:id/cancelar
GET /api/pagamentos/:id/itens
POST /api/pagamentos/:id/itens
PUT /api/pagamentos/itens/:itemId
DELETE /api/pagamentos/itens/:itemId
GET /api/pagamentos/alertas
POST /api/pagamentos/:id/testar-aviso
POST /api/pagamentos/gerar-alertas
```

### Orcamentos avulsos

```text
GET /api/orcamentos-avulsos
POST /api/orcamentos-avulsos
GET /api/orcamentos-avulsos/:id
PUT /api/orcamentos-avulsos/:id
DELETE /api/orcamentos-avulsos/:id
GET /api/orcamentos-avulsos/:id/itens
POST /api/orcamentos-avulsos/:id/itens
PUT /api/orcamentos-avulsos/itens/:itemId
DELETE /api/orcamentos-avulsos/itens/:itemId
POST /api/orcamentos-avulsos/consulta-tecnica
GET /api/orcamentos-avulsos/publico/:token/documento
POST /api/orcamentos-avulsos/:id/enviar-whatsapp
```

### WhatsApp/notificacoes/IA

```text
GET /api/whatsapp/ponte/status
POST /api/whatsapp/ponte/ativar
POST /api/whatsapp/ponte/desconectar
POST /api/whatsapp/ponte/teste
POST /api/whatsapp/ponte/telefone/enviar-codigo
POST /api/whatsapp/ponte/telefone/confirmar
POST /api/whatsapp/agente/ping
POST /api/whatsapp/agente/jobs/proximo
POST /api/whatsapp/agente/jobs/:id/concluir
GET /api/notificacoes/resumo
GET /api/notificacoes
POST /api/notificacoes/:id/enviar-ponte
POST /api/notificacoes/:id/enviar-oficial
PUT /api/notificacoes/:id/status
POST /api/ia/consulta-tecnica
POST /api/ia/consulta
POST /api/ia/os/:id/sugestoes
POST /api/ia/os/:id/feedback
POST /api/ia/os/:id/explicacao
```

### Configuracoes/auditoria

```text
GET /api/configuracoes/oficina
PUT /api/configuracoes/oficina
GET /api/auditoria/operacional
GET /api/relatorios/resumo
POST /api/placa
```

## Diferencas entre web e Desktop

Web:

- roda em dominio/browser conhecido;
- usa `NEXT_PUBLIC_API_URL` ja com `/api`;
- usa cookie HttpOnly do backend;
- salva apenas metadados de usuario/sessao em storage;
- filtra navegacao por perfil;
- ja executa escritas reais.

Desktop atual:

- roda em Tauri;
- usa `VITE_RIVERLUB_API_URL` como origem da API;
- ainda nao tem login;
- ainda nao filtra navegacao por usuario real;
- ja tem cliente API de diagnostico;
- ainda nao deve conectar telas operacionais reais;
- preserva WhatsApp Connect local.

## Riscos para o Tauri

1. Cookie HttpOnly pode nao persistir se a origem Tauri nao for aceita pelo backend.
2. `SameSite=lax` pode bloquear cookie dependendo da origem da webview.
3. Escritas exigem `Origin`/`Referer` permitido; Tauri precisa estrategia formal antes de POST/PUT/DELETE reais.
4. Bearer token no desktop e extraivel; nao criar sem decisao formal.
5. Financeiro, pagamentos, estoque e O.S. alteram dados reais e precisam fase separada.
6. Mecanico nao pode ver financeiro/custos; Desktop precisa aplicar filtro antes de mostrar modulo.
7. Agente WhatsApp tem rotas publicas por prefixo, mas deve continuar separado do login do sistema.

## Recomendacao para o Desktop

1. Replicar o fluxo web:
   - `POST /api/auth/login` com `{ email, senha }`;
   - `credentials: "include"`;
   - nao salvar senha;
   - nao salvar token;
   - deixar cookie HttpOnly com o backend;
   - salvar apenas metadados seguros em storage local do Desktop.
2. Criar storage equivalente ao web:
   - chave sugerida: `riverlub_auth`;
   - campos: `usuario` e `sessao.id/expira_em`;
   - limpar quando `expira_em` vencer.
3. Apos login, chamar `GET /api/auth/me` para confirmar cookie/sessao.
4. Aplicar permissao por perfil antes de renderizar navegacao:
   - esconder Financeiro/Pagamentos/Relatorios para MECANICO;
   - esconder Configuracoes/Usuarios/Integracoes administrativas para ATENDENTE/MECANICO;
   - ocultar custos do estoque para MECANICO.
5. Conectar dados reais em fases:
   - fase 1: health/auth;
   - fase 2: leitura por modulo;
   - fase 3: criacao/edicao;
   - fase 4: recursos locais/offline.
6. Antes de qualquer escrita real no Tauri, resolver oficialmente:
   - CORS/origem permitida;
   - persistencia de cookie;
   - politica de CSRF;
   - auditoria por usuario/oficina.

## Nao usar ainda no Desktop

Nesta fase, nao usar:

- endpoints de criacao/edicao/exclusao de O.S.;
- endpoints de estoque que movimentam saldo;
- endpoints financeiros de pagamento/recebivel;
- endpoints de pagamentos que geram alertas/jobs;
- endpoints de envio WhatsApp;
- endpoints administrativos de usuarios/configuracoes;
- endpoints publicos de cliente como substituto de autenticacao.
