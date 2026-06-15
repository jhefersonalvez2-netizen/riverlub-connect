import {
  Bell,
  Bot,
  CarFront,
  CircleDollarSign,
  ClipboardList,
  Database,
  FileText,
  Gauge,
  MessageSquare,
  PackageSearch,
  Settings,
  ShieldCheck,
  Wifi,
  Wrench,
  Users,
} from "lucide-react";

export const desktopNavigation = [
  {
    key: "dashboard",
    label: "Dashboard",
    description: "Visao geral da oficina",
    icon: Gauge,
  },
  {
    key: "customers",
    label: "Clientes",
    description: "Relacionamento e historico",
    icon: Users,
  },
  {
    key: "vehicles",
    label: "Veiculos",
    description: "Frota e recorrencia",
    icon: CarFront,
  },
  {
    key: "service-orders",
    label: "Ordens de Servico",
    description: "Atendimento e execucao",
    icon: ClipboardList,
  },
  {
    key: "quotes",
    label: "Orcamentos",
    description: "Propostas e aprovacoes",
    icon: FileText,
  },
  {
    key: "stock",
    label: "Estoque",
    description: "Pecas, filtros e oleos",
    icon: PackageSearch,
  },
  {
    key: "finance",
    label: "Financeiro",
    description: "Recebiveis e caixa",
    icon: CircleDollarSign,
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    description: "Mensagens e agente local",
    icon: Wifi,
    children: [
      {
        key: "whatsapp:connect",
        label: "Agente / Connect",
        description: "QR, sessao e runtime local",
        icon: Wrench,
      },
      {
        key: "whatsapp:cockpit",
        label: "Cockpit",
        description: "Conversas e atendimento",
        icon: MessageSquare,
      },
      {
        key: "whatsapp:brain",
        label: "Brain",
        description: "Sugestoes com aprovacao",
        icon: Bot,
      },
      {
        key: "whatsapp:templates",
        label: "Templates",
        description: "Mensagens padrao",
        icon: Bell,
      },
      {
        key: "whatsapp:settings",
        label: "Configuracoes",
        description: "Politicas do WhatsApp",
        icon: Settings,
      },
      {
        key: "whatsapp:logs",
        label: "Logs / Diagnostico",
        description: "Leitura tecnica sanitizada",
        icon: ShieldCheck,
      },
    ],
  },
  {
    key: "settings",
    label: "Configuracoes",
    description: "Preferencias e integracoes",
    icon: Settings,
  },
  {
    key: "diagnostics",
    label: "Diagnosticos",
    description: "Ambiente e seguranca",
    icon: Database,
  },
];

export function getNavigationItem(activeKey) {
  const parent = desktopNavigation.find((item) => item.key === activeKey);
  if (parent) return parent;

  for (const item of desktopNavigation) {
    const child = item.children?.find((subitem) => subitem.key === activeKey);
    if (child) return child;
  }

  return desktopNavigation[0];
}

export function getActiveParentKey(activeKey) {
  if (activeKey?.startsWith("whatsapp:")) return "whatsapp";

  return activeKey;
}
