import { ClipboardList } from "lucide-react";
import { getServiceOrders } from "../../lib/desktopDataProvider";
import SystemPageShell from "./SystemPageShell";

export default function ServiceOrdersModule() {
  const data = getServiceOrders();

  return (
    <SystemPageShell
      icon={ClipboardList}
      eyebrow="Sistema"
      title="Ordens de Servico"
      description="Fluxo nativo para abrir, acompanhar e consultar O.S. sem mexer nas rotas atuais do web."
      data={data}
      cards={[
        { label: "Nova O.S.", value: "Preparada", detail: "POST futuro em /desktop/service-orders." },
        { label: "Fila", value: "Status", detail: "Aberta, aprovacao, execucao e finalizada." },
        { label: "Detalhe", value: "Completo", detail: "Itens, cliente, veiculo e documento depois." },
      ]}
      emptyTitle="O.S. ainda nao conectadas ao Desktop"
      emptyDetail="A tela esta pronta para GET /desktop/service-orders e detalhe por ID."
    />
  );
}
