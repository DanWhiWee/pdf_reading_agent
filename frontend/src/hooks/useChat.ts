import { useCallback, useRef } from "react";
import { useAppStore } from "../stores/appStore";
import { streamChat } from "../services/api";
import { extractInlineThinking } from "../utils/thinkingParse";

export function useChat() {
  const {
    isStreaming,
    addMessage,
    updateLastAssistant,
    setIsStreaming,
    clearSelectedText,
  } = useAppStore();

  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isStreaming) return;

      const snap = useAppStore.getState();
      const docId = snap.currentDocId;
      const selText = snap.selectedText;
      const selPage = snap.selectedPage;

      const userMsg = {
        id: Date.now().toString(),
        role: "user" as const,
        content,
        selectedText: selText || undefined,
        pageNumber: selPage ?? undefined,
      };
      addMessage(userMsg);

      const assistantMsg = {
        id: (Date.now() + 1).toString(),
        role: "assistant" as const,
        content: "",
      };
      addMessage(assistantMsg);
      setIsStreaming(true);

      const history = snap.messages
        .filter((m) => m.content)
        .map((m) => ({ role: m.role, content: m.content }));

      const trimmed = content.trim();
      const hasSelection = Boolean(selText && selText.trim());
      const messageForApi = hasSelection
        ? `[Selected text from PDF]\n"""\n${selText.trim()}\n"""\n\n[Your question]\n${trimmed}`
        : trimmed;

      let reasoningAcc = "";
      let contentAcc = "";
      abortRef.current = new AbortController();

      const patchAssistant = () => {
        updateLastAssistant({
          content: contentAcc,
          reasoning: reasoningAcc.trim() || undefined,
        });
      };

      try {
        await streamChat(
          {
            message: messageForApi,
            doc_id: docId,
            selected_text: hasSelection ? selText.trim() : undefined,
            page_number: selPage ?? undefined,
            history,
          },
          ({ token, kind }) => {
            if (kind === "reasoning") reasoningAcc += token;
            else contentAcc += token;
            patchAssistant();
          },
          () => {},
          (err) => {
            contentAcc += `\n\n**Error:** ${err}`;
            patchAssistant();
          },
          abortRef.current.signal
        );
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === "AbortError") {
          /* finalize below */
        } else {
          const msg = e instanceof Error ? e.message : String(e);
          contentAcc += `\n\n**Error:** ${msg}`;
          patchAssistant();
        }
      } finally {
        const state = useAppStore.getState();
        const last = state.messages[state.messages.length - 1];
        if (last?.role === "assistant") {
          const { body, extraReasoning } = extractInlineThinking(last.content);
          const merged = [last.reasoning, extraReasoning]
            .filter(Boolean)
            .join("\n\n")
            .trim();
          useAppStore.getState().updateLastAssistant({
            content: body || last.content,
            reasoning: merged || undefined,
          });
        }
        setIsStreaming(false);
        clearSelectedText();
        abortRef.current = null;
      }
    },
    [
      isStreaming,
      addMessage,
      updateLastAssistant,
      setIsStreaming,
      clearSelectedText,
    ]
  );

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { sendMessage, stopGeneration };
}
