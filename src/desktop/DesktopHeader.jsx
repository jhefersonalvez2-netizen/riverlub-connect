import { Bell, CalendarDays, Search, ShieldCheck } from "lucide-react";

function getDateLabel() {
  const now = new Date();

  return {
    date: now.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }),
    time: now.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

export default function DesktopHeader({ activeItem }) {
  const today = getDateLabel();

  return (
    <header className="rl-desktop-topbar">
      <button className="rl-desktop-search" type="button">
        <Search size={19} />
        <span>Buscar cliente, veiculo, placa, orcamento ou O.S...</span>
        <strong>Ctrl K</strong>
      </button>

      <div className="rl-desktop-topbar-actions">
        <div className="rl-desktop-date-card">
          <CalendarDays size={18} />
          <span>
            <strong>{today.date}</strong>
            <small>{today.time} | {activeItem?.label || "Dashboard"}</small>
          </span>
        </div>

        <button className="rl-desktop-icon-button" type="button" title="Alertas locais">
          <Bell size={18} />
          <i aria-hidden="true" />
        </button>

        <div className="rl-desktop-user-card">
          <div className="rl-desktop-user-avatar">RL</div>
          <span>
            <strong>RiverLub</strong>
            <small>Desktop</small>
          </span>
        </div>

        <div className="rl-desktop-safe-pill" title="Chaves privilegiadas bloqueadas no desktop">
          <ShieldCheck size={17} />
          Seguro
        </div>
      </div>
    </header>
  );
}
