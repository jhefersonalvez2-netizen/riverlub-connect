import { Database, MonitorCog, ShieldCheck } from "lucide-react";
import {
  DESKTOP_DATA_SECURITY_POLICY,
  getDesktopModuleStatus,
  getDesktopSupabaseGuidance,
} from "../../lib/desktopDataProvider";

export default function SystemModule() {
  const modules = getDesktopModuleStatus();
  const supabase = getDesktopSupabaseGuidance();

  return (
    <div className="desktop-module">
      <header className="topbar desktop-module-topbar">
        <div>
          <p className="eyebrow">Sistema</p>
          <h1>Arquitetura local</h1>
          <p className="intro">
            Painel inicial para status dos modulos, politicas locais e fronteira segura de dados.
          </p>
        </div>
        <div className="status-pill success">
          <ShieldCheck size={18} />
          Service role fora do desktop
        </div>
      </header>

      <section className="desktop-card-grid">
        {modules.map((module) => (
          <article className="desktop-info-card" key={module.key}>
            <div className="desktop-info-head">
              <MonitorCog size={18} />
              <strong>{module.title}</strong>
            </div>
            <p>{module.status}</p>
            <small>{module.detail}</small>
          </article>
        ))}
      </section>

      <section className="desktop-two-col">
        <article className="details-panel desktop-module-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Supabase</p>
              <h2>Fronteira de dados</h2>
            </div>
            <Database size={20} />
          </div>
          <dl className="detail-list compact">
            <div>
              <dt>Cliente recomendado</dt>
              <dd>{supabase.recommendedClient}</dd>
            </div>
            <div>
              <dt>Acesso direto desktop</dt>
              <dd>{supabase.desktopDirectAccess}</dd>
            </div>
            <div>
              <dt>Acesso privilegiado</dt>
              <dd>{supabase.privilegedAccess}</dd>
            </div>
          </dl>
        </article>

        <article className="details-panel desktop-module-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Politica</p>
              <h2>Padroes seguros</h2>
            </div>
            <ShieldCheck size={20} />
          </div>
          <dl className="detail-list compact">
            <div>
              <dt>Auto reply</dt>
              <dd>{DESKTOP_DATA_SECURITY_POLICY.autoReplyDefault ? "ligado" : "desligado"}</dd>
            </div>
            <div>
              <dt>Grupos</dt>
              <dd>{DESKTOP_DATA_SECURITY_POLICY.groupsDefault ? "permitidos" : "bloqueados"}</dd>
            </div>
            <div>
              <dt>Aprovacao humana</dt>
              <dd>{DESKTOP_DATA_SECURITY_POLICY.sendRequiresHumanApproval ? "obrigatoria" : "opcional"}</dd>
            </div>
            <div>
              <dt>Privilegio</dt>
              <dd>{DESKTOP_DATA_SECURITY_POLICY.privilegedAccess}</dd>
            </div>
          </dl>
        </article>
      </section>
    </div>
  );
}
