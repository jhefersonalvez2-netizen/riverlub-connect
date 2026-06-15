import { LayoutDashboard } from "lucide-react";
import { getDesktopOverview, getFinanceSummary, getStockSummary } from "../../lib/desktopDataProvider";
import SystemPageShell from "./SystemPageShell";

export default function SystemDashboard() {
  const overview = getDesktopOverview();
  const finance = getFinanceSummary();
  const stock = getStockSummary();

  return (
    <SystemPageShell
      icon={LayoutDashboard}
      eyebrow="Sistema"
      title="Dashboard nativo"
      description="Visao executiva preparada para dados reais do backend desktop, sem iframe do web."
      data={overview}
      cards={[
        { label: "Operacao", value: "Preparada", detail: "Resumo virá de /desktop/overview." },
        { label: "Financeiro", value: finance.status, detail: "Recebiveis e caixa via API segura." },
        { label: "Estoque", value: stock.status, detail: "Resumo de estoque sem acesso direto privilegiado." },
        { label: "Web", value: "Preservado", detail: "Sistema atual segue intacto em producao." },
      ]}
      filters={["periodo", "oficina", "visao"]}
      emptyTitle="Dashboard aguardando contrato backend"
      emptyDetail="Quando /desktop/overview estiver pronto, esta tela recebe indicadores reais do sistema."
    />
  );
}
