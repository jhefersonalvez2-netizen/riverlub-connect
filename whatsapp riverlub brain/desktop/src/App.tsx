import { useCallback, useEffect, useMemo, useState } from "react";
import { AiAutomationPanel } from "./components/AiAutomationPanel";
import { AttendancePanel } from "./components/AttendancePanel";
import { JobsPanel } from "./components/JobsPanel";
import { LogsPanel } from "./components/LogsPanel";
import { PromptEditor } from "./components/PromptEditor";
import { QrPanel } from "./components/QrPanel";
import { SendTestPanel } from "./components/SendTestPanel";
import { StatusCard } from "./components/StatusCard";
import {
  AGENT_AUTH_TOKEN,
  api,
  openAgentEvents,
  type ConversationDetail,
  type ConversationStatus,
  type ConversationSummary,
  type ContactPolicy,
  type DraftSuggestion,
  type HealthResponse,
  type JobAppointment,
  type JobEvent,
  type JobPayment,
  type JobReminder,
  type JobsHealth,
  type JobVehicle,
  type LogEntry,
  type QrResponse,
  type RuntimeSettings,
  type WhatsAppState
} from "./lib/api";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Erro inesperado.";
}

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [status, setStatus] = useState<WhatsAppState | null>(null);
  const [qr, setQr] = useState<QrResponse | null>(null);
  const [prompt, setPrompt] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<
    | "start"
    | "stop"
    | "refresh"
    | "save"
    | "test"
    | "send"
    | "settings"
    | "conversation"
    | "jobs"
    | null
  >(null);
  const [testReply, setTestReply] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [promptStatus, setPromptStatus] = useState<string | null>(null);
  const [settings, setSettings] = useState<RuntimeSettings | null>(null);
  const [settingsStatus, setSettingsStatus] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] =
    useState<ConversationDetail | null>(null);
  const [selectedContactPolicy, setSelectedContactPolicy] =
    useState<ContactPolicy | null>(null);
  const [conversationError, setConversationError] = useState<string | null>(null);
  const [jobsHealth, setJobsHealth] = useState<JobsHealth | null>(null);
  const [jobAppointments, setJobAppointments] = useState<JobAppointment[]>([]);
  const [jobEvents, setJobEvents] = useState<JobEvent[]>([]);
  const [jobPayments, setJobPayments] = useState<JobPayment[]>([]);
  const [jobReminders, setJobReminders] = useState<JobReminder[]>([]);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const appointmentStatusByContact = useMemo(() => {
    const map: Record<string, "pending_confirmation" | "confirmed"> = {};
    for (const appointment of jobAppointments) {
      if (
        appointment.conversation_contact_id &&
        (appointment.status === "pending_confirmation" || appointment.status === "confirmed")
      ) {
        map[appointment.conversation_contact_id] = appointment.status;
      }
    }
    return map;
  }, [jobAppointments]);

  const refreshLogs = useCallback(async () => {
    const logsResponse = await api.getLogs(100);
    setLogs(logsResponse.logs);
  }, []);

  const refreshJobs = useCallback(async () => {
    try {
      const healthResponse = await api.getJobsHealth();
      setJobsHealth(healthResponse);

      if (!healthResponse.supabase.configured) {
        setJobAppointments([]);
        setJobEvents([]);
        setJobPayments([]);
        setJobReminders([]);
        setJobsError(null);
        return;
      }

      const [appointments, events, payments, reminders] = await Promise.all([
        api.getJobAppointments(),
        api.getJobEvents(),
        api.getJobPayments(),
        api.getJobReminders()
      ]);
      setJobAppointments(appointments.appointments);
      setJobEvents(events.events);
      setJobPayments(payments.payments);
      setJobReminders(reminders.reminders);
      setJobsError(null);
    } catch (error) {
      setJobsError(getErrorMessage(error));
    }
  }, []);

  const loadConversation = useCallback(async (contactId: string) => {
    const [detail, policyResponse] = await Promise.all([
      api.getConversation(contactId),
      api.getContactPolicy(contactId)
    ]);
    setSelectedConversation({
      contact: detail.contact,
      messages: detail.messages,
      draftSuggestion: detail.draftSuggestion
    });
    setSelectedContactPolicy(policyResponse.policy);
  }, []);

  const refreshConversations = useCallback(async () => {
    const response = await api.getConversations(false);
    setConversations(response.conversations);

    const activeContactId =
      selectedContactId ?? response.conversations[0]?.contactId ?? null;

    if (!selectedContactId && activeContactId) {
      setSelectedContactId(activeContactId);
    }

    if (activeContactId) {
      try {
        await loadConversation(activeContactId);
        setConversationError(null);
      } catch (error) {
        setSelectedConversation(null);
        setSelectedContactPolicy(null);
        setConversationError(getErrorMessage(error));
      }
    } else {
      setSelectedConversation(null);
      setSelectedContactPolicy(null);
    }
  }, [loadConversation, selectedContactId]);

  const refresh = useCallback(async () => {
    try {
      const healthResponse = await api.getHealth();
      setHealth(healthResponse);
      setAgentError(null);
    } catch (error) {
      setHealth(null);
      setStatus(null);
      setQr(null);
      setAgentError(getErrorMessage(error));
      return;
    }

    try {
      const [statusResponse, qrResponse] = await Promise.all([
        api.getWhatsAppStatus(),
        api.getQr()
      ]);
      setStatus(statusResponse.whatsapp);
      setQr(qrResponse);
    } catch (error) {
      setNotice(getErrorMessage(error));
    }

    if (AGENT_AUTH_TOKEN) {
      try {
        const [promptResponse, settingsResponse] = await Promise.all([
          api.getPrompt(),
          api.getSettings()
        ]);
        await Promise.all([refreshLogs(), refreshConversations(), refreshJobs()]);
        setPrompt(promptResponse.prompt);
        setSettings(settingsResponse);
      } catch (error) {
        setNotice(getErrorMessage(error));
      }
    } else {
      setNotice("Configure VITE_AGENT_AUTH_TOKEN no desktop para liberar acoes protegidas.");
    }
  }, [refreshConversations, refreshJobs, refreshLogs]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, 5_000);

    return () => window.clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    const source = openAgentEvents(
      (event) => {
        if (event.type === "whatsapp_status") {
          setStatus(event.payload as WhatsAppState);
        }

        if (event.type === "qr_updated") {
          setQr(event.payload as QrResponse);
        }

        if (
          event.type === "message_received" ||
          event.type === "message_sent" ||
          event.type === "llm_response" ||
          event.type === "settings_updated" ||
          event.type.startsWith("conversation_") ||
          event.type === "error"
        ) {
          void refreshLogs();
        }

        if (event.type.startsWith("conversation_")) {
          void refreshConversations();
        }

        if (event.type === "settings_updated") {
          setSettings(event.payload as RuntimeSettings);
        }
      },
      () => {
        setNotice((currentNotice) => currentNotice ?? "Conexao SSE indisponivel; usando polling.");
      }
    );

    return () => {
      source?.close();
    };
  }, [refreshConversations, refreshLogs]);

  async function runAction(
    actionName: NonNullable<typeof busyAction>,
    action: () => Promise<void>
  ) {
    setBusyAction(actionName);
    setNotice(null);

    try {
      await action();
      await refresh();
    } catch (error) {
      const message = getErrorMessage(error);
      if (actionName === "settings") {
        setSettingsError(message);
      }
      setNotice(message);
    } finally {
      setBusyAction(null);
    }
  }

  async function savePromptDraft(nextPrompt: string) {
    setBusyAction("save");
    setNotice(null);
    setPromptStatus(null);

    try {
      const response = await api.savePrompt(nextPrompt);
      setPrompt(response.prompt);
      setPromptStatus("Prompt salvo com sucesso.");
      setNotice("Prompt salvo com sucesso.");
      await refreshLogs();
      return response.prompt;
    } catch (error) {
      const message = getErrorMessage(error);
      setNotice(message);
      throw error;
    } finally {
      setBusyAction(null);
    }
  }

  async function saveAutomationSettings(partialSettings: Partial<RuntimeSettings>) {
    setBusyAction("settings");
    setNotice(null);
    setSettingsError(null);
    setSettingsStatus(null);

    try {
      const response = await api.saveSettings(partialSettings);
      setSettings(response);
      setSettingsStatus("Configuracoes salvas com sucesso.");
      setNotice("Configuracoes da IA salvas.");
      await refreshLogs();
      return response;
    } catch (error) {
      const message = getErrorMessage(error);
      setSettingsError(message);
      setNotice(message);
      throw error;
    } finally {
      setBusyAction(null);
    }
  }

  async function resetAutomationSettings() {
    setBusyAction("settings");
    setNotice(null);
    setSettingsError(null);
    setSettingsStatus(null);

    try {
      const response = await api.resetSettings();
      setSettings(response);
      setSettingsStatus("Modo seguro restaurado.");
      setNotice("Modo seguro restaurado.");
      await refreshLogs();
      return response;
    } catch (error) {
      const message = getErrorMessage(error);
      setSettingsError(message);
      setNotice(message);
      throw error;
    } finally {
      setBusyAction(null);
    }
  }

  async function selectConversation(contactId: string) {
    setSelectedContactId(contactId);
    setConversationError(null);

    try {
      await loadConversation(contactId);
    } catch (error) {
      setSelectedConversation(null);
      setSelectedContactPolicy(null);
      setConversationError(getErrorMessage(error));
    }
  }

  async function runConversationAction(action: () => Promise<void>) {
    setBusyAction("conversation");
    setNotice(null);
    setConversationError(null);

    try {
      await action();
      await Promise.all([refreshConversations(), refreshLogs()]);
    } catch (error) {
      const message = getErrorMessage(error);
      setConversationError(message);
      setNotice(message);
      throw error;
    } finally {
      setBusyAction(null);
    }
  }

  async function runJobsAction(action: () => Promise<void>) {
    setBusyAction("jobs");
    setNotice(null);
    setJobsError(null);

    try {
      await action();
      await Promise.all([refreshJobs(), refreshLogs()]);
    } catch (error) {
      const message = getErrorMessage(error);
      setJobsError(message);
      setNotice(message);
      throw error;
    } finally {
      setBusyAction(null);
    }
  }

  async function lookupPlateFromJobs(plate: string): Promise<{
    found: boolean;
    vehicle: JobVehicle | null;
    message: string;
  }> {
    const response = await api.lookupPlate(plate);
    return {
      found: response.found,
      vehicle: response.vehicle,
      message: response.message
    };
  }

  async function suggestConversationReply(
    contactId: string,
    extraInstruction?: string
  ): Promise<DraftSuggestion> {
    let draft: DraftSuggestion | null = null;

    await runConversationAction(async () => {
      const response = await api.suggestConversationReply(contactId, extraInstruction);
      draft = response.draftSuggestion;
      setNotice("Sugestao da IA criada.");
    });

    if (!draft) {
      throw new Error("Sugestao nao foi gerada.");
    }

    return draft;
  }

  async function sendConversationReply(contactId: string, message: string) {
    await runConversationAction(async () => {
      await api.sendConversationReply(contactId, message);
      setNotice("Resposta enviada pela tela Atendimento.");
    });
  }

  async function updateSelectedContactPolicy(
    contactId: string,
    partial: Partial<Pick<ContactPolicy, "optIn" | "optOut" | "notes">>
  ) {
    await runConversationAction(async () => {
      const response = await api.updateContactPolicy(contactId, partial);
      setSelectedContactPolicy(response.policy);
      setNotice("Politica do contato salva.");
    });
  }

  async function setContactOptOut(contactId: string, reason?: string) {
    await runConversationAction(async () => {
      const response = await api.optOutContact(contactId, reason);
      setSelectedContactPolicy(response.policy);
      setNotice("Contato marcado como opt-out.");
    });
  }

  async function setContactOptIn(contactId: string) {
    await runConversationAction(async () => {
      const response = await api.optInContact(contactId);
      setSelectedContactPolicy(response.policy);
      setNotice("Contato marcado como opt-in.");
    });
  }

  return (
    <main className="app-shell">
      <StatusCard
        health={health}
        status={status}
        error={agentError}
        busyAction={busyAction}
        onRefresh={() => void refresh()}
        onStart={() =>
          void runAction("start", async () => {
            const response = await api.startWhatsApp();
            setNotice(response.message);
          })
        }
        onStop={() =>
          void runAction("stop", async () => {
            const response = await api.stopWhatsApp();
            setNotice(response.message);
          })
        }
      />

      {notice ? <div className="notice">{notice}</div> : null}

      <div className="dashboard-grid">
        <AttendancePanel
          conversations={conversations}
          selectedConversation={selectedConversation}
          selectedContactPolicy={selectedContactPolicy}
          selectedContactId={selectedContactId}
          appointmentStatusByContact={appointmentStatusByContact}
          settings={settings}
          loading={busyAction === "refresh"}
          actionLoading={busyAction === "conversation"}
          errorMessage={conversationError}
          onSelect={(contactId) => void selectConversation(contactId)}
          onRefresh={refreshConversations}
          onMarkRead={(contactId) =>
            runConversationAction(async () => {
              await api.markConversationRead(contactId);
            })
          }
          onToggleHumanTakeover={(contactId, enabled) =>
            runConversationAction(async () => {
              await api.setConversationHumanTakeover(contactId, enabled);
            })
          }
          onToggleAiPaused={(contactId, enabled) =>
            runConversationAction(async () => {
              await api.setConversationAiPaused(contactId, enabled);
            })
          }
          onSetStatus={(contactId, status: Extract<ConversationStatus, "open" | "resolved" | "archived">) =>
            runConversationAction(async () => {
              await api.setConversationStatus(contactId, status);
            })
          }
          onSuggest={suggestConversationReply}
          onSend={sendConversationReply}
          onClearDraft={(contactId) =>
            runConversationAction(async () => {
              await api.clearConversationDraft(contactId);
            })
          }
          onSaveContactPolicy={updateSelectedContactPolicy}
          onOptOut={setContactOptOut}
          onOptIn={setContactOptIn}
        />
        <JobsPanel
          health={jobsHealth}
          appointments={jobAppointments}
          events={jobEvents}
          payments={jobPayments}
          reminders={jobReminders}
          loading={busyAction === "jobs"}
          errorMessage={jobsError}
          onRefresh={refreshJobs}
          onLookupPlate={lookupPlateFromJobs}
          onConfirmAppointment={(id) =>
            runJobsAction(async () => {
              await api.confirmJobAppointment(id);
              setNotice("Agendamento confirmado.");
            })
          }
          onCancelAppointment={(id) =>
            runJobsAction(async () => {
              await api.cancelJobAppointment(id);
              setNotice("Agendamento cancelado.");
            })
          }
          onNotifyReception={(id) =>
            runJobsAction(async () => {
              const response = await api.notifyReceptionForAppointment(id);
              if (!response.ok) {
                throw new Error(response.error || "Falha ao notificar recepcao.");
              }
              setNotice("Recepcao notificada.");
            })
          }
        />
        <QrPanel qr={qr} status={status} />
        <SendTestPanel
          loading={busyAction === "send"}
          onSend={(to, message) =>
            runAction("send", async () => {
              await api.sendWhatsApp(to, message);
              setNotice("Mensagem enviada.");
            })
          }
        />
        <PromptEditor
          prompt={prompt}
          saveLoading={busyAction === "save"}
          testLoading={busyAction === "test"}
          testReply={testReply}
          testError={testError}
          statusMessage={promptStatus}
          onSave={savePromptDraft}
          onTest={(message) =>
            runAction("test", async () => {
              setTestReply(null);
              setTestError(null);

              try {
                const response = await api.testLlm(message);
                setTestReply(response.reply);
                setNotice("Teste de LLM concluido.");
              } catch (error) {
                const message = getErrorMessage(error);
                setTestError(message);
                throw error;
              }
            })
          }
        />
        <AiAutomationPanel
          settings={settings}
          loading={busyAction === "settings"}
          statusMessage={settingsStatus}
          errorMessage={settingsError}
          onSave={saveAutomationSettings}
          onReset={resetAutomationSettings}
        />
        <LogsPanel logs={logs} />
      </div>
    </main>
  );
}
