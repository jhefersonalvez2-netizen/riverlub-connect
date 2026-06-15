import { Filter, PlugZap, Plus, RefreshCw } from "lucide-react";

export default function SystemPageShell({
  icon: Icon,
  eyebrow,
  title,
  description,
  data,
  cards = [],
  filters = [],
  tableRows = [],
  emptyTitle,
  emptyDetail,
}) {
  const rows = tableRows.length
    ? tableRows
    : [
        {
          id: "contrato",
          primary: "Contrato backend",
          secondary: data?.resource || "desktop",
          status: data?.status || "not_connected",
          source: data?.source || "backend_contract_pending",
        },
      ];

  return (
    <div className="rl-web-page">
      <header className="rl-web-page-head">
        <div>
          <p className="rl-web-eyebrow">{eyebrow}</p>
          <h1 className="rl-web-page-title">{title}</h1>
          <p className="rl-web-page-subtitle">{description}</p>
        </div>
        <div className="rl-web-actions">
          <button className="rl-web-btn secondary" type="button">
            <RefreshCw size={17} />
            Atualizar
          </button>
          <button className="rl-web-btn primary" type="button">
            <Plus size={17} />
            Nova acao
          </button>
        </div>
      </header>

      {cards.length > 0 ? (
        <section className="rl-web-metrics">
          {cards.map((card) => (
            <article className="rl-web-card" key={card.label}>
              <div className="rl-web-card-head">
                <span className="rl-web-card-label">{card.label}</span>
                <span className="rl-web-card-icon">{Icon ? <Icon size={18} /> : <PlugZap size={18} />}</span>
              </div>
              <div className="rl-web-card-value">{card.value}</div>
              <div className="rl-web-card-foot">{card.detail}</div>
            </article>
          ))}
        </section>
      ) : null}

      <section className="rl-web-filter-panel">
        <div className="rl-web-filter-head">
          <div className="rl-web-filter-title">Consulta nativa</div>
          <Filter size={20} />
        </div>
        <div className="rl-web-filter-row">
          {(filters.length > 0 ? filters : data?.filters || ["periodo", "status"]).map((filter) => (
            <span className="rl-web-filter-pill" key={filter}>
              {filter}
            </span>
          ))}
        </div>
      </section>

      <section className="rl-web-table-card">
        <div className="rl-web-table-head">
          <span>ID</span>
          <span>Registro</span>
          <span>Origem</span>
          <span>Status</span>
          <span>Acoes</span>
        </div>
        {rows.map((row) => (
          <div className="rl-web-table-row" key={row.id}>
            <span>{row.id}</span>
            <span>
              <div className="rl-web-table-title">{row.primary}</div>
              <div className="rl-web-table-meta">{row.secondary}</div>
            </span>
            <span>{row.source}</span>
            <span>{row.status}</span>
            <button className="rl-web-table-action" type="button">
              Preparado
            </button>
          </div>
        ))}
      </section>

      <section className="rl-web-empty">
        {Icon ? <Icon size={32} /> : <PlugZap size={32} />}
        <strong>{emptyTitle}</strong>
        <small>{emptyDetail || data?.message}</small>
      </section>
    </div>
  );
}
