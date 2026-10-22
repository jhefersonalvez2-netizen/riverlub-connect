# INSTRUÇÃO — histórico de diagnóstico e recuperação do RiverLub Connect

> **Documento de continuidade para suporte técnico e novos chats com o ChatGPT.**
> Atualizado em 21/10/2026 (horário de Pernambuco; as execuções do GitHub podem aparecer em 22/10 UTC).
> **Versão confirmada em funcionamento: RiverLub Connect v0.4.5.**
> Repositório: https://github.com/jhefersonalvez2-netizen/riverlub-connect

## LEIA PRIMEIRO — conclusão e situação final

**O problema de inicialização do agente WhatsApp foi corrigido na v0.4.5.** Depois da instalação dessa versão em um segundo computador Windows, o usuário confirmou que:

1. O agente iniciou pelo aplicativo RiverLub Connect;
2. O QR Code apareceu no Connect;
3. O WhatsApp foi autenticado/conectado;
4. Um **orçamento de teste foi efetivamente enviado pelo WhatsApp**.

**Causa identificada:** o Tauri/Rust obtinha o caminho dos recursos num formato especial do Windows (**Win32 verbatim path**, como \`\\?\C:\...\`) e passava esse caminho ao processo **Node.js v22.23.3**. O Node encerrava antes de abrir o servidor local, apresentando:

\`\`\`text
Error: EISDIR: illegal operation on a directory, lstat 'C:'
Node.js v22.23.3
Node exited with code Some(1)
\`\`\`

O supervisor registrou entradas como:

\`\`\`text
Node runtime=\\?\C:\Users\<usuario>\AppData\Local\RiverLub Connect\runtime\0.4.4\node\node.exe
entry=\\?\C:\Users\<usuario>\AppData\Local\RiverLub Connect\runtime\0.4.4\whatsapp-agent\src\bootstrap.cjs
cwd=\\?\C:\Users\<usuario>\AppData\Local\RiverLub Connect\runtime\0.4.4\whatsapp-agent
\`\`\`

O tratamento dos caminhos foi corrigido em \`src-tauri/src/lib.rs\` pela função \`node_compatible_path\`, que converte caminhos locais \`\\?\C:\...\` para \`C:\...\` e normaliza o formato UNC equivalente antes de iniciar o Node. **Não é uma falha de porta/firewall, nem foi causada por um token Supabase inválido ou pela sessão WhatsApp antiga.**

## 1. Arquitetura relevante

- App desktop: **Tauri v2 + Rust**, interface React.
- Node.js **embutido** no instalador; agente \`vendor/whatsapp-agent\`, usando \`whatsapp-web.js\` e Chrome/Edge instalado no Windows.
- Supervisor local Rust: **127.0.0.1:47850**. Rotas \`GET /status\`, \`POST /start\`, \`POST /restart\`, \`POST /stop\` e \`POST /shutdown\`.
- Servidor do agente WhatsApp: **127.0.0.1:47851**. Rotas \`GET /health\`, \`GET /qr\` e \`POST /ativar\`.
- Porta **47852** usada somente em testes isolados, quando configurada por variável de ambiente.
- Pasta de instalação por usuário: \`%LOCALAPPDATA%\RiverLub Connect\`.
- Runtime por versão: \`%LOCALAPPDATA%\RiverLub Connect\runtime\<versão>\node\node.exe\` e \`...\whatsapp-agent\`.
- Configuração local: \`%APPDATA%\RiverLub\whatsapp-agent\config.json\`.
- Sessão de autenticação: \`%APPDATA%\RiverLub\whatsapp-agent\session\`.
- Logs: \`%APPDATA%\RiverLub\whatsapp-agent\logs\agent.log\` e, desde **v0.4.4**, \`supervisor.log\`.
- O app WhatsApp Desktop separado **não é uma dependência** do agente RiverLub Connect.
- O banco Supabase do sistema RiverLub foi inspecionado via conector durante a investigação: projeto \`riverlub-v2\`, com tabelas como \`whatsapp_agentes\`, \`whatsapp_conexoes\`, \`whatsapp_agent_jobs\`. **Nenhuma mudança no banco foi necessária** para corrigir este problema. Não confundir disponibilidade do banco com o boot local do Node.

## 2. Linha do tempo das versões e correções

| Versão | Alteração / observação | Resultado |
|---|---|---|
| **0.4.2** | Correções da leitura de respostas HTTP (\`Transfer-Encoding: chunked\` / \`Content-Length\`). | Agente ainda não iniciava no PC do usuário. |
| **0.4.3** | \`bootstrap.cjs\`, health check real antes de informar sucesso, supervisão e código de saída. | \`exit code 1\`, porta 47851 fechada; logs sem a falha atual. |
| **0.4.4** | Supervisor passa a registrar \`supervisor.log\` e trechos limitados de stderr do Node, sem coletar stdout (pode conter QR). | Descobriu-se o erro **EISDIR / lstat 'C:'** e o prefixo \`\\?\\C:\\\`. |
| **0.4.5** | Normalização dos caminhos Win32 antes de iniciar Node/Supervisor. Smoke test com caminho verbatim. | **Confirmada funcionando no segundo PC: QR, autenticação e envio de orçamento.** |

Links técnicos:

- [PR #10 — correções HTTP](https://github.com/jhefersonalvez2-netizen/riverlub-connect/pull/10)
- [PR #11 — diagnóstico de startup e supervisor](https://github.com/jhefersonalvez2-netizen/riverlub-connect/pull/11)
- [PR #12 — teste real do Supervisor no Windows](https://github.com/jhefersonalvez2-netizen/riverlub-connect/pull/12)
- [PR #13 — captura de erros de inicialização](https://github.com/jhefersonalvez2-netizen/riverlub-connect/pull/13)
- [PR #14 — correção dos caminhos Win32, v0.4.5](https://github.com/jhefersonalvez2-netizen/riverlub-connect/pull/14)
- [Release v0.4.5](https://github.com/jhefersonalvez2-netizen/riverlub-connect/releases/tag/v0.4.5)
- [Instalador Windows v0.4.5](https://github.com/jhefersonalvez2-netizen/riverlub-connect/releases/download/v0.4.5/RiverLub-Connect-Windows-x64-setup.exe)

## 3. Diagnósticos e testes feitos no PowerShell

### 3.1. Erro original no Connect

O diagnóstico copiado da interface apresentava:

\`\`\`json
{
  "connect_version": "0.4.3",
  "agent_version": null,
  "status": "STOPPED",
  "managed_pid": null,
  "last_agent_exit_code": 1,
  "port": 47851,
  "port_open": false
}
\`\`\`

Mensagem: \`O Supervisor recebeu o comando, mas o agente WhatsApp nao abriu a porta 47851 (codigo de saida: 1)\`.

A consulta direta ao Supervisor demonstrou que ele **recebia os comandos** e tentava reiniciar o agente:

\`\`\`powershell
Invoke-RestMethod "http://127.0.0.1:47850/status" -TimeoutSec 3 |
  Select-Object managedRunning, managedPid, desiredRunning, lastExitCode, restartFailures |
  Format-List
\`\`\`

Resultado registrado no segundo PC: \`managedRunning=False\`, \`desiredRunning=True\`, \`lastExitCode=1\`, \`restartFailures=39\`. Um processo Supervisor permanecia ativo. **Esse número representa tentativas de reinício, não 39 erros independentes.**

### 3.2. Inspeção do runtime Node (segundo PC)

Caminhos utilizados:

\`\`\`powershell
$base = Join-Path $env:LOCALAPPDATA "RiverLub Connect"
$runtime = Join-Path $base "runtime\0.4.3"
$node = Join-Path $runtime "node\node.exe"
$agent = Join-Path $runtime "whatsapp-agent"

Test-Path $node
Test-Path "$agent\src\index.js"
Test-Path "$agent\src\bootstrap.cjs"
& $node --version

Push-Location $agent
try {
  & $node -e "require('qrcode'); require('qrcode-terminal'); require('whatsapp-web.js'); require('whatsapp-web.js/src/util/Injected/Utils'); console.log('DEPENDENCIAS OK')"
} finally {
  Pop-Location
}
\`\`\`

Resultado: arquivos presentes, Node \`v22.23.3\`, \`DEPENDENCIAS OK\`. Isso **descartou arquivos/dependências ausentes** na máquina testada.

### 3.3. Inicialização manual do agente isolado

Foi iniciado \`node src/bootstrap.cjs\` com pasta temporária, porta **47852** e **token vazio**. O teste não acionava a sessão real. O endpoint respondeu:

\`\`\`text
PROCESSO EM EXECUCAO: True
SERVIDOR RESPONDEU: True
CONFIGURADO: False
[riverlub-agent] Aguardando ativacao pela tela do RiverLub
[riverlub-agent] Servidor local ativo em http://127.0.0.1:47852
\`\`\`

O comando foi executado com \`Start-Process -FilePath $node -ArgumentList "src/bootstrap.cjs" -WorkingDirectory $agent -RedirectStandardOutput ... -RedirectStandardError ... -PassThru\`, e o processo de teste foi encerrado após a verificação.

**Conclusão:** Node e dependências conseguiam subir normalmente com caminho \`C:\...\` tradicional.

### 3.4. Supervisor manual com runtime isolado

Foi iniciado o próprio \`riverlub-connect.exe --riverlub-supervisor\`, com estas variáveis em um **ambiente temporário e sem credenciais**, apontando para o mesmo Node/agent embutidos:

\`\`\`powershell
$env:RIVERLUB_SUPERVISOR_NODE = $node
$env:RIVERLUB_SUPERVISOR_AGENT_DIR = $agent
$env:RIVERLUB_SUPERVISOR_RUNTIME_ORIGIN = "isolated-test"
$env:RIVERLUB_AGENT_CONFIG_DIR = "<diretório temporário>\config"
$env:RIVERLUB_AGENT_DATA_PATH = "<diretório temporário>\session"
$env:RIVERLUB_AGENT_LOG_DIR = "<diretório temporário>\logs"
$env:RIVERLUB_AGENT_TOKEN = ""
$env:RIVERLUB_AGENT_LOCAL_PORT = "47851"
\`\`\`

Resultado: \`managedRunning=True\`, \`restartFailures=0\`, \`/health instalado=True\`, \`configurado=False\`. Confirmação de que o Supervisor conseguia gerenciar o Node fora do fluxo da interface.

**Nota:** placeholders acima são ilustrativos, **não** um script para copiar integralmente. Não executar esse teste enquanto o Connect estiver atendendo clientes.

### 3.5. Agente manual com token existente e sessão temporária

O arquivo local \`config.json\` foi validado por PowerShell como **JSON válido, com token presente**, sem imprimir o segredo. Confirmou-se também que \`agent.log\` era gravável.

Depois, o Node foi iniciado manualmente usando o config local, mas **sessão e logs temporários**, porta \`47852\` e \`RIVERLUB_API_URL=http://127.0.0.1:47999/api\`, deliberadamente **sem backend ativo**. Resultado:

\`\`\`text
EM EXECUCAO: True
INICIOU: True
CONFIGURADO: True
ESTADO: WAITING_QR
QR recebido para pareamento
QR Code real disponivel no servidor local do agente
\`\`\`

Os avisos \`Falha ao enviar status para API\` **eram esperados**, pois a URL apontava a uma porta sem servidor. **Não eram evidência de falha da API de produção.**

### 3.6. Supervisor manual com token e sessão temporária

Mesmo teste com \`--riverlub-supervisor\`, token lido da config já existente, pasta temporária de sessão, API local propositalmente indisponível e porta 47851:

\`\`\`text
GERENCIANDO: True
FALHAS: 0
INICIOU: True
CONFIGURADO: True
ESTADO: WAITING_QR
QR recebido para pareamento
\`\`\`

**Conclusão:** o Supervisor, Node, token e WhatsApp Web funcionavam em conjunto. Isso reduziu a suspeita de falha de token/credenciais.

### 3.7. Abertura normal da interface do Connect

Foi aberto \`riverlub-connect.exe\` sem \`--riverlub-supervisor\` (a interface gráfica) em um ambiente limpo, com variáveis de config/sessão/log temporárias. **Falhou novamente**:

\`\`\`text
SUPERVISOR GERENCIANDO: False
FALHAS: 0
CODIGO: 1
AGENTE NAO RESPONDEU
\`\`\`

Não havia log do agente temporário, pois a falha acontecia **antes de inicializar o logger**. Este teste foi importante para isolar a diferença da passagem de parâmetros/caminhos pelo Tauri.

### 3.8. Descoberta do erro real na v0.4.4

A v0.4.4 introduziu \`supervisor.log\`. Com o Connect aberto da forma normal, esse arquivo registrou:

\`\`\`text
Node runtime=\\?\C:\Users\<usuario>\AppData\Local\RiverLub Connect\runtime\0.4.4\node\node.exe
entry=\\?\C:\Users\<usuario>\AppData\Local\RiverLub Connect\runtime\0.4.4\whatsapp-agent\src\bootstrap.cjs
cwd=\\?\C:\Users\<usuario>\AppData\Local\RiverLub Connect\runtime\0.4.4\whatsapp-agent
Error: EISDIR: illegal operation on a directory, lstat 'C:'
Node.js v22.23.3
Node exited with code Some(1)
\`\`\`

Essa foi a evidência determinante. A correção na 0.4.5 normalizou os caminhos para uso pelo Node. A verificação de integração no GitHub **passou usando explicitamente paths Win32 verbatim**.

Scripts de CI relacionados:

- \`scripts/smoke-whatsapp-agent.ps1\` — inicialização isolada do agente;
- \`scripts/smoke-connect-supervisor.ps1\` — Supervisor Rust iniciando o agente, incluindo o cenário \`\\?\C:\...\`;
- \`scripts/smoke-supervisor-error-log.ps1\` — injeção de falha simulada e captura do diagnóstico.

### 3.9. Teste final em produção local

O usuário instalou a **v0.4.5** no **segundo computador**, abriu o aplicativo e confirmou:

\`\`\`text
QR Code apareceu -> WhatsApp conectou -> orçamento de teste enviado com sucesso.
\`\`\`

**Este é um teste real bem-sucedido da integração WhatsApp no segundo PC.** Não se pode extrapolar automaticamente o resultado para todos os PCs ou versões do Windows.

## 4. O primeiro computador tinha problemas adicionais de Windows

Os primeiros testes foram em outro PC com **Windows 10 Home / 21H2 / build 19044.1288**, que apresentava:

- PowerShell não abria: \`Erro interno do Windows PowerShell ... 80070002\`.
- WhatsApp Desktop também não abria (não é requisito do Connect, mas indicava instabilidade do sistema).
- \`DISM /Online /Cleanup-Image /RestoreHealth\` concluiu com sucesso.
- \`sfc /scannow\` detectou arquivos corrompidos não reparados, parando/emitindo falha por volta de 37%, inclusive após reinicialização.

**A corrupção do Windows é um problema real, mas não era necessário atribuir a ela a falha específica EISDIR do Connect**: o mesmo erro do aplicativo foi reproduzido no segundo PC saudável. A **v0.4.5 não foi confirmada no primeiro PC** durante esta investigação; se voltar a ele, validar à parte.

Para identificar a versão Windows em um computador:

\`\`\`cmd
winver
\`\`\`

Ou no CMD:

\`\`\`cmd
systeminfo | findstr /B /C:"Nome do sistema operacional" /C:"Versão do sistema operacional"
\`\`\`

## 5. Preservação da sessão WhatsApp

Durante a investigação, a pasta de sessão foi **movida, sem apagar**, para um backup no segundo PC, com nome:

\`\`\`text
%APPDATA%\RiverLub\whatsapp-agent\session-backup-20261021-204147
\`\`\`

O teste posterior confirmou que **a sessão antiga não causava a falha EISDIR**, pois o erro persistiu com a pasta de sessão arquivada. A nova sessão foi autenticada via QR na v0.4.5 e está funcional.

**Não excluir esse backup sem necessidade. Não restaurá-lo sobre a nova sessão funcional sem planejamento. Não subir backup, token, config.json, arquivos LocalAuth ou QR ao GitHub ou chat.** A pasta de sessão contém dados de autenticação.

## 6. Diagnósticos rápidos para um próximo atendimento (somente leitura)

Em **PowerShell**, com o Connect aberto:

\`\`\`powershell
# Verificar supervisor
try {
  Invoke-RestMethod "http://127.0.0.1:47850/status" -TimeoutSec 3 |
    Select-Object managedRunning, managedPid, desiredRunning, lastExitCode, restartFailures |
    Format-List
} catch {
  Write-Host "Supervisor indisponivel:" $_.Exception.Message
}

# Verificar agente
try {
  Invoke-RestMethod "http://127.0.0.1:47851/health" -TimeoutSec 3 |
    Select-Object instalado, configurado, conectado, authenticated, whatsapp_state, versao |
    Format-List
} catch {
  Write-Host "Agente indisponivel:" $_.Exception.Message
}

# Verificar histórico de erros de inicialização
Get-Content "$env:APPDATA\RiverLub\whatsapp-agent\logs\supervisor.log" -Tail 25

# Versão instalada (arquivo package.json do agente pode ter versão própria)
Get-Item "$env:LOCALAPPDATA\RiverLub Connect\riverlub-connect.exe" |
  Select-Object FullName, LastWriteTime
\`\`\`

Para verificar caminhos e dependências, identificar a pasta \`runtime\<versão>\`, depois consultar \`node.exe --version\` e os arquivos \`src\bootstrap.cjs\`, \`src\index.js\`. **Não presumir** que \`runtime\0.4.3\` ainda exista se o usuário já está em 0.4.5 ou posterior.

A interface também possui **Copiar diagnóstico** e **Eventos e logs**. Usar isso antes de apagar ou reinstalar qualquer coisa. Os logs podem conter caminhos locais e detalhes técnicos; revisar antes de compartilhá-los publicamente.

## 7. Regras de segurança e de investigação — não repetir os erros anteriores

1. **Não pedir senhas, tokens, conteúdo de \`config.json\`, QR Code ou cópias da sessão WhatsApp.**
2. **Não resetar nem apagar sessão** como primeira medida. Primeiro confirmar \`supervisor.log\` e \`agent.log\`, status do Node e a falha exata.
3. **Não recomendar abertura de firewall, liberação externa das portas 47850/47851 ou port forwarding**. São serviços locais \`127.0.0.1\`.
4. **Não modificar Supabase** para corrigir uma falha em que o Node encerra antes de abrir \`/health\`. Verificar banco/API somente se a execução local estiver funcionando e o erro indicar a comunicação remota.
5. **Não gerar sucessivos instaladores sem evidências**. Reproduzir problema em CI, corrigir, executar testes e só publicar release após aprovação.
6. Acompanhar eventos de shutdown e múltiplos supervisores. Antes de instalar atualização, **fechar o Connect e parar o Supervisor anterior** com cuidado. Não usar \`taskkill /IM node.exe /F\` porque pode afetar outros projetos.
7. Distinguir *agente iniciou* (\`/health\`), *WhatsApp autenticou* e *mensagem efetivamente enviada*; são etapas diferentes.
8. Em logs, **\`exit code 1\` é sintoma, não causa**. O erro real da v0.4.4 foi \`EISDIR/lstat 'C:'\`.

## 8. Instrução para outro chat / outra instância do ChatGPT

> **Contexto:** o projeto é o repositório GitHub \`jhefersonalvez2-netizen/riverlub-connect\`. Leia primeiro o arquivo da raiz \`instrução.md\` e examine a versão atual e \`src-tauri/src/lib.rs\`. Em 21/10/2026, a aplicação falhava com Node exit 1, Supervisor tentando reiniciar, e porta 47851 fechada. Foram realizados testes extensivos em PowerShell no primeiro e no segundo computador; o agente funcionava manualmente e o Supervisor também, mas a abertura gráfica falhava. A versão 0.4.4 revelou \`EISDIR: illegal operation on a directory, lstat 'C:'\` e paths \`\\?\C:\...\` vindos do Tauri. A v0.4.5 corrigiu a conversão desses caminhos, e o usuário **confirmou QR, autenticação e envio de orçamento no segundo PC**. O backup antigo da sessão foi preservado; o primeiro PC tinha corrupção do Windows independente. Não resetar sessão, não alterar Supabase e não criar novas releases sem evidência específica. Se surgir falha nova, obter \`supervisor.log\`, status das portas 47850/47851 e a versão atualmente instalada.

---

**Estado ao encerrar esta investigação:** **v0.4.5 funcional no segundo computador**, fluxo WhatsApp → orçamento validado. **Primeiro computador não revalidado**. Este arquivo descreve o histórico conhecido; novos incidentes devem ser acrescentados com data, versão, erro reproduzido, correção e validação.
