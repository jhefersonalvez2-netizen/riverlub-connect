import {
  Bot,
  ClipboardPlus,
  MessageSquare,
  PackageSearch,
  Search,
  ShieldCheck,
  Stethoscope,
  Wifi,
} from "lucide-react";
import { getDesktopOverview, getDesktopSecuritySummary } from "../../lib/desktopDataProvider";

function HomeStatusCard({ icon: Icon, title, value, detail, tone = "info" }) {
  return (
    <article className="desktop-info-card">
      <div className="desktop-info-head">
        <Icon size={18} />
        <strong>{title}</strong>
      </div>
      <p>{value}</p>
      <small>{detail}</small>
      <span className={`tone-dot ${tone}`} aria-hidden="true" />
    </article>
  );
}

function HomeAction({ icon: Icon, label, detail, onClick }) {
  return (
    <button className="desktop-action-card" type="button" onClick={onClick}>
      <Icon size={20} />
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
    </button>
  );
}

export default function HomeModule({ whatsappStatus, onNavigate }) {
  const overview = getDesktopOverview();
  const security = getDesktopSecuritySummary();

  const cards = [
    {
      icon: Wifi,
      title: "WhatsApp",
      value: whatsappStatus?.label || "Connect local",
      detail: whatsappStatus?.connected ? "Sessao pronta para a oficina." : "Use o modulo WhatsApp para parear ou revisar.",
      tone: whatsappStatus?.tone || "info",
    },
    {
      icon: Bot,
      title: "Brain",
      value: security.autoReplyEnabled ? "Revisar" : "Manual",
      detail: "IA sem envio automatico; aprovacao humana obrigatoria.",
      tone: "warning",
    },
    {
      icon: Stethoscope,
      title: "Sistema",
      value: "Nativo",
      detail: "Telas proprias preparadas para API segura.",
      tone: "success",
    },
    {
      icon: ShieldCheck,
      title: "Dados",
      value: "Protegidos",
      detail: "Service role bloqueada no build desktop.",
      tone: "success",
    },
  ];

  return (
    <div className="desktop-module">
      <header className="topbar desktop-module-topbar">
        <div>
          <p className="eyebrow">Inicio</p>
          <h1>RiverLub Desktop</h1>
          <p className="intro">
            Central operacional local com WhatsApp, Brain e sistema nativo preparados para trabalhar juntos.
          </p>
        </div>
        <div className="status-pill success">
          <ShieldCheck size={18} />
          Web preservado
        </div>
      </header>

      <section className="desktop-card-grid home-status-grid">
        {cards.map((card) => (
          <HomeStatusCard {...card} key={card.title} />
        ))}
      </section>

      <section className="details-panel desktop-module-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Acoes rapidas</p>
            <h2>Fluxo do balcao</h2>
          </div>
          <span className="status-pill neutral">API segura pendente</span>
        </div>
        <div className="desktop-action-grid">
          <HomeAction
            icon={ClipboardPlus}
            label="Nova O.S."
            detail="Abrir tela nativa de ordens"
            onClick={() => onNavigate?.("system:service-orders")}
          />
          <HomeAction
            icon={Search}
            label="Buscar cliente"
            detail="Clientes e veiculos"
            onClick={() => onNavigate?.("system:customers")}
          />
          <HomeAction
            icon={MessageSquare}
            label="Abrir Cockpit"
            detail="Conversas e atendimento"
            onClick={() => onNavigate?.("attendance")}
          />
          <HomeAction
            icon={PackageSearch}
            label="Ver estoque"
            detail="Itens e disponibilidade"
            onClick={() => onNavigate?.("system:stock")}
          />
          <HomeAction
            icon={Stethoscope}
            label="Diagnostico local"
            detail="Ambiente e agentes"
            onClick={() => onNavigate?.("diagnostics")}
          />
        </div>
      </section>

      <section className="desktop-two-col">
        <article className="details-panel desktop-module-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Arquitetura</p>
              <h2>Sistema nativo</h2>
            </div>
            <Stethoscope size={20} />
          </div>
          <p className="module-copy">
            O Desktop nao embute o web como navegador. As telas daqui serao proprias, consumindo backend seguro
            e compartilhando regras com o RiverLub em producao sem quebrar o fluxo atual.
          </p>
        </article>

        <article className="details-panel desktop-module-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Contrato</p>
              <h2>{overview.source}</h2>
            </div>
            <ShieldCheck size={20} />
          </div>
          <p className="module-copy">
            Dados reais entram por rotas `/desktop/*` futuras ou backend seguro. Nesta etapa nao ha migration,
            iframe do web ou chave privilegiada no app.
          </p>
        </article>
      </section>
    </div>
  );
}
