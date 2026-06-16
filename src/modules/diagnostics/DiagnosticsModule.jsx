import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, Database, RefreshCw, Server, ShieldCheck } from "lucide-react";
import {
  assertNoServiceRoleInDesktopEnv,
  getDesktopSecuritySummary,
  getDesktopSupabaseGuidance,
} from "../../lib/desktopDataProvider";
import { localAgentEndpoints } from "../../lib/localAgentClient";
import { getApiBaseUrl, getApiHealth, getCurrentUser } from "../../lib/riverlubApiClient";

function formatCheckedAt(value) {
  if (!value) return "Ainda nao testado";

  return new Date(value).toLocaleString("pt-BR");
}

function getHealthStatusLabel(result) {
  if (!result) return "Aguardando teste";
  if (result.ok) return `Online (${result.status})`;
  if (result.status) return `${result.error?.message || "Falha"} (${result.status})`;
  return result.error?.message || "Falha de rede";
}

function getAuthStatusLabel(result) {
  if (!result) return "Aguardando teste";
  if (result.ok) return "Autenticado";
  if (result.status === 401) return "Sem sessao autenticada";
  if (result.status === 403) return "Sessao sem permissao";
  if (result.status) return `${result.error?.message || "Falha"} (${result.status})`;
  return result.error?.message || "Falha de rede";
}

function getCurrentUserLabel(result) {
  const usuario = result?.data?.usuario;
  if (!usuario) return "-";

  return [usuario.nome, usuario.email, usuario.tipo]
    .filter(Boolean)
    .join(" | ");
}

function getCorsCookieMessage(health, auth) {
  const networkError = [health, auth].find((result) => result?.error?.code === "NETWORK_OR_CORS");
  if (networkError) return networkError.error.message;
  if (auth?.status === 401) return "Backend respondeu, mas nao ha cookie de sessao valido no Desktop.";
  return "Nenhum erro de CORS/cookie detectado no ultimo teste.";
}

export default function DiagnosticsModule() {
  const envCheck = assertNoServiceRoleInDesktopEnv();
  const security = getDesktopSecuritySummary();
  const supabase = getDesktopSupabaseGuidance();
  const [backendCheck, setBackendCheck] = useState({
    loading: false,
    health: null,
    auth: null,
    checkedAt: null,
  });

  const testarBackend = useCallback(async () => {
    setBackendCheck((current) => ({
      ...current,
      loading: true,
    }));

    const [health, auth] = await Promise.all([
      getApiHealth(),
      getCurrentUser(),
    ]);

    setBackendCheck({
      loading: false,
      health,
      auth,
      checkedAt: new Date().toISOString(),
    });
  }, []);

  useEffect(() => {
    testarBackend();
  }, [testarBackend]);

  const backendOnline = backendCheck.health?.ok;
  const backendTone = backendCheck.loading ? "warning" : backendOnline ? "success" : "danger";

  return (
    <div className="desktop-module">
      <header className="topbar desktop-module-topbar">
        <div>
          <p className="eyebrow">Diagnosticos</p>
          <h1>Verificacoes do RiverLub Desktop</h1>
          <p className="intro">
            Leitura local para confirmar portas, ambiente e riscos antes de conectar o Brain ao atendimento.
          </p>
        </div>
        <div className={`status-pill ${envCheck.ok ? "success" : "danger"}`}>
          {envCheck.ok ? <ShieldCheck size={18} /> : <AlertTriangle size={18} />}
          {envCheck.ok ? "Ambiente seguro" : "Revisar ambiente"}
        </div>
      </header>

      <section className="desktop-two-col">
        <article className="details-panel desktop-module-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Agentes locais</p>
              <h2>Portas previstas</h2>
            </div>
            <Activity size={20} />
          </div>
          <dl className="detail-list compact">
            <div>
              <dt>Connect Agent</dt>
              <dd>{localAgentEndpoints.connect}</dd>
            </div>
            <div>
              <dt>Brain Agent</dt>
              <dd>{localAgentEndpoints.brain}</dd>
            </div>
            <div>
              <dt>WhatsApp atual</dt>
              <dd>Preservado no modulo Connect.</dd>
            </div>
          </dl>
        </article>

        <article className="details-panel desktop-module-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Ambiente</p>
              <h2>Supabase desktop</h2>
            </div>
            <Database size={20} />
          </div>
          <dl className="detail-list compact">
            <div>
              <dt>SUPABASE_URL</dt>
              <dd>{security.supabaseUrlConfigured ? "configurada" : "nao configurada"}</dd>
            </div>
            <div>
              <dt>Anon key</dt>
              <dd>{security.supabaseAnonKeyConfigured ? "configurada" : "nao configurada"}</dd>
            </div>
            <div>
              <dt>Service role</dt>
              <dd>{envCheck.message}</dd>
            </div>
            <div>
              <dt>Acesso recomendado</dt>
              <dd>{supabase.recommendedClient}</dd>
            </div>
          </dl>
        </article>
      </section>

      <section className="details-panel desktop-module-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Backend RiverLub</p>
            <h2>Conexao segura com API</h2>
          </div>
          <div className={`status-pill ${backendTone}`}>
            <Server size={18} />
            {backendCheck.loading ? "Testando" : backendOnline ? "API online" : "API indisponivel"}
          </div>
        </div>
        <dl className="detail-list compact">
          <div>
            <dt>URL configurada</dt>
            <dd>{getApiBaseUrl()}</dd>
          </div>
          <div>
            <dt>/health</dt>
            <dd>{getHealthStatusLabel(backendCheck.health)}</dd>
          </div>
          <div>
            <dt>Autenticacao</dt>
            <dd>{getAuthStatusLabel(backendCheck.auth)}</dd>
          </div>
          <div>
            <dt>Usuario atual</dt>
            <dd>{getCurrentUserLabel(backendCheck.auth)}</dd>
          </div>
          <div>
            <dt>CORS/cookie</dt>
            <dd>{getCorsCookieMessage(backendCheck.health, backendCheck.auth)}</dd>
          </div>
          <div>
            <dt>Ultimo teste</dt>
            <dd>{formatCheckedAt(backendCheck.checkedAt)}</dd>
          </div>
        </dl>
        <div className="utility-row">
          <button className="btn secondary" type="button" onClick={testarBackend} disabled={backendCheck.loading}>
            <RefreshCw size={17} className={backendCheck.loading ? "spin" : ""} />
            Testar conexao
          </button>
        </div>
      </section>

      <section className="details-panel desktop-module-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Checklist</p>
            <h2>Riscos conhecidos</h2>
          </div>
          <ShieldCheck size={20} />
        </div>
        <ul className="desktop-check-list">
          {security.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
