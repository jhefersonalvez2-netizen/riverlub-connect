import { FileText } from "lucide-react";
import { getQuotes } from "../../lib/desktopDataProvider";
import SystemPageShell from "./SystemPageShell";

export default function QuotesModule() {
  const data = getQuotes();

  return (
    <SystemPageShell
      icon={FileText}
      eyebrow="Sistema"
      title="Orcamentos"
      description="Orcamentos nativos preparados para aprovacao, rejeicao e envio integrado ao atendimento."
      data={data}
      cards={[
        { label: "Lista", value: "Status", detail: "Pendentes, aprovados e rejeitados." },
        { label: "Aprovacao", value: "Seguro", detail: "Acoes futuras passam pelo backend." },
        { label: "Documento", value: "Pronto", detail: "PDF e WhatsApp ficam em etapa posterior." },
      ]}
      emptyTitle="Orcamentos aguardando contrato desktop"
      emptyDetail="A tela esta pronta para GET /desktop/quotes e acoes de aprovar/rejeitar."
    />
  );
}
