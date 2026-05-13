# RiverLub Connect

RiverLub Connect e o aplicativo desktop oficial para operacoes locais do RiverLub no Windows. Nesta fase ele passa a ser o centro do fluxo do WhatsApp da oficina: inicia o agente local, mostra o QR real, acompanha a sessao, le logs e protege o usuario final de terminal, `.cmd` e detalhes tecnicos.

## O que o Connect faz agora

- Controla o agente `backend/whatsapp-agent` por comandos Tauri nativos.
- Inicia o agente sem terminal visivel.
- Para somente processos criados pelo Connect.
- Detecta agente externo na porta `47851` sem encerrar o processo legado.
- Consulta `GET http://127.0.0.1:47851/health` e `GET /qr`.
- Renderiza `qr_data_url` dentro do app desktop.
- Atualiza status automaticamente com polling adaptativo.
- Mostra conta, numero conectado, versao do agente, porta local, caminhos de sessao/log e eventos recentes.
- Copia diagnostico sanitizado, sem token e sem QR.
- Mantem o painel Web apenas como status, atalho e download.

## Fluxo tecnico

1. O usuario abre o RiverLub Connect.
2. Clica em **Conectar WhatsApp**.
3. Se o agente nao estiver rodando, o Connect inicia `node src/index.js` em `backend/whatsapp-agent`.
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

## Distribuicao

O painel Web aponta para a release do GitHub:

```text
https://github.com/jhefersonalvez2-netizen/riverlub-connect/releases/latest
```

Quando o instalador final estiver assinado, publique o `.exe` nessa release. Alternativamente, configure `NEXT_PUBLIC_RIVERLUB_CONNECT_DOWNLOAD_URL` no frontend para apontar para um CDN ou arquivo estatico como:

```text
public/downloads/RiverLub-Connect-Setup.exe
```

O binario pesado nao deve ser versionado no Git sem decisao explicita.

## Deep link

O painel Web ja tenta abrir:

```text
riverlub-connect://open/whatsapp
```

Nesta fase o fallback visual ja esta pronto. O registro real do protocolo deve entrar junto do instalador profissional, preferencialmente com o plugin oficial de deep link do Tauri e tratamento restrito a abrir a tela WhatsApp, sem aceitar comandos destrutivos nem tokens pela URL.

## Instalador profissional final

Base atual:

- Tauri v2.
- Bundle NSIS ativo.
- Instalacao por usuario atual.
- Pasta Start Menu `RiverLub`.
- Downgrade bloqueado.

Pendencias antes de entregar em massa:

- Assinatura digital do executavel.
- Registro oficial do protocolo `riverlub-connect://`.
- Empacotar o agente como sidecar ou runtime controlado, sem depender de Node no PATH.
- Decidir se Puppeteer/Chromium sera embutido ou se Chrome/Edge local sera requisito.
- Pipeline de release no GitHub.
- Teste em Windows limpo, usuario sem permissao admin, SmartScreen e antivirus.
