import { AlertTriangle, Bot, FileText, PauseCircle, ShieldCheck } from "lucide-react";
import { getDesktopBrainSnapshot, getDesktopSecuritySummary } from "../../lib/desktopDataProvider";

function BrainStatusCard({ title, value, detail, tone = "info" }) {
  return (
    <article className="desktop-info-card">
      <div className="desktop-info-head">
        <span className={`tone-dot ${tone}`} />
        <strong>{title}</strong>
      </div>
      <p>{value}</p>
      <small>{detail}</small>
    </article>
  );
}

export default function BrainModule() {
  const brain = getDesktopBrainSnapshot();
  const security = getDesktopSecuritySummary();

  return (
    <div className="desktop-module">
      <header className="topbar desktop-module-topbar">
        <div>
          <p className="eyebrow">RiverLub Brain</p>
          <h1>IA operacional segura</h1>
          <p className="intro">
            Base inicial para sugestoes, triagem e apoio ao atendimento sem envio automatico por padrao.
          </p>
        </div>
        <div className="status-pill warning">
          <PauseCircle size={18} />
          Pausa global ativa
        </div>
      </header>

      <section className="diagnostic-strip desktop-warning">
        <AlertTriangle size={18} />
        <span>Modo aberto ainda nao esta liberado. Toda mensagem precisa de revisao humana antes do envio.</span>
      </section>

      <section className="desktop-card-grid">
        <BrainStatusCard
          title="Modo da IA"
          value={brain.mode === "manual" ? "Manual" : "Aberto"}
          detail="Padrao de seguranca: IA sugere, pessoa aprova."
          tone="success"
        />
        <BrainStatusCard
          title="Allowlist"
          value="Preparada"
          detail="Automacoes futuras devem ser limitadas por numero autorizado."
          tone="info"
        />
        <BrainStatusCard
          title="Grupos"
          value="Bloqueados"
          detail="Mensagens de grupo nao entram em automacao nesta fase."
          tone="danger"
        />
        <BrainStatusCard
          title="Service role"
          value={security.envCheck.ok ? "Nao exposta" : "Remover agora"}
          detail={security.envCheck.message}
          tone={security.envCheck.ok ? "success" : "danger"}
        />
      </section>

      <section className="desktop-two-col">
        <article className="details-panel desktop-module-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Prompt operacional</p>
              <h2>Rascunho seguro</h2>
            </div>
            <FileText size={20} />
          </div>
          <div className="prompt-preview">
            <p>
              Atue como assistente da oficina RiverLub. Classifique a conversa, sugira respostas curtas,
              respeite opt-out, nao prometa disponibilidade sem confirmar sistema e nunca envie sem aprovacao.
            </p>
          </div>
          <small className="module-note">
            Este prompt e apenas visual nesta fase. A persistencia deve ficar no backend seguro ou agente local.
          </small>
        </article>

        <article className="details-panel desktop-module-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Logs do Brain</p>
              <h2>Auditoria local</h2>
            </div>
            <Bot size={20} />
          </div>
          <div className="event-list">
            {brain.logs.map((entry) => (
              <div className="event-row info" key={entry}>
                <time>local</time>
                <span>{entry}</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="details-panel desktop-module-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Travas obrigatorias</p>
            <h2>Politica de envio</h2>
          </div>
          <ShieldCheck size={20} />
        </div>
        <ul className="desktop-check-list">
          <li>AUTO_REPLY falso por padrao.</li>
          <li>Aprovacao humana antes de enviar qualquer resposta.</li>
          <li>Tomada humana pausa a IA na conversa.</li>
          <li>Opt-out deve ser respeitado e registrado.</li>
          <li>Historico e logs obrigatorios para auditoria.</li>
        </ul>
      </section>
    </div>
  );
}
