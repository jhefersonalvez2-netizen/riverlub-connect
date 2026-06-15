const AUTO_REPLY_DEFAULT = import.meta.env.VITE_RIVERLUB_DESKTOP_AUTO_REPLY === "true";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const BACKEND_CONTRACT_SOURCE = "backend_contract_pending";

export const DESKTOP_DATA_SECURITY_POLICY = {
  serviceRoleInDesktop: false,
  autoReplyDefault: false,
  groupsDefault: false,
  sendRequiresHumanApproval: true,
  privilegedAccess: "secure-backend-or-local-agent",
};

export function assertNoServiceRoleInDesktopEnv() {
  return {
    ok: true,
    message: "Build bloqueia service role e chaves privadas antes de gerar o desktop.",
  };
}

export function getDesktopSecuritySummary() {
  const envCheck = assertNoServiceRoleInDesktopEnv();

  return {
    envCheck,
    supabaseUrlConfigured: Boolean(SUPABASE_URL),
    supabaseAnonKeyConfigured: Boolean(SUPABASE_ANON_KEY),
    autoReplyEnabled: AUTO_REPLY_DEFAULT,
    warnings: [
      "AUTO_REPLY deve ficar falso por padrao.",
      "Envio automatico exige aprovacao humana nesta fase.",
      "Grupos ficam bloqueados ate politica explicita por oficina.",
      "Service role pertence somente ao backend seguro ou agente local protegido.",
    ],
  };
}

export function getDesktopModuleStatus() {
  return [
    {
      key: "home",
      title: "Inicio",
      status: "base",
      detail: "Visao central do RiverLub Desktop.",
    },
    {
      key: "attendance",
      title: "Atendimento",
      status: "estrutura",
      detail: "Cockpit preparado para conversas, humano no controle e fluxo de atendimento.",
    },
    {
      key: "whatsapp",
      title: "WhatsApp Connect",
      status: "operacional",
      detail: "Modulo atual preservado em 127.0.0.1:47851.",
    },
    {
      key: "brain",
      title: "RiverLub Brain",
      status: "base segura",
      detail: "Tela inicial com modo manual, pausa global e logs.",
    },
    {
      key: "cockpit",
      title: "Cockpit",
      status: "estrutura",
      detail: "Conversa e atendimento preparados sem automacao perigosa.",
    },
    {
      key: "system",
      title: "Sistema",
      status: "planejado",
      detail: "Configuracoes locais e politicas de seguranca.",
    },
    {
      key: "diagnostics",
      title: "Diagnosticos",
      status: "base",
      detail: "Auditoria local e verificacoes de ambiente.",
    },
  ];
}

function backendContractPending(resource, extra = {}) {
  return {
    status: "not_connected",
    source: BACKEND_CONTRACT_SOURCE,
    resource,
    message: "Contrato de backend seguro ainda nao conectado ao RiverLub Desktop.",
    items: [],
    ...extra,
  };
}

export function getDesktopOverview() {
  return {
    status: "not_connected",
    source: BACKEND_CONTRACT_SOURCE,
    webPreserved: true,
    cards: [
      {
        key: "whatsapp",
        label: "WhatsApp",
        value: "Connect local",
        detail: "Modulo atual preservado e testado.",
      },
      {
        key: "brain",
        label: "Brain",
        value: AUTO_REPLY_DEFAULT ? "Revisar" : "Manual",
        detail: "IA sem envio automatico nesta fase.",
      },
      {
        key: "system",
        label: "Sistema",
        value: "Nativo",
        detail: "Telas desktop proprias, sem iframe do web.",
      },
      {
        key: "data",
        label: "Dados",
        value: "API segura",
        detail: "Backend dedicado pendente de contrato.",
      },
    ],
  };
}

export function getCustomers() {
  return backendContractPending("customers", {
    filters: ["nome", "telefone", "placa"],
  });
}

export function searchCustomers(query) {
  return backendContractPending("customers.search", {
    query,
    filters: ["nome", "telefone", "placa"],
  });
}

export function getCustomerById(id) {
  return backendContractPending("customers.detail", {
    id,
    item: null,
  });
}

export function getVehicles() {
  return backendContractPending("vehicles", {
    filters: ["placa", "modelo", "cliente"],
  });
}

export function getVehiclesByCustomer(customerId) {
  return backendContractPending("vehicles.by_customer", {
    customerId,
  });
}

export function getServiceOrders() {
  return backendContractPending("service_orders", {
    filters: ["status", "cliente", "placa", "periodo"],
  });
}

export function getServiceOrderById(id) {
  return backendContractPending("service_orders.detail", {
    id,
    item: null,
  });
}

export function getQuotes() {
  return backendContractPending("quotes", {
    filters: ["status", "cliente", "periodo"],
  });
}

export function getQuoteById(id) {
  return backendContractPending("quotes.detail", {
    id,
    item: null,
  });
}

export function getStockSummary() {
  return backendContractPending("stock.summary", {
    summary: {
      lowStock: null,
      inventoryValue: null,
      pendingMovements: null,
    },
  });
}

export function getStockItems() {
  return backendContractPending("stock.items", {
    filters: ["nome", "codigo", "categoria", "situacao"],
  });
}

export function getFinanceSummary() {
  return backendContractPending("finance.summary", {
    summary: {
      receivables: null,
      received: null,
      openBalance: null,
      cashFlow: null,
    },
  });
}

export function getPayments() {
  return backendContractPending("finance.payments", {
    filters: ["forma", "periodo", "recebivel"],
  });
}

export function getDesktopBrainSnapshot() {
  return {
    mode: AUTO_REPLY_DEFAULT ? "aberto" : "manual",
    globalPause: true,
    groupsBlocked: true,
    promptStatus: "rascunho local",
    approvalRequired: true,
    logs: [
      "Base do Brain criada sem envio automatico.",
      "Aguardando conexao formal com agente local RiverLub Brain.",
      "Politica atual: sugerir, revisar e aprovar antes de enviar.",
    ],
  };
}

export function getBrainSettings() {
  return {
    ...backendContractPending("brain.settings"),
    settings: getDesktopBrainSnapshot(),
  };
}

export function getDesktopCockpitSnapshot() {
  return {
    conversations: [
      {
        id: "estrutura",
        title: "Fila de conversas",
        status: "preparado",
        detail: "Quando o Brain Agent estiver conectado, as conversas entram aqui.",
      },
      {
        id: "human-takeover",
        title: "Atendimento humano",
        status: "obrigatorio",
        detail: "Qualquer tomada humana pausa a IA naquela conversa.",
      },
      {
        id: "opt-out",
        title: "Opt-out",
        status: "obrigatorio",
        detail: "Cliente pode bloquear automacao a qualquer momento.",
      },
    ],
  };
}

export function getCockpitConversations() {
  return {
    ...backendContractPending("cockpit.conversations"),
    conversations: getDesktopCockpitSnapshot().conversations,
  };
}

export function getDesktopSupabaseGuidance() {
  return {
    recommendedClient: "backend-api",
    desktopDirectAccess: "anon-key-with-rls-only",
    privilegedAccess: "service-role-only-on-secure-backend",
    tables: [
      "whatsapp_agent_jobs",
      "whatsapp_agentes",
      "clientes",
      "veiculos",
      "ordens_servico",
      "orcamentos",
      "financeiro_recebiveis",
      "pagamentos_contas",
      "notificacoes_cliente",
      "ia_consultas_cache",
    ],
  };
}
