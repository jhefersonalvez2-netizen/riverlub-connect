import { Activity, AlertTriangle, Database, ShieldCheck } from "lucide-react";
import {
  assertNoServiceRoleInDesktopEnv,
  getDesktopSecuritySummary,
  getDesktopSupabaseGuidance,
} from "../../lib/desktopDataProvider";
import { localAgentEndpoints } from "../../lib/localAgentClient";

export default function DiagnosticsModule() {
  const envCheck = assertNoServiceRoleInDesktopEnv();
  const security = getDesktopSecuritySummary();
  const supabase = getDesktopSupabaseGuidance();

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
