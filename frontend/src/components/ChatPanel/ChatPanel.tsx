import { useEffect, useRef } from "react";
import { Button, Typography } from "antd";
import { MenuFoldOutlined, RobotOutlined } from "@ant-design/icons";
import { useAppStore } from "../../stores/appStore";
import { useChat } from "../../hooks/useChat";
import MessageItem from "./MessageItem";
import ChatInput from "./ChatInput";
import "./ChatPanel.css";

export default function ChatPanel() {
  const { messages, isStreaming, setChatPanelCollapsed } = useAppStore();
  const { sendMessage, stopGeneration } = useChat();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

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
          messages.map((msg) => (
            <MessageItem
              key={msg.id}
              message={msg}
              isLastAssistant={
                msg.role === "assistant" && msg.id === lastAssistantId
              }
              isStreaming={isStreaming}
            />
          ))
        )}
      </div>

      <ChatInput onSend={sendMessage} onStop={stopGeneration} />
    </div>
  );
}
