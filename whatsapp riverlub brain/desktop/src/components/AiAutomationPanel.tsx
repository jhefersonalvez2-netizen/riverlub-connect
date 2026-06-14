import { AlertTriangle, RefreshCw, RotateCcw, Save, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { RuntimeSettings } from "../lib/api";

interface AiAutomationPanelProps {
  settings: RuntimeSettings | null;
  loading: boolean;
  statusMessage: string | null;
  errorMessage: string | null;
  onSave: (settings: Partial<RuntimeSettings>) => Promise<RuntimeSettings>;
  onReset: () => Promise<RuntimeSettings>;
}

function allowedEntriesToText(entries: string[]) {
  return entries.join("\n");
}

function textToAllowedEntries(value: string) {
  const entries = value
    .split(/[,\n]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return Array.from(
    new Set(
      entries
        .map((item) => (item.includes("@") ? item.replace(/\s/g, "") : item.replace(/\D/g, "")))
        .filter(Boolean)
    )
  );
}

export function AiAutomationPanel({
  settings,
  loading,
  statusMessage,
  errorMessage,
  onSave,
  onReset
}: AiAutomationPanelProps) {
  const [savedSettings, setSavedSettings] = useState<RuntimeSettings | null>(settings);
  const [draftSettings, setDraftSettings] = useState<RuntimeSettings | null>(settings);
  const [allowedNumbersText, setAllowedNumbersText] = useState("");
  const [openModeConfirmed, setOpenModeConfirmed] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [hasInitializedDraft, setHasInitializedDraft] = useState(false);
  const [hasExternalUpdate, setHasExternalUpdate] = useState(false);

  const applySettingsToDraft = useCallback((nextSettings: RuntimeSettings) => {
    setDraftSettings(nextSettings);
    setAllowedNumbersText(allowedEntriesToText(nextSettings.autoReplyAllowedNumbers));
    setOpenModeConfirmed(false);
  }, []);

  useEffect(() => {
    if (!settings) {
      return;
    }

    setSavedSettings(settings);

    if (!hasInitializedDraft || !isDirty) {
      applySettingsToDraft(settings);
      setIsDirty(false);
      setHasExternalUpdate(false);
      setHasInitializedDraft(true);
      return;
    }

    setHasExternalUpdate(true);
  }, [applySettingsToDraft, hasInitializedDraft, isDirty, settings]);

  function updateDraft(partialSettings: Partial<RuntimeSettings>) {
    setDraftSettings((currentSettings) =>
      currentSettings ? { ...currentSettings, ...partialSettings } : currentSettings
    );
    setIsDirty(true);
  }

  function handleAllowedNumbersChange(value: string) {
    setAllowedNumbersText(value);
    setIsDirty(true);
  }

  function discardChanges() {
    if (!savedSettings) {
      return;
    }

    applySettingsToDraft(savedSettings);
    setIsDirty(false);
    setHasExternalUpdate(false);
  }

  const allowedEntries = textToAllowedEntries(allowedNumbersText);
  const openingOpenMode =
    draftSettings?.autoReplyMode === "open" && savedSettings?.autoReplyMode !== "open";
  const canSave =
    Boolean(draftSettings) &&
    isDirty &&
    !loading &&
    (!openingOpenMode || openModeConfirmed);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!draftSettings) {
      return;
    }

    const response = await onSave({
      autoReplyMode: draftSettings.autoReplyMode,
      autoReplyEnabled: draftSettings.autoReplyEnabled,
      autoSuggestEnabled: draftSettings.autoSuggestEnabled,
      globalPause: draftSettings.globalPause,
      allowGroups: draftSettings.allowGroups,
      ignoreOldMessagesOnStart: draftSettings.ignoreOldMessagesOnStart,
      oldMessageMaxAgeSeconds: draftSettings.oldMessageMaxAgeSeconds,
      maxAutoRepliesPerContactPerHour: draftSettings.maxAutoRepliesPerContactPerHour,
      autoReplyAllowedNumbers: allowedEntries
    });

    setSavedSettings(response);
    applySettingsToDraft(response);
    setIsDirty(false);
    setHasExternalUpdate(false);
  }

  async function handleReset() {
    const response = await onReset();
    setSavedSettings(response);
    applySettingsToDraft(response);
    setIsDirty(false);
    setHasExternalUpdate(false);
  }

  const draft = draftSettings;

  return (
    <section className="panel automation-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Automacao</span>
          <h2>Controle da IA</h2>
        </div>
        <Sparkles size={22} />
      </div>

      <form className="stack" onSubmit={handleSubmit}>
        {!draft ? (
          <div className="reply-box is-error">
            Nao foi possivel carregar as configuracoes da IA. Confirme se o agent esta online e se
            o token do desktop esta correto.
          </div>
        ) : null}

        {isDirty ? <div className="warning-box">Alteracoes nao salvas.</div> : null}

        {hasExternalUpdate ? (
          <div className="warning-box">
            Ha alteracoes locais nao salvas. Atualizacoes recebidas do agent ficaram em espera ate
            voce salvar ou descartar.
          </div>
        ) : null}

        <label htmlFor="auto-reply-mode">Modo de resposta da IA</label>
        <select
          id="auto-reply-mode"
          value={draft?.autoReplyMode ?? "manual"}
          disabled={!draft}
          onChange={(event) => {
            const autoReplyMode = event.target.value as RuntimeSettings["autoReplyMode"];
            updateDraft({
              autoReplyMode,
              autoReplyEnabled: autoReplyMode !== "manual"
            });
            setOpenModeConfirmed(false);
          }}
        >
          <option value="manual">Manual / Seguro</option>
          <option value="allowlist">Automatico apenas permitidos</option>
          <option value="open">Automatico aberto</option>
        </select>

        <div className="reply-box">
          {draft?.autoReplyMode === "allowlist"
            ? "A IA responde apenas numeros ou IDs permitidos."
            : draft?.autoReplyMode === "open"
              ? "A IA responde qualquer conversa privada valida. Use somente com prompt revisado."
              : "A IA nao responde automaticamente."}
        </div>

        {draft?.globalPause ? (
          <div className="warning-box">
            <AlertTriangle size={18} />
            <span>IA pausada. Nenhuma resposta automatica sera enviada.</span>
          </div>
        ) : null}

        {draft?.autoReplyMode === "open" ? (
          <div className="warning-box">
            <AlertTriangle size={18} />
            <span>
              Modo aberto: a IA podera responder automaticamente qualquer conversa privada valida.
            </span>
          </div>
        ) : null}

        {openingOpenMode ? (
          <label className="confirm-row">
            <input
              type="checkbox"
              checked={openModeConfirmed}
              disabled={!draft}
              onChange={(event) => setOpenModeConfirmed(event.target.checked)}
            />
            <span>
              Estou ciente de que a IA respondera automaticamente qualquer conversa privada valida.
            </span>
          </label>
        ) : null}

        <label htmlFor="allowed-numbers">Permitidos</label>
        <textarea
          id="allowed-numbers"
          rows={4}
          placeholder="5587999999999&#10;5587999999999@c.us&#10;77949915107564@lid"
          value={allowedNumbersText}
          disabled={!draft}
          onChange={(event) => handleAllowedNumbersChange(event.target.value)}
        />

        {draft?.autoReplyMode === "allowlist" && allowedEntries.length === 0 ? (
          <div className="warning-box">
            <AlertTriangle size={18} />
            <span>
              No modo permitidos, a IA so respondera contatos presentes nessa lista.
            </span>
          </div>
        ) : null}

        <label className="switch-row">
          <input
            type="checkbox"
            checked={Boolean(draft?.globalPause)}
            disabled={!draft}
            onChange={(event) => updateDraft({ globalPause: event.target.checked })}
          />
          <span>
            <strong>Pausa global da IA</strong>
            <small>
              {draft?.globalPause
                ? "IA pausada agora."
                : "Respostas automaticas seguem o modo selecionado."}
            </small>
          </span>
        </label>

        <label className="switch-row">
          <input
            type="checkbox"
            checked={Boolean(draft?.allowGroups)}
            disabled={!draft}
            onChange={(event) => updateDraft({ allowGroups: event.target.checked })}
          />
          <span>
            <strong>Permitir grupos</strong>
            <small>
              {draft?.allowGroups ? "Grupos liberados." : "Grupos bloqueados por seguranca."}
            </small>
          </span>
        </label>

        <label className="switch-row">
          <input
            type="checkbox"
            checked={draft?.ignoreOldMessagesOnStart ?? true}
            disabled={!draft}
            onChange={(event) =>
              updateDraft({ ignoreOldMessagesOnStart: event.target.checked })
            }
          />
          <span>
            <strong>Ignorar mensagens antigas ao conectar</strong>
            <small>Evita processar historico carregado pelo WhatsApp Web.</small>
          </span>
        </label>

        <label htmlFor="old-message-age">Segundos de tolerancia</label>
        <input
          id="old-message-age"
          type="number"
          min={0}
          max={86400}
          value={draft?.oldMessageMaxAgeSeconds ?? 120}
          disabled={!draft}
          onChange={(event) =>
            updateDraft({ oldMessageMaxAgeSeconds: Number(event.target.value) })
          }
        />

        <label htmlFor="auto-reply-hour-limit">Limite por contato/hora</label>
        <input
          id="auto-reply-hour-limit"
          type="number"
          min={1}
          max={200}
          value={draft?.maxAutoRepliesPerContactPerHour ?? 20}
          disabled={!draft}
          onChange={(event) =>
            updateDraft({ maxAutoRepliesPerContactPerHour: Number(event.target.value) })
          }
        />

        {statusMessage ? <div className="inline-success">{statusMessage}</div> : null}
        {errorMessage ? <div className="reply-box is-error">{errorMessage}</div> : null}

        <div className="actions-row">
          <button type="submit" className="primary" disabled={!canSave}>
            <Save size={17} />
            {loading ? "Salvando..." : "Salvar configuracoes"}
          </button>
          <button type="button" disabled={loading || !isDirty} onClick={discardChanges}>
            <RefreshCw size={17} />
            Descartar alteracoes
          </button>
          <button type="button" disabled={loading} onClick={() => void handleReset()}>
            <RotateCcw size={17} />
            Restaurar modo seguro
          </button>
        </div>
      </form>
    </section>
  );
}
