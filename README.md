# RiverLub Connect

RiverLub Connect e o aplicativo desktop oficial para operacoes locais do RiverLub no Windows. Nesta fase ele passa a ser o centro do fluxo do WhatsApp da oficina: inicia o agente local, mostra o QR real, acompanha a sessao, le logs e protege o usuario final de terminal, `.cmd` e detalhes tecnicos.

## O que o Connect faz agora

- Controla o agente `backend/whatsapp-agent` por comandos Tauri nativos.
- Inicia o agente sem terminal visivel.
- Para somente processos criados pelo Connect.
- Detecta agente externo na porta `47851` sem encerrar o processo legado.
- Consulta `GET http://127.0.0.1:47851/health` e `GET /qr`.
- Renderiza `qr_data_url` dentro do app desktop.
- Gera imagem local a partir de `qr_text` se o agente entregar texto sem data URL.
- Atualiza status automaticamente com polling adaptativo.
- Mostra conta, numero conectado, versao do agente, porta local, caminhos de sessao/log e eventos recentes.
- Copia diagnostico sanitizado, sem token e sem QR.
- Arquiva logs antigos pelo botao **Limpar logs**.
- Permite **Resetar sessao de teste** somente com confirmacao explicita.
- Mantem o painel Web apenas como status, atalho e download.
- Registra `riverlub-connect://` no instalador NSIS para abrir/focar o app pelo painel Web.
- Empacota runtime proprio em `runtime/`: Node.js e `whatsapp-agent` com dependencias.

## Fluxo tecnico

1. O usuario abre o RiverLub Connect.
2. Clica em **Conectar WhatsApp**.
3. Se o agente nao estiver rodando, o Connect inicia `runtime/node/node.exe src/index.js` em `runtime/whatsapp-agent`.
4. O agente abre `whatsapp-web.js` com `LocalAuth` usando `%APPDATA%/RiverLub/whatsapp-agent/session`.
5. Quando o WhatsApp emite `qr`, o agente gera `qr_data_url`, guarda em memoria e expoe em `GET /qr` e `GET /health`.
6. O Connect mostra o QR real.
7. Ao autenticar, o QR some e o status passa por `Autenticando` ate `WhatsApp conectado`.
8. Com `ready`, o agente envia `telefone_conectado` e `nome_conta` ao backend e tambem retorna esses dados no status local.

## Seguranca

- QR e texto bruto do QR ficam apenas no localhost e em memoria.
- O servidor local escuta somente em `127.0.0.1:47851`.
- O Connect nao exibe `agentToken`.
- Diagnosticos sanitizam tokens, `Bearer` e `data:image`.
- Desconectar WhatsApp exige confirmacao.
- Parar agente afeta somente processo iniciado pelo Connect.
- Agente externo iniciado por `.cmd` ou terminal e monitorado, mas nao encerrado.
- Deep link futuro nao deve executar acoes perigosas sozinho; deve apenas abrir a tela certa.

## Scripts

```powershell
npm install
npm run dev
npm run build:ui
npm run tauri:build
npm run package
```

`npm run tauri:build` e `npm run package` geram o instalador NSIS do Windows. O artefato fica em:

```text
src-tauri/target/release/bundle/nsis
```

Nao commitar `node_modules`, `dist`, `src-tauri/target`, `.cargo-*-target`, instaladores ou builds.

O build inclui recursos vindos de:

```text
vendor/node/node.exe
../backend/whatsapp-agent/src
../backend/whatsapp-agent/package.json
../backend/whatsapp-agent/package-lock.json
../backend/whatsapp-agent/node_modules
```

`vendor/node/node.exe` e binario local de build e nao deve ser versionado.

## Distribuicao

O painel Web aponta para a release do GitHub:

```text
https://github.com/jhefersonalvez2-netizen/riverlub-connect/releases/latest
```

O `.exe` do instalador deve ser anexado como asset da release. O binario pesado nao deve ser versionado no Git.

## Deep link

O instalador registra no Windows, por usuario atual:

```text
riverlub-connect://open/whatsapp
```

O app aceita somente:

- `riverlub-connect://open`
- `riverlub-connect://open/whatsapp`

O single instance evita multiplas janelas: se o Connect ja estiver aberto, a segunda chamada foca/restaura a janela existente e emite um evento interno para a tela WhatsApp.

## Instalador profissional final

Base atual:

- Tauri v2.
- Bundle NSIS ativo.
- Instalacao por usuario atual.
- Pasta Start Menu `RiverLub`.
- Downgrade bloqueado.
- Protocolo `riverlub-connect://` registrado pelo instalador.
- Single instance ativo.
- Binario Windows em subsistema GUI, sem abrir console/CMD.
- Runtime Node/agent empacotado no instalador.

Pendencias antes de entregar em massa:

- Assinatura digital do executavel.
- Decidir se Puppeteer/Chromium sera embutido ou se Chrome/Edge local sera requisito.
- Pipeline de release no GitHub.
- Teste em Windows limpo, usuario sem permissao admin, SmartScreen e antivirus.
