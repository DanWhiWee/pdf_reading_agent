import { useEffect, useRef, useState } from "react";
import { Button, InputNumber, Popover, Typography } from "antd";
import { MenuFoldOutlined, RobotOutlined, SettingOutlined } from "@ant-design/icons";
import { useAppStore } from "../../stores/appStore";
import { useChat } from "../../hooks/useChat";
import {
  fetchChatHistory,
  saveChatHistory,
  saveChatHistoryKeepalive,
} from "../../services/api";
import { migrateLocalChatHistory } from "../../stores/appStore";
import type { ChatMessage } from "../../types";
import MessageItem from "./MessageItem";
import ChatInput from "./ChatInput";
import "./ChatPanel.css";

const PAGE_SIZE = 100;

/** Load chat history from backend when doc changes; debounce-save on message changes. */
function useChatSync() {
  const currentDocId = useAppStore((s) => s.currentDocId);
  const messages = useAppStore((s) => s.messages);
  const isStreaming = useAppStore((s) => s.isStreaming);
  const setMessages = useAppStore((s) => s.setMessages);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedDocRef = useRef<string | null>(null);

  // Load history when doc changes. Retries indefinitely until success or doc changes.
  useEffect(() => {
    if (!currentDocId || loadedDocRef.current === currentDocId) return;
    const docId = currentDocId;
    let cancelled = false;

    void (async () => {
      while (!cancelled) {
        try {
          const legacy = migrateLocalChatHistory(docId);
          if (legacy && legacy.length > 0) {
            await saveChatHistory(docId, legacy);
            if (!cancelled) { loadedDocRef.current = docId; setMessages(legacy as ChatMessage[]); }
            return;
          }
          const msgs = await fetchChatHistory(docId);
          if (!cancelled) { loadedDocRef.current = docId; setMessages(msgs as ChatMessage[]); }
          return;
        } catch {
          if (!cancelled) await new Promise((r) => setTimeout(r, 2000));
        }
      }
    })();

    return () => { cancelled = true; };
  }, [currentDocId, setMessages]);

  // Reset loaded doc ref when doc is cleared
  useEffect(() => {
    if (!currentDocId) loadedDocRef.current = null;
  }, [currentDocId]);

  // Debounce-save after streaming finishes
  useEffect(() => {
    if (!currentDocId || isStreaming || messages.length === 0) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      const toSave = messages.map(({ imageDataUrl: _, ...rest }) => rest);
      void saveChatHistory(currentDocId, toSave).catch(
        (e) => console.error("Failed to save chat history", e),
      );
    }, 800);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [currentDocId, messages, isStreaming]);

  // Save on page unload
  useEffect(() => {
    const flush = () => {
      const { currentDocId: docId, messages: msgs } = useAppStore.getState();
      if (!docId || msgs.length === 0) return;
      const toSave = msgs.map(({ imageDataUrl: _, ...rest }) => rest);
      saveChatHistoryKeepalive(docId, toSave);
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
    };
  }, []);
}

export default function ChatPanel() {
  const { messages, isStreaming, setChatPanelCollapsed, aiHistoryRounds, setAiHistoryRounds } = useAppStore();
  const { sendMessage, stopGeneration } = useChat();
  const listRef = useRef<HTMLDivElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useChatSync();

  // Reset visible count when switching documents (messages array replaced)
  const prevDocLenRef = useRef(messages.length);
  useEffect(() => {
    if (messages.length < prevDocLenRef.current) {
      setVisibleCount(PAGE_SIZE);
    }
    prevDocLenRef.current = messages.length;
  }, [messages.length]);

  // Auto-scroll to bottom on new messages, but only if already near bottom
  const lastMsgCount = useRef(messages.length);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const newMessages = messages.length > lastMsgCount.current;
    lastMsgCount.current = messages.length;
    if (newMessages || isStreaming) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, isStreaming]);

  const visibleMessages = messages.slice(-visibleCount);
  const hiddenCount = messages.length - visibleCount;
  const hasMore = hiddenCount > 0;

  const handleLoadMore = () => {
    const el = listRef.current;
    const prevScrollHeight = el?.scrollHeight ?? 0;
    setVisibleCount((c) => c + PAGE_SIZE);
    // After render, preserve scroll position so loading more doesn't jump to top
    requestAnimationFrame(() => {
      if (el) {
        el.scrollTop += el.scrollHeight - prevScrollHeight;
      }
    });
  };

  let lastAssistantId: string | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") {
      lastAssistantId = messages[i].id;
      break;
    }
  }

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <RobotOutlined style={{ fontSize: 20, color: "#1677ff" }} />
        <Typography.Title level={5} style={{ margin: 0, flex: 1 }}>
          PDF Reading Assistant
        </Typography.Title>
        <Popover
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          trigger="click"
          placement="bottomRight"
          content={
            <div style={{ width: 220 }}>
              <div style={{ marginBottom: 4, fontSize: 13 }}>发给 AI 的历史轮数（1-50）</div>
              <InputNumber
                min={1}
                max={50}
                value={aiHistoryRounds}
                onChange={(v) => v != null && setAiHistoryRounds(v)}
                style={{ width: "100%" }}
                addonAfter="轮"
              />
              <div style={{ marginTop: 6, fontSize: 11, color: "#888" }}>
                每轮 = 1 条用户消息 + 1 条 AI 回复
              </div>
            </div>
          }
        >
          <Button
            type="text"
            size="small"
            icon={<SettingOutlined />}
            title="对话设置"
            aria-label="对话设置"
          />
        </Popover>
        <Button
          type="text"
          size="small"
          icon={<MenuFoldOutlined />}
          title="收起对话栏"
          aria-label="收起对话栏"
          onClick={() => setChatPanelCollapsed(true)}
        />
      </div>

      <div className="message-list" ref={listRef}>
        {messages.length === 0 ? (
          <div className="empty-chat">
            <RobotOutlined style={{ fontSize: 48, color: "#d9d9d9" }} />
            <p>Upload a PDF and start asking questions</p>
          </div>
        ) : (
          <>
            {hasMore && (
              <div className="load-more-row">
                <Button size="small" type="text" onClick={handleLoadMore}>
                  加载更多（还有 {hiddenCount} 条）
                </Button>
              </div>
            )}
            {visibleMessages.map((msg) => (
              <MessageItem
                key={msg.id}
                message={msg}
                isLastAssistant={
                  msg.role === "assistant" && msg.id === lastAssistantId
                }
                isStreaming={isStreaming}
              />
            ))}
          </>
        )}
      </div>

      <ChatInput onSend={sendMessage} onStop={stopGeneration} />
    </div>
  );
}
