import { Filter, PlugZap } from "lucide-react";

export default function SystemPageShell({
  icon: Icon,
  eyebrow,
  title,
  description,
  data,
  cards = [],
  filters = [],
  emptyTitle,
  emptyDetail,
}) {
  return (
    <div className="system-page">
      <header className="topbar desktop-module-topbar">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="intro">{description}</p>
        </div>
        <div className="status-pill neutral">
          <PlugZap size={18} />
          {data?.source || "backend_contract_pending"}
        </div>
      </header>

      {cards.length > 0 ? (
        <section className="desktop-card-grid system-card-grid">
          {cards.map((card) => (
            <article className="desktop-info-card" key={card.label}>
              <div className="desktop-info-head">
                {Icon ? <Icon size={18} /> : null}
                <strong>{card.label}</strong>
              </div>
              <p>{card.value}</p>
              <small>{card.detail}</small>
            </article>
          ))}
        </section>
      ) : null}

      <section className="details-panel desktop-module-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Filtros preparados</p>
            <h2>Consulta nativa</h2>
          </div>
          <Filter size={20} />
        </div>
        <div className="filter-strip">
          {(filters.length > 0 ? filters : data?.filters || ["periodo", "status"]).map((filter) => (
            <span key={filter}>{filter}</span>
          ))}
        </div>
      </section>

      <section className="empty-state-box system-empty-state">
        {Icon ? <Icon size={32} /> : <PlugZap size={32} />}
        <p>{emptyTitle}</p>
        <small>{emptyDetail || data?.message}</small>
      </section>
    </div>
  );
}
