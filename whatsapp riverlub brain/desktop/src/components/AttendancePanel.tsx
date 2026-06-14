import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  Inbox,
  Pause,
  RefreshCw,
  Send,
  ShieldCheck,
  UserCheck
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  ConversationDetail,
  ConversationStatus,
  ConversationSummary,
  ContactPolicy,
  DraftSuggestion,
  RuntimeSettings
} from "../lib/api";

type ConversationFilter = "all" | "unread" | "human" | "paused" | "resolved";

interface AttendancePanelProps {
  conversations: ConversationSummary[];
  selectedConversation: ConversationDetail | null;
  selectedContactPolicy: ContactPolicy | null;
  selectedContactId: string | null;
  appointmentStatusByContact: Record<string, "pending_confirmation" | "confirmed">;
  settings: RuntimeSettings | null;
  loading: boolean;
  actionLoading: boolean;
  errorMessage: string | null;
  onSelect: (contactId: string) => void;
  onRefresh: () => Promise<void>;
  onMarkRead: (contactId: string) => Promise<void>;
  onToggleHumanTakeover: (contactId: string, enabled: boolean) => Promise<void>;
  onToggleAiPaused: (contactId: string, enabled: boolean) => Promise<void>;
  onSetStatus: (
    contactId: string,
    status: Extract<ConversationStatus, "open" | "resolved" | "archived">
  ) => Promise<void>;
  onSuggest: (contactId: string, extraInstruction?: string) => Promise<DraftSuggestion>;
  onSend: (contactId: string, message: string) => Promise<void>;
  onClearDraft: (contactId: string) => Promise<void>;
  onSaveContactPolicy: (
    contactId: string,
    partial: Partial<Pick<ContactPolicy, "optIn" | "optOut" | "notes">>
  ) => Promise<void>;
  onOptOut: (contactId: string, reason?: string) => Promise<void>;
  onOptIn: (contactId: string) => Promise<void>;
}

function contactLabel(conversation: Pick<ConversationSummary, "displayName" | "phoneDigits" | "contactId">) {
  return conversation.displayName || conversation.phoneDigits || conversation.contactId;
}

function formatTime(value: string | null) {
  if (!value) {
    return "";
  }

  return new Date(value).toLocaleString();
}

function statusLabel(status: ConversationStatus) {
  const labels: Record<ConversationStatus, string> = {
    open: "Aberta",
    human: "Humano",
    paused: "IA pausada",
    resolved: "Resolvida",
    archived: "Arquivada"
  };

  return labels[status];
}

function filterConversation(conversation: ConversationSummary, filter: ConversationFilter) {
  if (filter === "unread") {
    return conversation.unreadCount > 0;
  }

  if (filter === "human") {
    return conversation.humanTakeover;
  }

  if (filter === "paused") {
    return conversation.aiPaused;
  }

  if (filter === "resolved") {
    return conversation.status === "resolved";
  }

  return true;
}

export function AttendancePanel({
  conversations,
  selectedConversation,
  selectedContactPolicy,
  selectedContactId,
  appointmentStatusByContact,
  settings,
  loading,
  actionLoading,
  errorMessage,
  onSelect,
  onRefresh,
  onMarkRead,
  onToggleHumanTakeover,
  onToggleAiPaused,
  onSetStatus,
  onSuggest,
  onSend,
  onClearDraft,
  onSaveContactPolicy,
  onOptOut,
  onOptIn
}: AttendancePanelProps) {
  const [filter, setFilter] = useState<ConversationFilter>("all");
  const [suggestionText, setSuggestionText] = useState("");
  const [suggestionDirty, setSuggestionDirty] = useState(false);
  const [suggestionConflict, setSuggestionConflict] = useState(false);
  const [extraInstruction, setExtraInstruction] = useState("");
  const [manualText, setManualText] = useState("");
  const [manualContactId, setManualContactId] = useState<string | null>(null);
  const [draftKey, setDraftKey] = useState<string | null>(null);
  const [policyDraft, setPolicyDraft] = useState({
    optIn: false,
    optOut: false,
    notes: ""
  });
  const [policyDirty, setPolicyDirty] = useState(false);
  const [policyConflict, setPolicyConflict] = useState(false);
  const [policyKey, setPolicyKey] = useState<string | null>(null);

  const filteredConversations = useMemo(
    () => conversations.filter((conversation) => filterConversation(conversation, filter)),
    [conversations, filter]
  );
  const selectedContact = selectedConversation?.contact ?? null;
  const currentDraftKey = selectedConversation
    ? `${selectedConversation.contact.contactId}:${selectedConversation.draftSuggestion?.id ?? "none"}`
    : null;
  const currentPolicyKey = selectedContactPolicy
    ? `${selectedContactPolicy.contactId}:${selectedContactPolicy.updatedAt}`
    : null;
  const outside24h = selectedContact?.lastInboundAt
    ? Date.now() - Date.parse(selectedContact.lastInboundAt) > 24 * 60 * 60 * 1000
    : false;

  useEffect(() => {
    if (!selectedConversation) {
      setSuggestionText("");
      setSuggestionDirty(false);
      setSuggestionConflict(false);
      setDraftKey(null);
      return;
    }

    if (draftKey !== currentDraftKey || !suggestionDirty) {
      setSuggestionText(selectedConversation.draftSuggestion?.text ?? "");
      setSuggestionDirty(false);
      setSuggestionConflict(false);
      setDraftKey(currentDraftKey);
      return;
    }

    setSuggestionConflict(true);
  }, [currentDraftKey, draftKey, selectedConversation, suggestionDirty]);

  useEffect(() => {
    if (selectedContactId !== manualContactId) {
      setManualText("");
      setManualContactId(selectedContactId);
    }
  }, [manualContactId, selectedContactId]);

  useEffect(() => {
    if (!selectedContactPolicy) {
      setPolicyDraft({ optIn: false, optOut: false, notes: "" });
      setPolicyDirty(false);
      setPolicyConflict(false);
      setPolicyKey(null);
      return;
    }

    if (policyKey !== currentPolicyKey || !policyDirty) {
      setPolicyDraft({
        optIn: selectedContactPolicy.optIn,
        optOut: selectedContactPolicy.optOut,
        notes: selectedContactPolicy.notes
      });
      setPolicyDirty(false);
      setPolicyConflict(false);
      setPolicyKey(currentPolicyKey);
      return;
    }

    setPolicyConflict(true);
  }, [currentPolicyKey, policyDirty, policyKey, selectedContactPolicy]);

  async function handleSuggest() {
    if (!selectedContactId) {
      return;
    }

    const draft = await onSuggest(selectedContactId, extraInstruction);
    setSuggestionText(draft.text);
    setSuggestionDirty(false);
    setSuggestionConflict(false);
    setDraftKey(`${selectedContactId}:${draft.id}`);
  }

  async function handleSendSuggestion() {
    if (!selectedContactId || !suggestionText.trim()) {
      return;
    }

    await onSend(selectedContactId, suggestionText);
    setSuggestionText("");
    setSuggestionDirty(false);
    setSuggestionConflict(false);
  }

  async function handleSendManual() {
    if (!selectedContactId || !manualText.trim()) {
      return;
    }

    await onSend(selectedContactId, manualText);
    setManualText("");
  }

  async function handleClearDraft() {
    if (!selectedContactId) {
      return;
    }

    await onClearDraft(selectedContactId);
    setSuggestionText("");
    setSuggestionDirty(false);
    setSuggestionConflict(false);
  }

  async function handleSavePolicy() {
    if (!selectedContactId) {
      return;
    }

    await onSaveContactPolicy(selectedContactId, policyDraft);
    setPolicyDirty(false);
    setPolicyConflict(false);
  }

  function updatePolicyDraft(partial: Partial<typeof policyDraft>) {
    setPolicyDraft((current) => ({ ...current, ...partial }));
    setPolicyDirty(true);
  }

  return (
    <section className="panel attendance-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Cockpit</span>
          <h2>Atendimento</h2>
        </div>
        <button type="button" className="icon-button" disabled={loading} onClick={() => void onRefresh()}>
          <RefreshCw size={18} />
          <span className="sr-only">Atualizar conversas</span>
        </button>
      </div>

      {settings?.globalPause ? (
        <div className="warning-box">
          <Pause size={18} />
          <span>IA pausada globalmente. Nenhuma resposta automatica sera enviada.</span>
        </div>
      ) : null}

      {errorMessage ? <div className="reply-box is-error">{errorMessage}</div> : null}

      <div className="attendance-layout">
        <aside className="conversation-sidebar">
          <div className="filter-row">
            {(["all", "unread", "human", "paused", "resolved"] as ConversationFilter[]).map(
              (option) => (
                <button
                  type="button"
                  key={option}
                  className={filter === option ? "is-selected" : ""}
                  onClick={() => setFilter(option)}
                >
                  {option === "all"
                    ? "Todas"
                    : option === "unread"
                      ? "Nao lidas"
                      : option === "human"
                        ? "Humano"
                        : option === "paused"
                          ? "IA pausada"
                          : "Resolvidas"}
                </button>
              )
            )}
          </div>

          <div className="conversation-list">
            {filteredConversations.length === 0 ? (
              <div className="empty-state">Nenhuma conversa</div>
            ) : (
              filteredConversations.map((conversation) => (
                <button
                  type="button"
                  className={`conversation-list-item ${
                    selectedContactId === conversation.contactId ? "is-active" : ""
                  }`}
                  key={conversation.contactId}
                  onClick={() => onSelect(conversation.contactId)}
                >
                  <span>
                    <strong>{contactLabel(conversation)}</strong>
                    <small>{conversation.lastMessagePreview || conversation.contactId}</small>
                  </span>
                  <span className="conversation-meta">
                    {conversation.unreadCount > 0 ? (
                      <b>{conversation.unreadCount}</b>
                    ) : null}
                    <small>{formatTime(conversation.lastMessageAt)}</small>
                  </span>
                  <span className="tag-row">
                    <em>{statusLabel(conversation.status)}</em>
                    {appointmentStatusByContact[conversation.contactId] === "pending_confirmation" ? (
                      <em>Agendamento aguardando confirmacao</em>
                    ) : null}
                    {appointmentStatusByContact[conversation.contactId] === "confirmed" ? (
                      <em>Agendamento confirmado</em>
                    ) : null}
                    {conversation.humanTakeover ? <em>Humano</em> : null}
                    {conversation.aiPaused ? <em>IA pausada</em> : null}
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="conversation-detail">
          {!selectedConversation || !selectedContact ? (
            <div className="empty-state">
              <Inbox size={26} />
              Selecione uma conversa para atender
            </div>
          ) : (
            <>
              <header className="conversation-header">
                <div>
                  <h3>{contactLabel(selectedContact)}</h3>
                  <p>{selectedContact.contactId}</p>
                </div>
                <div className="tag-row">
                  <em>{statusLabel(selectedContact.status)}</em>
                  {selectedContact.humanTakeover ? <em>Humano assumiu</em> : null}
                  {selectedContact.aiPaused ? <em>IA pausada</em> : null}
                  {appointmentStatusByContact[selectedContact.contactId] === "pending_confirmation" ? (
                    <em>Agendamento aguardando confirmacao</em>
                  ) : null}
                  {appointmentStatusByContact[selectedContact.contactId] === "confirmed" ? (
                    <em>Agendamento confirmado</em>
                  ) : null}
                </div>
              </header>

              {selectedContact.humanTakeover ? (
                <div className="warning-box">
                  <UserCheck size={18} />
                  <span>Humano assumiu esta conversa. Auto reply deste contato esta bloqueado.</span>
                </div>
              ) : null}

              {selectedContact.aiPaused ? (
                <div className="warning-box">
                  <Pause size={18} />
                  <span>IA pausada para este contato.</span>
                </div>
              ) : null}

              {selectedContactPolicy?.optOut ? (
                <div className="warning-box">
                  <AlertTriangle size={18} />
                  <span>
                    Opt-out ativo para este contato. Auto reply e envios de sistema ficam bloqueados.
                  </span>
                </div>
              ) : null}

              {outside24h ? (
                <div className="warning-box">
                  <Clock3 size={18} />
                  <span>
                    Fora da janela de 24h. Em API oficial, exigiria template.
                  </span>
                </div>
              ) : null}

              <div className="conversation-actions">
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => void onMarkRead(selectedContact.contactId)}
                >
                  <CheckCircle2 size={17} />
                  Marcar como lida
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() =>
                    void onToggleHumanTakeover(
                      selectedContact.contactId,
                      !selectedContact.humanTakeover
                    )
                  }
                >
                  <UserCheck size={17} />
                  {selectedContact.humanTakeover ? "Liberar humano" : "Assumir atendimento"}
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() =>
                    void onToggleAiPaused(selectedContact.contactId, !selectedContact.aiPaused)
                  }
                >
                  <Pause size={17} />
                  {selectedContact.aiPaused ? "Retomar IA" : "Pausar IA deste contato"}
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => void onSetStatus(selectedContact.contactId, "resolved")}
                >
                  <ShieldCheck size={17} />
                  Resolver
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => void onSetStatus(selectedContact.contactId, "open")}
                >
                  Reabrir
                </button>
              </div>

              <div className="contact-policy-box">
                <div>
                  <h4>Politica do contato</h4>
                  <p>
                    Ultima entrada: {formatTime(selectedContact.lastInboundAt) || "sem mensagem recebida"}
                  </p>
                </div>
                {policyConflict ? (
                  <div className="warning-box">
                    Ha uma atualizacao externa da politica, mas suas alteracoes locais foram preservadas.
                  </div>
                ) : null}
                {policyDirty ? <div className="inline-success">Alteracoes de politica nao salvas.</div> : null}
                <div className="policy-grid">
                  <label className="switch-row">
                    <input
                      type="checkbox"
                      checked={policyDraft.optIn}
                      onChange={(event) =>
                        updatePolicyDraft({
                          optIn: event.target.checked,
                          optOut: event.target.checked ? false : policyDraft.optOut
                        })
                      }
                    />
                    <span>
                      <strong>Opt-in</strong>
                      <small>Contato autorizado para comunicacoes operacionais.</small>
                    </span>
                  </label>
                  <label className="switch-row">
                    <input
                      type="checkbox"
                      checked={policyDraft.optOut}
                      onChange={(event) =>
                        updatePolicyDraft({
                          optOut: event.target.checked,
                          optIn: event.target.checked ? false : policyDraft.optIn
                        })
                      }
                    />
                    <span>
                      <strong>Opt-out</strong>
                      <small>Bloqueia auto reply e envios de sistema para este contato.</small>
                    </span>
                  </label>
                </div>
                <textarea
                  rows={3}
                  placeholder="Notas internas da politica do contato"
                  value={policyDraft.notes}
                  onChange={(event) => updatePolicyDraft({ notes: event.target.value })}
                />
                <div className="actions-row">
                  <button
                    type="button"
                    className="primary"
                    disabled={actionLoading || !policyDirty}
                    onClick={() => void handleSavePolicy()}
                  >
                    Salvar politica
                  </button>
                  <button
                    type="button"
                    disabled={actionLoading || selectedContactPolicy?.optOut}
                    onClick={() =>
                      void onOptOut(selectedContact.contactId, "marcado pelo painel")
                    }
                  >
                    Marcar opt-out
                  </button>
                  <button
                    type="button"
                    disabled={actionLoading || selectedContactPolicy?.optIn}
                    onClick={() => void onOptIn(selectedContact.contactId)}
                  >
                    Marcar opt-in
                  </button>
                </div>
              </div>

              <div className="message-timeline">
                {selectedConversation.messages.map((message) => (
                  <article
                    className={`message-bubble ${
                      message.direction === "outbound" ? "is-outbound" : "is-inbound"
                    }`}
                    key={message.id}
                  >
                    <span>
                      {message.direction === "inbound"
                        ? "Cliente"
                        : message.source === "template"
                          ? "Template"
                        : message.isAutoReply
                          ? "IA"
                          : "Humano"}
                    </span>
                    <p>{message.body}</p>
                    <time>{formatTime(message.timestamp)}</time>
                  </article>
                ))}
              </div>

              <div className="assistant-draft">
                <div className="inline-form">
                  <input
                    placeholder="Instrucao extra opcional para a IA"
                    value={extraInstruction}
                    onChange={(event) => setExtraInstruction(event.target.value)}
                  />
                  <button type="button" disabled={actionLoading} onClick={() => void handleSuggest()}>
                    <Bot size={17} />
                    Gerar sugestao IA
                  </button>
                </div>
                {suggestionConflict ? (
                  <div className="warning-box">
                    Ha uma atualizacao externa de sugestao, mas seu rascunho local foi preservado.
                  </div>
                ) : null}
                <textarea
                  rows={4}
                  placeholder="Sugestao da IA ou resposta editada"
                  value={suggestionText}
                  onChange={(event) => {
                    setSuggestionText(event.target.value);
                    setSuggestionDirty(true);
                  }}
                />
                <div className="actions-row">
                  <button
                    type="button"
                    className="primary"
                    disabled={actionLoading || !suggestionText.trim()}
                    onClick={() => void handleSendSuggestion()}
                  >
                    <Send size={17} />
                    Enviar resposta
                  </button>
                  <button type="button" disabled={actionLoading} onClick={() => void handleClearDraft()}>
                    Limpar sugestao
                  </button>
                </div>
              </div>

              <div className="manual-reply">
                <label htmlFor="manual-reply">Resposta manual</label>
                <textarea
                  id="manual-reply"
                  rows={3}
                  placeholder="Digite uma resposta manual"
                  value={manualText}
                  onChange={(event) => setManualText(event.target.value)}
                />
                <button
                  type="button"
                  className="primary"
                  disabled={actionLoading || !manualText.trim()}
                  onClick={() => void handleSendManual()}
                >
                  <Send size={17} />
                  Enviar manualmente
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </section>
  );
}
