import { MessageSquare, PauseCircle, ShieldCheck } from "lucide-react";
import { getDesktopCockpitSnapshot } from "../../lib/desktopDataProvider";

export default function CockpitModule() {
  const cockpit = getDesktopCockpitSnapshot();

  return (
    <div className="desktop-module">
      <header className="topbar desktop-module-topbar">
        <div>
          <p className="eyebrow">Cockpit</p>
          <h1>Conversas e atendimento</h1>
          <p className="intro">
            Estrutura inicial para acompanhar conversas, rascunhos e passagem para atendimento humano.
          </p>
        </div>
        <div className="status-pill neutral">
          <MessageSquare size={18} />
          Sem automacao perigosa
        </div>
      </header>

      <section className="desktop-two-col cockpit-layout">
        <article className="details-panel desktop-module-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Conversas</p>
              <h2>Fila preparada</h2>
            </div>
            <MessageSquare size={20} />
          </div>
          <div className="desktop-conversation-list">
            {cockpit.conversations.map((item) => (
              <button className="desktop-conversation-item" type="button" key={item.id}>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                </span>
                <i>{item.status}</i>
              </button>
            ))}
          </div>
        </article>

        <article className="details-panel desktop-module-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Detalhe</p>
              <h2>Atendimento humano primeiro</h2>
            </div>
            <PauseCircle size={20} />
          </div>
          <div className="empty-state-box">
            <ShieldCheck size={28} />
            <p>Selecione uma conversa quando o Brain Agent estiver conectado.</p>
            <small>
              Nesta base, o cockpit nao envia mensagem, nao inicia automacao e nao altera dados da oficina.
            </small>
          </div>
        </article>
      </section>
    </div>
  );
}
