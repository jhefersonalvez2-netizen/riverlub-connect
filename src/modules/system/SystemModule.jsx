import {
  CarFront,
  CircleDollarSign,
  ClipboardList,
  FileText,
  LayoutDashboard,
  PackageSearch,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import CustomersModule from "./CustomersModule";
import FinanceModule from "./FinanceModule";
import QuotesModule from "./QuotesModule";
import ServiceOrdersModule from "./ServiceOrdersModule";
import StockModule from "./StockModule";
import SystemDashboard from "./SystemDashboard";
import VehiclesModule from "./VehiclesModule";

const SYSTEM_SECTIONS = [
  {
    key: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    component: SystemDashboard,
  },
  {
    key: "customers",
    label: "Clientes",
    icon: Users,
    component: CustomersModule,
  },
  {
    key: "vehicles",
    label: "Veiculos",
    icon: CarFront,
    component: VehiclesModule,
  },
  {
    key: "service-orders",
    label: "Ordens de Servico",
    icon: ClipboardList,
    component: ServiceOrdersModule,
  },
  {
    key: "quotes",
    label: "Orcamentos",
    icon: FileText,
    component: QuotesModule,
  },
  {
    key: "stock",
    label: "Estoque",
    icon: PackageSearch,
    component: StockModule,
  },
  {
    key: "finance",
    label: "Financeiro",
    icon: CircleDollarSign,
    component: FinanceModule,
  },
];

function getValidSection(section) {
  return SYSTEM_SECTIONS.some((item) => item.key === section) ? section : "dashboard";
}

export default function SystemModule({ initialSection = "dashboard" }) {
  const [activeSection, setActiveSection] = useState(() => getValidSection(initialSection));
  const section = SYSTEM_SECTIONS.find((item) => item.key === activeSection) || SYSTEM_SECTIONS[0];
  const ActiveComponent = section.component;

  useEffect(() => {
    setActiveSection(getValidSection(initialSection));
  }, [initialSection]);

  return (
    <div className="desktop-module system-shell">
      <aside className="system-subnav" aria-label="Submodulos do sistema">
        <div>
          <p className="eyebrow">Sistema nativo</p>
          <h2>RiverLub</h2>
        </div>
        <div className="system-subnav-list">
          {SYSTEM_SECTIONS.map((item) => {
            const Icon = item.icon;

            return (
              <button
                className={`system-subnav-item ${activeSection === item.key ? "active" : ""}`}
                type="button"
                onClick={() => setActiveSection(item.key)}
                key={item.key}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="system-content">
        <ActiveComponent />
      </section>
    </div>
  );
}
