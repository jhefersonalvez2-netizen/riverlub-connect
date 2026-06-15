import { Users } from "lucide-react";
import { getCustomers } from "../../lib/desktopDataProvider";
import SystemPageShell from "./SystemPageShell";

export default function CustomersModule() {
  const data = getCustomers();

  return (
    <SystemPageShell
      icon={Users}
      eyebrow="Sistema"
      title="Clientes"
      description="Cadastro e busca de clientes em tela desktop propria, pronta para API segura."
      data={data}
      cards={[
        { label: "Busca", value: "Nome", detail: "Tambem preparada para telefone e placa." },
        { label: "Detalhe", value: "Nativo", detail: "Cliente, veiculos e historico no mesmo fluxo." },
        { label: "Privacidade", value: "Backend", detail: "Telefones nao serao lidos por chave privilegiada no desktop." },
      ]}
      emptyTitle="Nenhum cliente carregado no Desktop"
      emptyDetail="A tela esta pronta para GET /desktop/customers e busca por cliente, telefone ou placa."
    />
  );
}
