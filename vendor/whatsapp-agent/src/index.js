const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const qrcodeTerminal = require("qrcode-terminal");
const QRCode = require("qrcode");
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");

const AGENT_VERSION = "1.3.1";
const DEFAULT_API_URL = "https://api.riverlub.com.br/api";
const LOCAL_PORT = Number(process.env.RIVERLUB_AGENT_LOCAL_PORT || 47851);
const POLL_MS = Number(process.env.RIVERLUB_AGENT_POLL_MS || 5000);
const PING_MS = Number(process.env.RIVERLUB_AGENT_PING_MS || 20000);
const QR_EXPIRES_MS = Number(process.env.RIVERLUB_AGENT_QR_EXPIRES_MS || 75000);
const RECONNECT_DELAY_MS = Number(process.env.RIVERLUB_AGENT_RECONNECT_DELAY_MS || 3500);
const MAX_RECONNECT_ATTEMPTS = Number(process.env.RIVERLUB_AGENT_MAX_RECONNECT_ATTEMPTS || 5);
const DEFAULT_ALLOWED_ORIGINS = [
  "https://app.riverlub.com.br",
  "https://riverlub-frontend-vercel.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];
const DEFAULT_VERCEL_PROJECT_PREFIXES = [
  "riverlub-frontend-vercel",
];
const CONFIG_DIR = process.env.RIVERLUB_AGENT_CONFIG_DIR ||
  path.join(process.env.APPDATA || os.homedir(), "RiverLub", "whatsapp-agent");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");
const DATA_PATH = process.env.RIVERLUB_AGENT_DATA_PATH ||
  path.join(CONFIG_DIR, "session");
const LOG_DIR = process.env.RIVERLUB_AGENT_LOG_DIR ||
  path.join(CONFIG_DIR, "logs");
const LOG_PATH = path.join(LOG_DIR, "agent.log");
const MAX_LOG_BYTES = 1024 * 1024;
const MAX_ROTATED_LOGS = 5;
const MANAGED_BY_CONNECT = process.env.RIVERLUB_CONNECT_MANAGED === "1";

let apiUrl = DEFAULT_API_URL;
let agentToken = "";
let client = null;
let conectado = false;
let processandoJob = false;
let inicializandoPromise = null;
let filaTimer = null;
let pingTimer = null;
let chromeExecutablePath = null;
let reconnectTimer = null;
let localServer = null;
let encerrando = false;
let reconnectAttempts = 0;
let desconexaoSolicitada = false;
const estadoLocal = {
  iniciadoEm: new Date().toISOString(),
  atualizadoEm: new Date().toISOString(),
  ultimoEvento: "Agente local carregado",
  ultimoErro: null,
  ultimoQrEm: null,
  qrText: null,
  qrDataUrl: null,
  qrGeradoEm: null,
  qrExpiraEm: null,
  qrExpiradoEm: null,
  waitingQr: false,
  authenticated: false,
  sessionExpired: false,
  whatsappState: "STARTING",
  desconectadoMotivo: null,
};

function normalizarTexto(valor) {
  if (valor === undefined || valor === null) return "";
  return String(valor).trim();
}

function normalizarOrigem(valor) {
  const origem = normalizarTexto(valor);
  if (!origem) return "";

  try {
    const url = new URL(origem);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.origin.toLowerCase();
  } catch {
    return "";
  }
}

function normalizarApiUrl(valor) {
  return (normalizarTexto(valor) || DEFAULT_API_URL).replace(/\/+$/, "");
}

function garantirDiretorio(diretorio) {
  if (!fs.existsSync(diretorio)) {
    fs.mkdirSync(diretorio, { recursive: true });
  }
}

function limitarTexto(valor, limite = 2000) {
  const texto = normalizarTexto(valor);
  if (!texto) return "";
  return texto.length > limite ? texto.slice(0, limite) : texto;
}

function aguardar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function valoresUnicos(valores = []) {
  return Array.from(new Set(valores.filter(Boolean)));
}

function getTelefonesCandidatos(telefone) {
  const digitos = normalizarTexto(telefone).replace(/\D/g, "");
  if (!digitos) return [];

  const candidatos = [digitos];

  if ((digitos.length === 10 || digitos.length === 11) && !digitos.startsWith("55")) {
    candidatos.push(`55${digitos}`);
  }

  if (digitos.startsWith("55")) {
    if (digitos.length === 13 && digitos[4] === "9") {
      candidatos.push(`${digitos.slice(0, 4)}${digitos.slice(5)}`);
    }

    if (digitos.length === 12) {
      candidatos.push(`${digitos.slice(0, 4)}9${digitos.slice(4)}`);
    }
  }

  return valoresUnicos(candidatos);
}

function isErroLid(error) {
  return /no lid for user|\blid\b/i.test(serializarErro(error) || String(error || ""));
}

function serializarErro(error) {
  if (!error) return null;

  const partes = [
    error.message || String(error),
    error.stack ? String(error.stack).split("\n").slice(1, 8).join("\n") : "",
  ].filter(Boolean);

  return limitarTexto(partes.join("\n"), 3000);
}

function sanitizarLogValor(valor) {
  if (valor === undefined || valor === null) return valor;

  if (typeof valor === "string") {
    return limitarTexto(valor, 3000)
      .replace(/Bearer\s+[^\s"]+/gi, "Bearer [oculto]")
      .replace(/agentToken["']?\s*:\s*["'][^"']+["']/gi, 'agentToken: "[oculto]"')
      .replace(/rla_[a-f0-9]{24,}/gi, "rla_[oculto]")
      .replace(/data:image\/[^;\s]+;base64,[A-Za-z0-9+/=]+/g, "data:image/[qr-oculto]");
  }

  if (valor instanceof Error) {
    return sanitizarLogValor(serializarErro(valor));
  }

  if (Array.isArray(valor)) {
    return valor.slice(0, 25).map(sanitizarLogValor);
  }

  if (typeof valor === "object") {
    return Object.fromEntries(
      Object.entries(valor).map(([chave, item]) => {
        if (/token|authorization|qr/i.test(chave)) {
          return [chave, "[oculto]"];
        }
        return [chave, sanitizarLogValor(item)];
      })
    );
  }

  return valor;
}

function rotacionarLogSeNecessario() {
  try {
    if (!fs.existsSync(LOG_PATH)) return;
    const stat = fs.statSync(LOG_PATH);
    if (stat.size <= MAX_LOG_BYTES) return;

    const maisAntigo = `${LOG_PATH}.${MAX_ROTATED_LOGS}`;
    if (fs.existsSync(maisAntigo)) fs.rmSync(maisAntigo, { force: true });

    for (let indice = MAX_ROTATED_LOGS - 1; indice >= 1; indice -= 1) {
      const atual = `${LOG_PATH}.${indice}`;
      const proximo = `${LOG_PATH}.${indice + 1}`;
      if (fs.existsSync(atual)) {
        fs.renameSync(atual, proximo);
      }
    }

    fs.renameSync(LOG_PATH, `${LOG_PATH}.1`);
  } catch {}
}

function escreverLog(nivel, mensagem, extra = null) {
  try {
    garantirDiretorio(LOG_DIR);
    rotacionarLogSeNecessario();

    const linha = JSON.stringify({
      ts: new Date().toISOString(),
      nivel,
      mensagem: limitarTexto(sanitizarLogValor(mensagem), 1000),
      extra: sanitizarLogValor(extra),
    });

    fs.appendFileSync(LOG_PATH, `${linha}\n`, "utf8");
  } catch {}
}

function atualizarEstado(parcial = {}) {
  Object.assign(estadoLocal, {
    ...parcial,
    atualizadoEm: new Date().toISOString(),
  });
}

function limparQr(parcial = {}) {
  atualizarEstado({
    qrText: null,
    qrDataUrl: null,
    qrGeradoEm: null,
    qrExpiraEm: null,
    waitingQr: false,
    ...parcial,
  });
}

function expirarQrSeNecessario() {
  if (!estadoLocal.qrDataUrl || !estadoLocal.qrExpiraEm) return;

  const expiraEm = new Date(estadoLocal.qrExpiraEm);
  if (Number.isNaN(expiraEm.getTime()) || expiraEm.getTime() > Date.now()) return;

  limparQr({
    qrExpiradoEm: new Date().toISOString(),
    waitingQr: !conectado && !estadoLocal.authenticated,
    ultimoEvento: "QR Code expirado; aguardando novo QR do WhatsApp",
  });
  escreverLog("warn", "QR Code expirado; aguardando novo QR do WhatsApp");
}

function registrarQr(qr, qrDataUrl) {
  const agora = new Date();
  const geradoEm = agora.toISOString();
  const expiraEm = new Date(agora.getTime() + QR_EXPIRES_MS).toISOString();

  atualizarEstado({
    ultimoQrEm: geradoEm,
    qrText: qr,
    qrDataUrl,
    qrGeradoEm: geradoEm,
    qrExpiraEm: expiraEm,
    qrExpiradoEm: null,
    waitingQr: true,
    authenticated: false,
    sessionExpired: false,
    whatsappState: "WAITING_QR",
    desconectadoMotivo: null,
    ultimoErro: null,
  });
}

function cancelarReconexao() {
  if (!reconnectTimer) return;
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

function agendarReconexao(motivo = "") {
  if (!getConfigurado() || desconexaoSolicitada || reconnectTimer || inicializandoPromise) {
    return;
  }

  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    logWarn("Limite de tentativas de reconexao atingido", motivo || null);
    atualizarEstado({
      ultimoErro: "Sessao desconectada. Reinicie o agente para tentar novamente.",
      sessionExpired: true,
    });
    return;
  }

  reconnectAttempts += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    logInfo(`Tentando reconectar WhatsApp Web (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`, motivo || null);

    iniciarCliente({ reiniciar: true }).catch(async (error) => {
      logError("Falha ao reconectar WhatsApp Web", error);
      await ping("ERRO", {
        ultimo_evento: "Falha ao reconectar WhatsApp Web",
        erro_ultimo: error.message,
      });
      agendarReconexao("Falha na tentativa anterior");
    });
  }, RECONNECT_DELAY_MS);
}

function logInfo(mensagem, extra = null) {
  console.log(`[riverlub-agent] ${mensagem}`, extra || "");
  escreverLog("info", mensagem, extra);
  atualizarEstado({ ultimoEvento: mensagem });
}

function logWarn(mensagem, extra = null) {
  console.warn(`[riverlub-agent] ${mensagem}`, extra || "");
  escreverLog("warn", mensagem, extra);
  atualizarEstado({ ultimoEvento: mensagem });
}

function logError(mensagem, error = null) {
  const erroDetalhado = serializarErro(error) || limitarTexto(error, 3000) || mensagem;
  const erroPublico = limitarTexto(error?.message || error || mensagem, 800) || mensagem;
  console.error(`[riverlub-agent] ${mensagem}`, error || "");
  escreverLog("error", mensagem, erroDetalhado);
  atualizarEstado({
    ultimoEvento: mensagem,
    ultimoErro: erroPublico,
  });
}

function executarArquivo(programa, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      programa,
      args,
      {
        windowsHide: true,
        timeout: 5000,
        ...options,
      },
      (error, stdout, stderr) => {
        if (error) {
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
          return;
        }

        resolve({ stdout, stderr });
      }
    );
  });
}

function escapePowerShellSingleQuoted(value) {
  return String(value || "").replace(/'/g, "''");
}

function getLocalAuthUserDataDir() {
  return path.join(DATA_PATH, "session-riverlub-local-agent");
}

function isErroBrowserSessaoEmUso(error) {
  return /browser is already running|userDataDir/i.test(serializarErro(error) || String(error || ""));
}

async function listarBrowsersDaSessaoLocalAuth() {
  if (process.platform !== "win32") return [];

  const sessionPath = getLocalAuthUserDataDir();
  const escapedSessionPath = escapePowerShellSingleQuoted(sessionPath);
  const script = `
$sessionPath = '${escapedSessionPath}'
Get-CimInstance Win32_Process |
  Where-Object {
    $_.CommandLine -and
    $_.ProcessId -ne ${process.pid} -and
    ($_.Name -in @('chrome.exe','msedge.exe','chromium.exe')) -and
    $_.CommandLine.Contains($sessionPath)
  } |
  ForEach-Object { $_.ProcessId }
`;

  const { stdout } = await executarArquivo(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
    { timeout: 7000 }
  );

  return stdout
    .split(/\r?\n/)
    .map((linha) => Number(linha.trim()))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

async function encerrarBrowsersDaSessaoLocalAuth(motivo = "limpeza preventiva") {
  if (process.platform !== "win32") return [];

  try {
    const pids = await listarBrowsersDaSessaoLocalAuth();
    const unicos = valoresUnicos(pids);

    if (!unicos.length) return [];

    logWarn("Navegador antigo da sessao WhatsApp detectado; encerrando antes de iniciar", {
      motivo,
      pids: unicos,
      sessionPath: getLocalAuthUserDataDir(),
    });

    for (const pid of unicos) {
      await executarArquivo("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
        timeout: 7000,
      }).catch((error) => {
        logWarn(`Nao consegui encerrar navegador preso PID ${pid}`, error.message || error);
      });
    }

    await aguardar(1200);
    return unicos;
  } catch (error) {
    logWarn("Nao consegui verificar navegadores presos da sessao WhatsApp", error.message || error);
    return [];
  }
}

function carregarConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return {};
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) || {};
  } catch (error) {
    logWarn("Nao consegui ler config local", error);
    return {};
  }
}

function salvarConfig(config) {
  garantirDiretorio(CONFIG_DIR);
  fs.writeFileSync(
    CONFIG_PATH,
    JSON.stringify(
      {
        apiUrl: normalizarApiUrl(config.apiUrl),
        agentToken: normalizarTexto(config.agentToken),
        atualizadoEm: new Date().toISOString(),
      },
      null,
      2
    )
  );
}

function limparTokenLocal(motivo = "Token local limpo") {
  agentToken = "";
  salvarConfig({
    apiUrl,
    agentToken: "",
  });
  atualizarEstado({
    ultimoEvento: motivo,
    ultimoErro: null,
    whatsappState: conectado ? "CONNECTED" : "STARTING",
  });
  escreverLog("warn", motivo);
}

function aplicarConfig(config = {}) {
  apiUrl = normalizarApiUrl(
    process.env.RIVERLUB_API_URL ||
    config.apiUrl ||
    apiUrl ||
    DEFAULT_API_URL
  );
  agentToken = normalizarTexto(
    process.env.RIVERLUB_AGENT_TOKEN ||
    config.agentToken ||
    agentToken
  );
}

function getConfigurado() {
  return Boolean(apiUrl && agentToken);
}

function getTelefoneConectado() {
  return normalizarTexto(client?.info?.wid?.user).replace(/\D/g, "") || null;
}

function getNomeConta() {
  return normalizarTexto(client?.info?.pushname) || getTelefoneConectado();
}

async function chamarApi(caminho, body = {}) {
  if (!getConfigurado()) {
    throw new Error("Agente local ainda nao foi ativado pelo RiverLub");
  }

  const response = await fetch(`${apiUrl}${caminho}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${agentToken}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const mensagemErro = data?.erro || `Erro ${response.status} na API RiverLub`;
    if (response.status === 401 && /token.*invalido|token.*revogado/i.test(mensagemErro)) {
      limparTokenLocal("Token local expirado; aguardando nova ativacao pela tela do RiverLub");
    }
    throw new Error(mensagemErro);
  }

  return data;
}

async function ping(status, extra = {}) {
  if (!getConfigurado()) return;

  try {
    await chamarApi("/whatsapp/agente/ping", {
      status,
      ...extra,
    });
  } catch (error) {
    logError("Falha ao enviar status para API", error);
  }
}

async function aguardarDocumentoPronto(page) {
  try {
    await page.waitForFunction(
      () => {
        const root = document.querySelector("[data-riverlub-pdf-root]");
        if (!root) return false;

        const status = root.getAttribute("data-riverlub-pdf-status");
        return status === "ready" || status === "error";
      },
      { timeout: 30000 }
    );
  } catch (error) {
    throw new Error("URL do PDF nao retornou documento RiverLub pronto");
  }

  await page.waitForFunction(
    () => !document.fonts || document.fonts.status !== "loading",
    { timeout: 15000 }
  ).catch(() => {});

  const estadoDocumento = await page.evaluate(() => {
    const root = document.querySelector("[data-riverlub-pdf-root]");
    const status = root?.getAttribute("data-riverlub-pdf-status") || null;
    const erro =
      document.querySelector("[data-riverlub-pdf-error]")?.textContent?.trim() || null;

    return { status, erro };
  });

  if (estadoDocumento.status === "error") {
    throw new Error(estadoDocumento.erro || "Documento RiverLub retornou erro");
  }
}

async function gerarPdfDoLink(url, nomeArquivo) {
  if (!client?.pupBrowser) {
    throw new Error("Browser do WhatsApp ainda nao esta pronto para gerar PDF");
  }

  const page = await client.pupBrowser.newPage();

  try {
    await page.setViewport({
      width: 1440,
      height: 2200,
      deviceScaleFactor: 1,
    });

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });

    await aguardarDocumentoPronto(page);
    await page.emulateMediaType("screen");

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "12mm",
        right: "10mm",
        bottom: "12mm",
        left: "10mm",
      },
    });

    return new MessageMedia(
      "application/pdf",
      Buffer.from(pdf).toString("base64"),
      nomeArquivo || "riverlub-documento.pdf"
    );
  } finally {
    await page.close().catch(() => {});
  }
}

async function forcarResolucaoLid(chatId) {
  if (typeof client.getContactLidAndPhone !== "function") {
    return null;
  }

  const resultado = await client.getContactLidAndPhone([chatId]);
  return Array.isArray(resultado) ? resultado[0] || null : null;
}

async function resolverDestinoWhatsApp(telefoneOriginal) {
  const candidatos = getTelefonesCandidatos(telefoneOriginal);

  if (!candidatos.length) {
    throw new Error("Telefone de destino invalido");
  }

  let ultimoErro = null;

  for (const telefone of candidatos) {
    try {
      const numeroRegistrado = await client.getNumberId(telefone);
      const pn = numeroRegistrado?._serialized || null;

      if (!pn) {
        logWarn(`Telefone ${telefone} nao encontrado no WhatsApp`);
        continue;
      }

      let lid = null;
      try {
        const resolucao = await forcarResolucaoLid(pn);
        lid = resolucao?.lid || null;
      } catch (error) {
        ultimoErro = error;
        logWarn(`Nao consegui carregar LID do telefone ${telefone}`, error);
      }

      return {
        telefone,
        pn,
        lid,
        ids: valoresUnicos([lid, pn]),
      };
    } catch (error) {
      ultimoErro = error;
      logWarn(`Falha ao validar telefone ${telefone} no WhatsApp`, error);
    }
  }

  if (ultimoErro && !isErroLid(ultimoErro)) {
    throw new Error(`Nao consegui validar o telefone no WhatsApp: ${ultimoErro.message || ultimoErro}`);
  }

  throw new Error("Telefone nao encontrado no WhatsApp ou ainda nao disponivel para envio");
}

async function enviarParaDestino(destino, conteudo, opcoes = undefined) {
  let ultimoErro = null;

  for (const chatId of destino.ids) {
    for (let tentativa = 1; tentativa <= 2; tentativa += 1) {
      try {
        return await client.sendMessage(chatId, conteudo, opcoes);
      } catch (error) {
        ultimoErro = error;

        if (!isErroLid(error)) {
          throw error;
        }

        logWarn(`Falha de LID ao enviar para ${chatId}; tentativa ${tentativa}`, error);

        if (tentativa === 1) {
          await forcarResolucaoLid(chatId).catch((erroResolucao) => {
            logWarn(`Resolucao extra de LID falhou para ${chatId}`, erroResolucao);
          });
          await aguardar(700);
        }
      }
    }
  }

  if (ultimoErro && isErroLid(ultimoErro)) {
    throw new Error(
      "WhatsApp Web nao conseguiu resolver o identificador interno deste contato. Confirme se o numero tem WhatsApp ativo e tente novamente."
    );
  }

  throw ultimoErro || new Error("Nao consegui enviar mensagem pelo WhatsApp");
}

function normalizarPayloadJob(job) {
  const payload = job?.payload;
  if (!payload) return {};
  if (typeof payload === "object" && !Array.isArray(payload)) return payload;

  try {
    const parsed = JSON.parse(String(payload));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function montarCaptionDocumento(job, documento = {}) {
  const payload = normalizarPayloadJob(job);
  const captionInformado = normalizarTexto(documento.caption || payload.documento_caption);
  if (captionInformado) return captionInformado;

  const osId = normalizarTexto(payload.os_id);
  const tipoEvento = normalizarTexto(documento.tipo_evento || payload.tipo_evento).toUpperCase();
  const documentoTipo = normalizarTexto(documento.documento_tipo || payload.documento_tipo).toLowerCase();
  const nomeArquivo = normalizarTexto(documento.filename || job.documento_nome).toLowerCase();

  if (
    tipoEvento.includes("RECIBO") ||
    documentoTipo.includes("recibo") ||
    nomeArquivo.includes("recibo")
  ) {
    return osId ? `Recibo da O.S. #${osId}` : "Recibo da O.S.";
  }

  if (
    tipoEvento.includes("OS_FINALIZADA") ||
    documentoTipo.includes("os_finalizada") ||
    nomeArquivo.includes("finalizada")
  ) {
    return osId ? `O.S. #${osId} finalizada` : "O.S. finalizada";
  }

  if (
    tipoEvento.includes("ORCAMENTO") ||
    documentoTipo.includes("orcamento") ||
    nomeArquivo.includes("orcamento")
  ) {
    return osId ? `Orcamento da O.S. #${osId}` : "Orcamento RiverLub";
  }

  return "Documento RiverLub em PDF.";
}

function montarDocumentosJob(job) {
  const payload = normalizarPayloadJob(job);
  const documentos = [];

  if (job.documento_url && job.documento_gerar_pdf) {
    documentos.push({
      url_pdf: job.documento_url,
      filename: job.documento_nome || "riverlub-documento.pdf",
      tipo_evento: payload.tipo_evento,
      documento_tipo: payload.documento_tipo,
      caption: montarCaptionDocumento(job),
    });
  }

  const adicionais = Array.isArray(payload.documentos_adicionais)
    ? payload.documentos_adicionais
    : [];

  for (const documento of adicionais) {
    const urlPdf = normalizarTexto(documento?.url_pdf || documento?.documento_url);
    if (!urlPdf || documento?.gerar_pdf === false) continue;

    documentos.push({
      url_pdf: urlPdf,
      filename: normalizarTexto(documento.filename || documento.documento_nome) || "riverlub-documento.pdf",
      tipo_evento: documento.tipo_evento,
      documento_tipo: documento.documento_tipo,
      caption: montarCaptionDocumento(job, documento),
    });
  }

  return documentos;
}

async function enviarDocumentoPdf(destino, job, documento) {
  try {
    const media = await gerarPdfDoLink(documento.url_pdf, documento.filename);
    await enviarParaDestino(destino, media, {
      sendMediaAsDocument: true,
      caption: montarCaptionDocumento(job, documento),
    });
  } catch (error) {
    throw new Error(`PDF nao anexado: ${error.message}`);
  }
}

async function enviarJob(job) {
  if (job.tipo === "DESCONECTAR") {
    desconexaoSolicitada = true;
    cancelarReconexao();
    limparQr({
      authenticated: false,
      sessionExpired: true,
      whatsappState: "DISCONNECTED",
      desconectadoMotivo: "Comando remoto de desconexao",
    });
    await ping("DESCONECTADO", {
      ultimo_evento: "Agente recebeu comando de desconexao",
    });
    await client?.logout().catch(() => {});
    await client?.destroy().catch(() => {});
    client = null;
    conectado = false;
    return {
      status: "ENVIADO",
      provider_message_id: `local-disconnect-${Date.now()}`,
    };
  }

  const telefone = normalizarTexto(job.destinatario_telefone).replace(/\D/g, "");
  const mensagem = normalizarTexto(job.mensagem);
  const documentos = montarDocumentosJob(job);

  if (!telefone || (!mensagem && documentos.length === 0)) {
    throw new Error("Job sem telefone, mensagem ou documento");
  }

  const destino = await resolverDestinoWhatsApp(telefone);

  if (mensagem) {
    await enviarParaDestino(destino, mensagem);
  }

  for (const documento of documentos) {
    await enviarDocumentoPdf(destino, job, documento);
  }

  return {
    status: "ENVIADO",
    provider_message_id: `local-${Date.now()}-${job.id}`,
    aviso_documento: null,
  };
}

async function processarFila() {
  if (!getConfigurado() || !conectado || processandoJob) return;

  processandoJob = true;

  try {
    const data = await chamarApi("/whatsapp/agente/jobs/proximo", {});
    const job = data?.job;

    if (!job) return;

    logInfo(`Processando job #${job.id} (${job.tipo})`);

    try {
      const resultado = await enviarJob(job);

      await chamarApi(`/whatsapp/agente/jobs/${job.id}/concluir`, {
        status: "ENVIADO",
        provider_message_id: resultado.provider_message_id,
        erro_ultimo: resultado.aviso_documento || null,
      });

      logInfo(`Job #${job.id} enviado`);
    } catch (error) {
      await chamarApi(`/whatsapp/agente/jobs/${job.id}/concluir`, {
        status: "FALHA",
        erro_ultimo: error.message,
      });

      logError(`Falha no job #${job.id}`, error);
    }
  } catch (error) {
    logError("Falha ao processar fila", error);
  } finally {
    processandoJob = false;
  }
}

function configurarTimers() {
  if (!pingTimer) {
    pingTimer = setInterval(() => {
      if (conectado) {
        ping("CONECTADO", {
          telefone_conectado: getTelefoneConectado(),
          nome_conta: getNomeConta(),
          ultimo_evento: "Heartbeat do agente local",
          erro_ultimo: null,
        });
      }
    }, PING_MS);
  }

  if (!filaTimer) {
    filaTimer = setInterval(processarFila, POLL_MS);
  }
}

async function encerrarClienteAtual() {
  conectado = false;

  if (!client) return;

  const atual = client;
  client = null;

  await atual.destroy().catch(() => {});
  await encerrarBrowsersDaSessaoLocalAuth("apos encerrar cliente atual");
}

async function encerrarAgente(motivo = "Encerrando agente local", codigo = 0) {
  if (encerrando) return;
  encerrando = true;
  desconexaoSolicitada = true;
  cancelarReconexao();

  if (filaTimer) {
    clearInterval(filaTimer);
    filaTimer = null;
  }

  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }

  logInfo(motivo);
  await ping("DESCONECTADO", {
    ultimo_evento: motivo,
  });
  await encerrarClienteAtual();

  if (localServer) {
    await new Promise((resolve) => {
      localServer.close(() => resolve());
      setTimeout(resolve, 1200);
    }).catch(() => {});
  }

  process.exit(codigo);
}

function getChromeExecutablePath() {
  const candidatos = [
    process.env.RIVERLUB_AGENT_CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe")
      : null,
    process.env.PROGRAMFILES
      ? path.join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe")
      : null,
    process.env["PROGRAMFILES(X86)"]
      ? path.join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe")
      : null,
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "Microsoft", "Edge", "Application", "msedge.exe")
      : null,
    process.env.PROGRAMFILES
      ? path.join(process.env.PROGRAMFILES, "Microsoft", "Edge", "Application", "msedge.exe")
      : null,
    process.env["PROGRAMFILES(X86)"]
      ? path.join(process.env["PROGRAMFILES(X86)"], "Microsoft", "Edge", "Application", "msedge.exe")
      : null,
  ].filter(Boolean);

  return candidatos.find((candidato) => {
    try {
      return fs.existsSync(candidato);
    } catch {
      return false;
    }
  }) || null;
}

function getPuppeteerOptions() {
  chromeExecutablePath = getChromeExecutablePath();

  if (chromeExecutablePath) {
    logInfo(`Usando navegador local: ${chromeExecutablePath}`);
  } else {
    logWarn("Chrome/Edge local nao encontrado; tentando navegador baixado pelo Puppeteer");
  }

  return {
    headless: true,
    executablePath: chromeExecutablePath || undefined,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-zygote",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-features=Translate,BackForwardCache",
    ],
  };
}

function criarCliente() {
  garantirDiretorio(DATA_PATH);

  const novoClient = new Client({
    authStrategy: new LocalAuth({
      clientId: "riverlub-local-agent",
      dataPath: DATA_PATH,
    }),
    authTimeoutMs: 60000,
    qrMaxRetries: 0,
    takeoverOnConflict: true,
    takeoverTimeoutMs: 0,
    puppeteer: getPuppeteerOptions(),
  });

  novoClient.on("qr", async (qr) => {
    conectado = false;
    desconexaoSolicitada = false;
    logInfo("QR recebido para pareamento");
    qrcodeTerminal.generate(qr, { small: true });

    const qrDataUrl = await QRCode.toDataURL(qr, {
      margin: 1,
      width: 320,
    });
    registrarQr(qr, qrDataUrl);
    logInfo("QR Code real disponivel no servidor local do agente");

    await ping("AGUARDANDO_QR", {
      qr_data_url: qrDataUrl,
      ultimo_evento: "QR gerado no agente local",
      erro_ultimo: null,
    });
  });

  novoClient.on("authenticated", async () => {
    limparQr({
      authenticated: true,
      sessionExpired: false,
      whatsappState: "AUTHENTICATED",
      desconectadoMotivo: null,
      ultimoErro: null,
    });
    logInfo("Sessao autenticada; sincronizando WhatsApp Web");
    await ping("INICIALIZANDO", {
      ultimo_evento: "Sessao autenticada; sincronizando WhatsApp Web",
      erro_ultimo: null,
    });
  });

  novoClient.on("ready", async () => {
    conectado = true;
    reconnectAttempts = 0;
    cancelarReconexao();
    limparQr({
      authenticated: true,
      sessionExpired: false,
      whatsappState: "CONNECTED",
      desconectadoMotivo: null,
      ultimoErro: null,
    });
    logInfo("WhatsApp conectado e pronto");
    await ping("CONECTADO", {
      telefone_conectado: getTelefoneConectado(),
      nome_conta: getNomeConta(),
      ultimo_evento: "WhatsApp da oficina conectado no agente local",
      erro_ultimo: null,
    });
  });

  novoClient.on("auth_failure", async (mensagem) => {
    conectado = false;
    limparQr({
      authenticated: false,
      sessionExpired: true,
      whatsappState: "AUTH_FAILURE",
      desconectadoMotivo: mensagem || "Falha de autenticacao",
    });
    logError("Falha de autenticacao no WhatsApp Web", mensagem);
    await ping("ERRO", {
      ultimo_evento: "Falha de autenticacao no WhatsApp Web",
      erro_ultimo: mensagem || "Falha de autenticacao",
    });
    agendarReconexao("Falha de autenticacao");
  });

  novoClient.on("disconnected", async (motivo) => {
    conectado = false;
    limparQr({
      authenticated: false,
      sessionExpired: true,
      whatsappState: "DISCONNECTED",
      desconectadoMotivo: motivo || "WhatsApp desconectado",
    });
    logWarn("WhatsApp desconectado", motivo);
    await ping("DESCONECTADO", {
      ultimo_evento: motivo || "WhatsApp desconectado",
      erro_ultimo: null,
    });

    if (!desconexaoSolicitada) {
      agendarReconexao(motivo || "WhatsApp desconectado");
    }
  });

  novoClient.on("loading_screen", (percent, mensagem) => {
    if (!estadoLocal.waitingQr && !conectado) {
      atualizarEstado({
        whatsappState: "LOADING",
        sessionExpired: false,
      });
    }
    logInfo(`Carregando WhatsApp Web ${percent || 0}%`, mensagem || null);
  });

  novoClient.on("change_state", (state) => {
    atualizarEstado({
      whatsappState: state || estadoLocal.whatsappState,
    });
    logInfo(`Estado interno alterado para ${state}`);
  });

  return novoClient;
}

async function iniciarCliente({ reiniciar = false } = {}) {
  if (!getConfigurado()) {
    logInfo("Aguardando ativacao pela tela do RiverLub");
    return null;
  }

  if (inicializandoPromise) return inicializandoPromise;

  inicializandoPromise = (async () => {
    desconexaoSolicitada = false;
    atualizarEstado({
      whatsappState: reiniciar ? "RECONNECTING" : "STARTING",
      sessionExpired: false,
    });

    if (reiniciar || !client) {
      await encerrarClienteAtual();
      await encerrarBrowsersDaSessaoLocalAuth("antes de iniciar cliente WhatsApp Web");
      client = criarCliente();
    }

    logInfo("Iniciando agente local");
    logInfo(`API: ${apiUrl}`);
    logInfo(`Sessao local: ${DATA_PATH}`);

    await ping("INICIALIZANDO", {
      ultimo_evento: "Agente local iniciando",
      erro_ultimo: null,
    });

    for (let tentativa = 1; tentativa <= 2; tentativa += 1) {
      try {
        await client.initialize();
        configurarTimers();
        return client;
      } catch (error) {
        const podeTentarLimpeza = tentativa === 1 && isErroBrowserSessaoEmUso(error);

        if (podeTentarLimpeza) {
          logWarn("Sessao LocalAuth estava presa por navegador antigo; limpando e tentando novamente", error.message || error);
          await encerrarClienteAtual();
          await encerrarBrowsersDaSessaoLocalAuth("apos erro de navegador em uso");
          client = criarCliente();
          continue;
        }

        logError("Erro ao iniciar cliente WhatsApp Web", error);
        await ping("ERRO", {
          ultimo_evento: "Erro ao iniciar agente local",
          erro_ultimo: error.message || "Erro ao iniciar WhatsApp Web",
        });
        throw error;
      }
    }

    return client;
  })();

  try {
    return await inicializandoPromise;
  } finally {
    inicializandoPromise = null;
  }
}

function origemPermitida(origin) {
  const origem = normalizarOrigem(origin);
  if (!origem) return true;

  const configuradas = [
    ...DEFAULT_ALLOWED_ORIGINS,
    ...normalizarTexto(process.env.RIVERLUB_AGENT_ALLOWED_ORIGINS).split(","),
  ]
    .map(normalizarOrigem)
    .filter(Boolean);

  if (configuradas.includes(origem)) {
    return true;
  }

  try {
    const url = new URL(origem);
    const hostname = url.hostname.toLowerCase();

    if ((hostname === "localhost" || hostname === "127.0.0.1") && url.port === "3000") {
      return true;
    }

    if (hostname.endsWith(".vercel.app")) {
      const hostnamePrefix = hostname.slice(0, -".vercel.app".length);
      const prefixes = [
        ...DEFAULT_VERCEL_PROJECT_PREFIXES,
        ...normalizarTexto(process.env.RIVERLUB_AGENT_VERCEL_PROJECT_PREFIXES).split(","),
      ]
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);

      return prefixes.some(
        (prefix) => hostnamePrefix === prefix || hostnamePrefix.startsWith(`${prefix}-`)
      );
    }
  } catch {
    return false;
  }

  return false;
}

function aplicarCors(req, res) {
  const origin = req.headers.origin || "";

  if (origemPermitida(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function enviarJson(req, res, status, payload) {
  aplicarCors(req, res);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function lerBodyJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 64) {
        reject(new Error("Payload grande demais"));
        req.destroy();
      }
    });

    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("JSON invalido"));
      }
    });
  });
}

async function ativarPeloBrowser(payload) {
  const novoApiUrl = normalizarApiUrl(payload.apiUrl || payload.api_url || DEFAULT_API_URL);
  const novoToken = normalizarTexto(payload.agentToken || payload.agent_token);

  if (!novoToken) {
    throw new Error("Token do agente local nao recebido");
  }

  aplicarConfig({
    apiUrl: novoApiUrl,
    agentToken: novoToken,
  });

  salvarConfig({
    apiUrl,
    agentToken,
  });
  desconexaoSolicitada = false;
  reconnectAttempts = 0;
  cancelarReconexao();
  atualizarEstado({
    ultimoErro: null,
    sessionExpired: false,
    whatsappState: "STARTING",
  });
  logInfo("Agente local ativado pela tela do RiverLub");

  void iniciarCliente({ reiniciar: true }).catch(async (error) => {
    logError("Falha ao iniciar apos ativacao", error);
    await ping("ERRO", {
      ultimo_evento: "Erro ao iniciar agente local",
      erro_ultimo: error.message,
    });
  });
}

function getStatusLocal({ incluirQr = false } = {}) {
  expirarQrSeNecessario();
  const telefoneConectado = getTelefoneConectado();
  const nomeConta = getNomeConta();
  const qrAvailable = Boolean(estadoLocal.qrDataUrl && !estadoLocal.qrExpiradoEm && !conectado);
  const qrExpiresAt = estadoLocal.qrExpiraEm || null;

  return {
    sucesso: true,
    instalado: true,
    configurado: getConfigurado(),
    managed_by_connect: MANAGED_BY_CONNECT,
    process_origin: MANAGED_BY_CONNECT ? "CONNECT" : "EXTERNAL",
    conectado,
    connected: conectado,
    authenticated: estadoLocal.authenticated,
    pronto_para_envio: conectado,
    telefone_conectado: telefoneConectado,
    nome_conta: nomeConta,
    waiting_qr: estadoLocal.waitingQr,
    qr_available: qrAvailable,
    qr_expires_at: qrExpiresAt,
    expires_at: qrExpiresAt,
    session_expired: estadoLocal.sessionExpired,
    inicializando: Boolean(inicializandoPromise),
    apiUrl,
    porta: LOCAL_PORT,
    versao: AGENT_VERSION,
    runtime_origin: process.env.RIVERLUB_AGENT_RUNTIME_ORIGIN || "UNKNOWN",
    runtime_dir: process.env.RIVERLUB_AGENT_RUNTIME_DIR || __dirname,
    ultimo_evento: estadoLocal.ultimoEvento,
    last_event: estadoLocal.ultimoEvento,
    erro_ultimo: estadoLocal.ultimoErro,
    last_error: estadoLocal.ultimoErro,
    iniciado_em: estadoLocal.iniciadoEm,
    atualizado_em: estadoLocal.atualizadoEm,
    ultimo_qr_em: estadoLocal.ultimoQrEm,
    qr_text: incluirQr ? estadoLocal.qrText : null,
    qr_data_url: incluirQr ? estadoLocal.qrDataUrl : null,
    qr_gerado_em: estadoLocal.qrGeradoEm,
    qr_expira_em: estadoLocal.qrExpiraEm,
    qr_expirado_em: estadoLocal.qrExpiradoEm,
    qr_expires_ms: QR_EXPIRES_MS,
    whatsapp_state: estadoLocal.whatsappState,
    desconectado_motivo: estadoLocal.desconectadoMotivo,
    navegador_local: chromeExecutablePath,
  };
}

function iniciarServidorLocal() {
  localServer = http.createServer(async (req, res) => {
    aplicarCors(req, res);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (!origemPermitida(req.headers.origin || "")) {
      enviarJson(req, res, 403, {
        sucesso: false,
        erro: "Origem nao autorizada para ativar o agente local",
      });
      return;
    }

    if (req.method === "GET" && req.url === "/health") {
      enviarJson(req, res, 200, getStatusLocal());
      return;
    }

    if (req.method === "GET" && req.url === "/qr") {
      const status = getStatusLocal({ incluirQr: true });
      enviarJson(req, res, 200, {
        sucesso: true,
        qr_text: status.qr_text,
        qr_data_url: status.qr_data_url,
        qr_available: status.qr_available,
        qr_gerado_em: status.qr_gerado_em,
        qr_expira_em: status.qr_expira_em,
        qr_expires_at: status.qr_expires_at,
        expires_at: status.expires_at,
        qr_expirado_em: status.qr_expirado_em,
        waiting_qr: status.waiting_qr,
        authenticated: status.authenticated,
        connected: status.connected,
        conectado: status.conectado,
        pronto_para_envio: status.pronto_para_envio,
        telefone_conectado: status.telefone_conectado,
        nome_conta: status.nome_conta,
        session_expired: status.session_expired,
        whatsapp_state: status.whatsapp_state,
        ultimo_evento: status.ultimo_evento,
        last_event: status.last_event,
        erro_ultimo: status.erro_ultimo,
        last_error: status.last_error,
        process_origin: status.process_origin,
        managed_by_connect: status.managed_by_connect,
      });
      return;
    }

    if (req.method === "POST" && req.url === "/ativar") {
      try {
        const payload = await lerBodyJson(req);
        await ativarPeloBrowser(payload);
        enviarJson(req, res, 200, {
          ...getStatusLocal(),
          mensagem: "Agente local ativado",
        });
      } catch (error) {
        enviarJson(req, res, 400, {
          sucesso: false,
          erro: error.message || "Erro ao ativar agente local",
        });
      }
      return;
    }

    if (req.method === "POST" && req.url === "/desconectar") {
      desconexaoSolicitada = true;
      cancelarReconexao();
      limparQr({
        authenticated: false,
        sessionExpired: true,
        whatsappState: "DISCONNECTED",
        desconectadoMotivo: "Desconexao solicitada pela tela local",
      });
      await ping("DESCONECTADO", {
        ultimo_evento: "Desconexao solicitada pela tela local",
      });
      await client?.logout().catch(() => {});
      await encerrarClienteAtual();
      enviarJson(req, res, 200, getStatusLocal());
      return;
    }

    if (req.method === "POST" && req.url === "/shutdown") {
      if (!MANAGED_BY_CONNECT) {
        enviarJson(req, res, 403, {
          sucesso: false,
          erro: "Shutdown local permitido apenas para runtime gerenciado explicitamente",
        });
        return;
      }

      enviarJson(req, res, 200, {
        sucesso: true,
        mensagem: "Agente local encerrando por comando gerenciado",
      });

      setTimeout(() => {
        void encerrarAgente("Agente local encerrado por comando gerenciado", 0);
      }, 30);
      return;
    }

    enviarJson(req, res, 404, {
      sucesso: false,
      erro: "Rota local nao encontrada",
    });
  });

  localServer.listen(LOCAL_PORT, "127.0.0.1", () => {
    logInfo(`Servidor local ativo em http://127.0.0.1:${LOCAL_PORT}`);
  });

  localServer.on("error", (error) => {
    logError("Erro no servidor local", error);
  });
}

function carregarConfigInicial() {
  aplicarConfig(carregarConfig());
}

process.on("SIGINT", () => {
  void encerrarAgente("Agente local encerrado por SIGINT", 0);
});

process.on("SIGTERM", () => {
  void encerrarAgente("Agente local encerrado por SIGTERM", 0);
});

carregarConfigInicial();
iniciarServidorLocal();
configurarTimers();

iniciarCliente().catch(async (error) => {
  logError("Erro fatal ao iniciar agente local", error);
  await ping("ERRO", {
    ultimo_evento: "Erro fatal ao iniciar agente local",
    erro_ultimo: error.message,
  });
});

process.on("uncaughtException", (error) => {
  logError("Excecao nao tratada no agente local", error);
});

process.on("unhandledRejection", (error) => {
  logError("Promise rejeitada no agente local", error);
});
