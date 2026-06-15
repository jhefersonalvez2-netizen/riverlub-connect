import { PackageSearch } from "lucide-react";
import { getStockItems, getStockSummary } from "../../lib/desktopDataProvider";
import SystemPageShell from "./SystemPageShell";

export default function StockModule() {
  const summary = getStockSummary();
  const items = getStockItems();

  return (
    <SystemPageShell
      icon={PackageSearch}
      eyebrow="Sistema"
      title="Estoque"
      description="Consulta e visao de estoque em tela nativa, preparada para impressora, scanner e offline no futuro."
      data={items}
      cards={[
        { label: "Resumo", value: summary.status, detail: "Valor e minimo entram por /desktop/stock/summary." },
        { label: "Itens", value: "Consulta", detail: "Nome, codigo, categoria e situacao." },
        { label: "Movimentos", value: "Futuro", detail: "Baixas e entradas seguem regras do backend." },
      ]}
      emptyTitle="Estoque ainda nao carregado no Desktop"
      emptyDetail="A tela esta pronta para GET /desktop/stock/items e resumo financeiro do estoque."
    />
  );
}
