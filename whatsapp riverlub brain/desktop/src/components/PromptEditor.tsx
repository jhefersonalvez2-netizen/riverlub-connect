import { Brain, RefreshCw, Save, Send } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";

interface PromptEditorProps {
  prompt: string;
  saveLoading: boolean;
  testLoading: boolean;
  testReply: string | null;
  testError: string | null;
  statusMessage: string | null;
  onSave: (prompt: string) => Promise<string>;
  onTest: (message: string) => Promise<void>;
}

export function PromptEditor({
  prompt,
  saveLoading,
  testLoading,
  testReply,
  testError,
  statusMessage,
  onSave,
  onTest
}: PromptEditorProps) {
  const [savedPrompt, setSavedPrompt] = useState(prompt);
  const [draftPrompt, setDraftPrompt] = useState(prompt);
  const [isDirty, setIsDirty] = useState(false);
  const [hasInitializedDraft, setHasInitializedDraft] = useState(false);
  const [hasExternalUpdate, setHasExternalUpdate] = useState(false);
  const [testMessage, setTestMessage] = useState(
    "Cliente pergunta se voces fazem troca de oleo hoje."
  );

  const applyPromptToDraft = useCallback((nextPrompt: string) => {
    setDraftPrompt(nextPrompt);
  }, []);

  useEffect(() => {
    setSavedPrompt(prompt);

    if (!hasInitializedDraft || !isDirty) {
      applyPromptToDraft(prompt);
      setIsDirty(false);
      setHasExternalUpdate(false);
      setHasInitializedDraft(true);
      return;
    }

    setHasExternalUpdate(true);
  }, [applyPromptToDraft, hasInitializedDraft, isDirty, prompt]);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    const saved = await onSave(draftPrompt);
    setSavedPrompt(saved);
    applyPromptToDraft(saved);
    setIsDirty(false);
    setHasExternalUpdate(false);
  }

  async function handleTest() {
    await onTest(testMessage);
  }

  function handlePromptChange(nextPrompt: string) {
    setDraftPrompt(nextPrompt);
    setIsDirty(true);
  }

  function discardChanges() {
    applyPromptToDraft(savedPrompt);
    setIsDirty(false);
    setHasExternalUpdate(false);
  }

  return (
    <section className="panel prompt-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Cerebro</span>
          <h2>Prompt da IA</h2>
        </div>
        <Brain size={22} />
      </div>

      <form onSubmit={handleSave} className="stack">
        {isDirty ? <div className="warning-box">Alteracoes nao salvas.</div> : null}
        {hasExternalUpdate ? (
          <div className="warning-box">
            O agent enviou uma versao nova do prompt enquanto voce editava. Salve ou descarte para
            sincronizar.
          </div>
        ) : null}
        <textarea
          value={draftPrompt}
          onChange={(event) => handlePromptChange(event.target.value)}
          rows={10}
          spellCheck
        />
        <div className="actions-row">
          <button
            type="submit"
            className="primary"
            disabled={saveLoading || testLoading || !isDirty || draftPrompt.length < 20}
          >
            <Save size={17} />
            {saveLoading ? "Salvando..." : "Salvar prompt"}
          </button>
          <button
            type="button"
            disabled={saveLoading || testLoading || !isDirty}
            onClick={discardChanges}
          >
            <RefreshCw size={17} />
            Descartar alteracoes
          </button>
        </div>
        {statusMessage ? <div className="inline-success">{statusMessage}</div> : null}
      </form>

      <div className="test-box">
        <label htmlFor="prompt-test">Mensagem de teste</label>
        <div className="inline-form">
          <input
            id="prompt-test"
            value={testMessage}
            onChange={(event) => setTestMessage(event.target.value)}
          />
          <button type="button" disabled={saveLoading || testLoading || !testMessage.trim()} onClick={handleTest}>
            <Send size={17} />
            {testLoading ? "Testando..." : "Testar"}
          </button>
        </div>
        {testReply ? <div className="reply-box">{testReply}</div> : null}
        {testError ? <div className="reply-box is-error">{testError}</div> : null}
      </div>
    </section>
  );
}
