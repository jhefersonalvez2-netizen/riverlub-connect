import { SendHorizonal } from "lucide-react";
import { useState, type FormEvent } from "react";

interface SendTestPanelProps {
  loading: boolean;
  onSend: (to: string, message: string) => Promise<void>;
}

export function SendTestPanel({ loading, onSend }: SendTestPanelProps) {
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("Teste local RiverLub WhatsApp Brain.");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await onSend(to, message);
  }

  return (
    <section className="panel send-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">WhatsApp</span>
          <h2>Envio manual</h2>
        </div>
        <SendHorizonal size={22} />
      </div>

      <form onSubmit={handleSubmit} className="stack">
        <label htmlFor="send-to">Telefone</label>
        <input
          id="send-to"
          inputMode="numeric"
          placeholder="5587999999999"
          value={to}
          onChange={(event) => setTo(event.target.value)}
        />
        <label htmlFor="send-message">Mensagem</label>
        <textarea
          id="send-message"
          rows={5}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
        <button
          type="submit"
          className="primary"
          disabled={loading || !to.trim() || !message.trim()}
        >
          <SendHorizonal size={17} />
          {loading ? "Enviando..." : "Enviar teste"}
        </button>
      </form>
    </section>
  );
}
