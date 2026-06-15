import { CarFront } from "lucide-react";
import { getVehicles } from "../../lib/desktopDataProvider";
import SystemPageShell from "./SystemPageShell";

export default function VehiclesModule() {
  const data = getVehicles();

  return (
    <SystemPageShell
      icon={CarFront}
      eyebrow="Sistema"
      title="Veiculos"
      description="Consulta de veiculos por placa, modelo e cliente, preparada para integrar O.S. e MotorIA."
      data={data}
      cards={[
        { label: "Placa", value: "Busca", detail: "Normalizacao e cache ficam no backend." },
        { label: "Cliente", value: "Vinculo", detail: "Veiculos por cliente via contrato desktop." },
        { label: "Historico", value: "O.S.", detail: "Relacionamento com atendimentos futuros." },
      ]}
      emptyTitle="Nenhum veiculo carregado no Desktop"
      emptyDetail="A tela esta pronta para GET /desktop/vehicles e GET /desktop/customers/:id/vehicles."
    />
  );
}
