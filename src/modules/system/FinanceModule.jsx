import { CircleDollarSign } from "lucide-react";
import { getFinanceSummary, getPayments } from "../../lib/desktopDataProvider";
import SystemPageShell from "./SystemPageShell";

export default function FinanceModule() {
  const summary = getFinanceSummary();
  const payments = getPayments();

  return (
    <SystemPageShell
      icon={CircleDollarSign}
      eyebrow="Sistema"
      title="Financeiro"
      description="Recebiveis, pagamentos recebidos e fluxo de caixa em tela desktop propria."
      data={payments}
      cards={[
        { label: "Resumo", value: summary.status, detail: "Faturamento, recebido e em aberto via backend." },
        { label: "Pagamentos", value: "Recebidos", detail: "Registro futuro em /desktop/finance/payments." },
        { label: "Recibos", value: "Integracao", detail: "Documento e WhatsApp em etapa posterior." },
      ]}
      metricsClassName="rl-finance-kpi-grid financeiro"
      emptyTitle="Financeiro aguardando API desktop"
      emptyDetail="A tela esta pronta para GET /desktop/finance/summary e pagamentos recebidos."
    />
  );
}
