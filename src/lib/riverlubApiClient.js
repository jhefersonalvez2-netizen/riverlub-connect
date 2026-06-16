const DEFAULT_API_BASE_URL = "https://api.riverlub.com.br";
const DEFAULT_TIMEOUT_MS = 8000;

function sanitizeLogValue(value) {
  return String(value || "")
    .replace(/Bearer\s+[^\s"]+/gi, "Bearer [oculto]")
    .replace(/riverlub_session=[^;\s"]+/gi, "riverlub_session=[oculto]")
    .replace(/token["']?\s*:\s*["'][^"']+["']/gi, 'token: "[oculto]"')
    .replace(/senha["']?\s*:\s*["'][^"']+["']/gi, 'senha: "[oculto]"');
}

function safeLog(level, message, meta = {}) {
  if (!import.meta.env.DEV) return;

  const safeMeta = Object.fromEntries(
    Object.entries(meta || {}).map(([key, value]) => [key, sanitizeLogValue(value)])
  );

  const logger = typeof console[level] === "function"
    ? console[level].bind(console)
    : console.info.bind(console);
  logger(`[riverlub-api] ${sanitizeLogValue(message)}`, safeMeta);
}

function normalizeBaseUrl(value) {
  const candidate = String(value || "").trim() || DEFAULT_API_BASE_URL;

  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol)) {
      return DEFAULT_API_BASE_URL;
    }
    return url.toString().replace(/\/+$/, "");
  } catch (_error) {
    return DEFAULT_API_BASE_URL;
  }
}

function buildUrl(path) {
  const normalizedPath = String(path || "").startsWith("/")
    ? String(path || "")
    : `/${String(path || "")}`;

  return `${API_BASE_URL}${normalizedPath}`;
}

function serializeBody(body, headers) {
  if (body === undefined || body === null) return undefined;
  if (body instanceof FormData) return body;
  if (typeof body === "string") return body;

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return JSON.stringify(body);
}

function extractMessage(payload, fallback) {
  if (!payload) return fallback;
  if (typeof payload === "string") return payload || fallback;
  return payload.erro || payload.error || payload.mensagem || payload.message || fallback;
}

function normalizeHttpError(status, payload, statusText) {
  if (status === 401) {
    return {
      code: "UNAUTHORIZED",
      message: "Sessao nao autenticada ou cookie nao aceito pelo backend.",
      category: "auth",
    };
  }

  if (status === 403) {
    return {
      code: "FORBIDDEN",
      message: "Acesso negado para este usuario/oficina.",
      category: "auth",
    };
  }

  if (status >= 500) {
    return {
      code: "SERVER_ERROR",
      message: "Backend RiverLub retornou erro interno.",
      category: "server",
    };
  }

  return {
    code: "API_ERROR",
    message: extractMessage(payload, statusText || "Erro ao chamar backend RiverLub."),
    category: "api",
  };
}

function normalizeNetworkError(error, timedOut) {
  if (timedOut || error?.name === "AbortError") {
    return {
      code: "TIMEOUT",
      message: "Tempo limite ao chamar o backend RiverLub.",
      category: "network",
    };
  }

  return {
    code: "NETWORK_OR_CORS",
    message: "Nao foi possivel conectar ao backend. Verifique rede, CORS ou cookies no Tauri.",
    category: "network",
  };
}

export const API_BASE_URL = normalizeBaseUrl(import.meta.env.VITE_RIVERLUB_API_URL);

export function getApiBaseUrl() {
  return API_BASE_URL;
}

export async function apiRequest(path, options = {}) {
  const {
    body,
    headers: customHeaders = {},
    method,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    credentials = "include",
    ...fetchOptions
  } = options;

  const controller = new AbortController();
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const headers = new Headers(customHeaders);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  const url = buildUrl(path);
  const requestMethod = method || (body === undefined ? "GET" : "POST");

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      method: requestMethod,
      credentials,
      headers,
      body: serializeBody(body, headers),
      signal: controller.signal,
      cache: fetchOptions.cache || "no-store",
    });

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json().catch(() => null)
      : await response.text().catch(() => "");

    if (!response.ok) {
      const error = normalizeHttpError(response.status, payload, response.statusText);
      safeLog("warn", "Resposta de erro do backend", {
        path,
        method: requestMethod,
        status: response.status,
        code: error.code,
      });

      return {
        ok: false,
        status: response.status,
        data: null,
        error,
      };
    }

    return {
      ok: true,
      status: response.status,
      data: payload,
      error: null,
    };
  } catch (error) {
    const normalizedError = normalizeNetworkError(error, timedOut);
    safeLog("warn", "Falha de rede no backend", {
      path,
      method: requestMethod,
      code: normalizedError.code,
      message: normalizedError.message,
    });

    return {
      ok: false,
      status: 0,
      data: null,
      error: normalizedError,
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

export function getApiHealth() {
  return apiRequest("/health", {
    method: "GET",
    timeoutMs: 5000,
  });
}

export function getCurrentUser() {
  return apiRequest("/api/auth/me", {
    method: "GET",
    timeoutMs: 7000,
  });
}

export function loginWithEmailPassword(email, senha) {
  return apiRequest("/api/auth/login", {
    method: "POST",
    body: {
      email,
      senha,
    },
    timeoutMs: 10000,
  });
}

export function logout() {
  return apiRequest("/api/auth/logout", {
    method: "POST",
    timeoutMs: 7000,
  });
}
