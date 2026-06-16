# Integracao RiverLub Desktop com backend

## Escopo desta etapa

Esta etapa prepara a conexao segura do RiverLub Desktop Tauri com o backend RiverLub sem conectar telas operacionais a dados reais.

Nao foi feito:

- acesso direto ao Supabase;
- uso de `SUPABASE_SERVICE_ROLE_KEY`;
- uso de `DATABASE_URL`;
- uso de `OPENAI_API_KEY`;
- escrita real no backend;
- migrations;
- alteracao no backend, web ou WhatsApp Connect.

## URL base

O desktop usa `VITE_RIVERLUB_API_URL`.

Valor padrao documentado:

```text
https://api.riverlub.com.br
```

Se a variavel nao estiver configurada, o cliente aplica fallback seguro para:

```text
https://api.riverlub.com.br
```

## Cliente API

Arquivo:

```text
src/lib/riverlubApiClient.js
```

Responsabilidades:

- montar chamadas relativas a `VITE_RIVERLUB_API_URL`;
- usar `credentials: "include"`;
- aplicar timeout;
- padronizar erros de rede, 401, 403 e 500;
- evitar logs com token, cookie ou senha;
- expor somente funcoes iniciais de health/auth.

Funcoes criadas:

```text
getApiHealth()
getCurrentUser()
loginWithEmailPassword(email, senha)
logout()
```

## Endpoints testados

```text
GET /health
GET /api/auth/me
POST /api/auth/login
POST /api/auth/logout
```

Nesta etapa, o modulo Diagnosticos chama apenas:

```text
GET /health
GET /api/auth/me
```

`loginWithEmailPassword` e `logout` ficam prontos no cliente, mas sem tela de login ainda.

## Resultado esperado

### GET /health

Quando o backend estiver online:

```text
ok = true
status = 200
```

Se houver falha de rede, CORS ou bloqueio do ambiente Tauri:

```text
ok = false
status = 0
error.code = NETWORK_OR_CORS
```

### GET /api/auth/me

Quando existir cookie de sessao valido:

```text
ok = true
status = 200
data.usuario preenchido
```

Quando nao houver sessao:

```text
ok = false
status = 401
error.code = UNAUTHORIZED
```

## Estrategia de autenticacao Desktop

O backend atual usa sessao por cookie HttpOnly. O login existente recebe:

```json
{
  "email": "...",
  "senha": "..."
}
```

e retorna cookie de sessao por `setAuthSessionCookie`.

### Cookie HttpOnly

O cliente desktop foi preparado para usar `credentials: "include"` em todas as chamadas.

Se o Tauri aceitar o cookie do dominio da API e o backend permitir origem do desktop, o fluxo atual pode funcionar sem criar um bearer token no cliente.

### CORS

Se o Tauri/browser webview bloquear a chamada por CORS, o diagnostico deve mostrar erro `NETWORK_OR_CORS`.

Nesse caso, a correcao segura fica no backend/CORS permitido para o desktop, nao no cliente.

### SameSite/Secure

O backend usa cookie HttpOnly com `sameSite: "lax"` e `secure` em producao. Se a origem Tauri for tratada como cross-site e o cookie nao persistir, sera necessario revisar estrategia propria para desktop.

### Rotas desktop futuras

Se o cookie atual nao funcionar de forma confiavel no Tauri, a recomendacao e criar futuramente rotas dedicadas:

```text
POST /api/desktop/auth/login
GET /api/desktop/auth/me
POST /api/desktop/auth/logout
```

Essas rotas devem continuar protegidas pelo backend e nunca expor service role, `DATABASE_URL` ou segredo no app desktop.

### Riscos de bearer token

Bearer token no desktop aumenta risco de vazamento por logs, memoria, disco, backup local e suporte remoto.

Se um token desktop for necessario no futuro, ele deve ser:

- curto;
- revogavel;
- escopado por oficina/dispositivo;
- armazenado no cofre do sistema operacional;
- nunca salvo em texto puro;
- nunca logado.

## Diagnosticos no Desktop

Modulo:

```text
src/modules/diagnostics/DiagnosticsModule.jsx
```

Nova secao:

```text
Backend RiverLub
```

Mostra:

- URL da API configurada;
- status de `/health`;
- status de autenticacao;
- usuario atual, se autenticado;
- erro de CORS/cookie, se acontecer;
- botao `Testar conexao`.

Nao mostra:

- token;
- cookie;
- senha;
- qualquer segredo.

## Guard de ambiente

O desktop bloqueia/sinaliza chaves proibidas expostas no bundle:

```text
SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL
OPENAI_API_KEY
```

Tambem sinaliza variantes `VITE_*`, caso alguem tente expor segredo ao frontend.

## Problemas encontrados

- `GET /health` testado por PowerShell em `https://api.riverlub.com.br/health`: `sucesso=true`, `status=ok`, `banco=online`.
- `GET /api/auth/me` testado sem cookie por PowerShell: `401 Unauthorized`, comportamento esperado sem sessao.
- Login real nao foi executado nesta etapa porque nao ha tela de credenciais no Desktop.
- Persistencia de cookie no Tauri precisa ser validada com usuario real em ambiente de teste.
- Se `/api/auth/me` retornar 401 apos login bem-sucedido, investigar CORS, SameSite, Secure e dominio do cookie antes de criar alternativa.

## Proximos passos

1. Validar `/health` no app Tauri aberto.
2. Criar fluxo de login desktop somente se o cookie HttpOnly atual funcionar ou se houver contrato seguro novo.
3. Conectar Dashboard em modo leitura.
4. Conectar O.S. em modo leitura.
5. Conectar Clientes/Veiculos em modo leitura.
6. Conectar Financeiro em modo leitura.
7. Liberar criacao/edicao em fase separada, com auditoria.
8. Planejar recursos locais/offline com fila segura e sincronizacao.
