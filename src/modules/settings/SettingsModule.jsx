import { Bell, LockKeyhole, Settings, ShieldCheck, UserCog } from "lucide-react";
import { getDesktopSecuritySummary, getDesktopSupabaseGuidance } from "../../lib/desktopDataProvider";

export default function SettingsModule() {
  const security = getDesktopSecuritySummary();
  const supabase = getDesktopSupabaseGuidance();

  return (
    <div className="desktop-module">
      <header className="topbar desktop-module-topbar">
        <div>
          <p className="eyebrow">Configuracoes</p>
          <h1>Preferencias do Desktop</h1>
          <p className="intro">
            Base para politicas locais, seguranca, notificacoes e integracoes futuras sem afetar o web.
          </p>
        </div>
        <div className="status-pill success">
          <ShieldCheck size={18} />
          Padrao seguro
        </div>
      </header>

      <section className="desktop-card-grid system-card-grid">
        <article className="desktop-info-card">
          <div className="desktop-info-head">
            <LockKeyhole size={18} />
            <strong>Credenciais</strong>
          </div>
          <p>Protegidas</p>
          <small>{security.envCheck.message}</small>
        </article>
        <article className="desktop-info-card">
          <div className="desktop-info-head">
            <UserCog size={18} />
            <strong>Oficina</strong>
          </div>
          <p>Backend</p>
          <small>Preferencias da oficina devem vir da API segura.</small>
        </article>
        <article className="desktop-info-card">
          <div className="desktop-info-head">
            <Bell size={18} />
            <strong>Alertas</strong>
          </div>
          <p>Local</p>
          <small>Notificacoes desktop ficam para etapa posterior.</small>
        </article>
        <article className="desktop-info-card">
          <div className="desktop-info-head">
            <Settings size={18} />
            <strong>Integracoes</strong>
          </div>
          <p>Preparadas</p>
          <small>Impressora, scanner e offline entram sem iframe do web.</small>
        </article>
      </section>

      <section className="details-panel desktop-module-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Fronteira segura</p>
            <h2>Dados e permissao</h2>
          </div>
          <ShieldCheck size={20} />
        </div>
        <dl className="detail-list compact">
          <div>
            <dt>Acesso recomendado</dt>
            <dd>{supabase.recommendedClient}</dd>
          </div>
          <div>
            <dt>Desktop direto</dt>
            <dd>{supabase.desktopDirectAccess}</dd>
          </div>
          <div>
            <dt>Privilegiado</dt>
            <dd>{supabase.privilegedAccess}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
