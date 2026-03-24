import { useEffect, useRef, useState } from "react";
import { Avatar, Collapse } from "antd";
import { RobotOutlined, UserOutlined } from "@ant-design/icons";
import ReactMarkdown from "react-markdown";
import type { ChatMessage } from "../../types";

interface Props {
  message: ChatMessage;
  isLastAssistant?: boolean;
  isStreaming?: boolean;
}

export default function MessageItem({
  message,
  isLastAssistant = false,
  isStreaming = false,
}: Props) {
  const isUser = message.role === "user";
  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  const wasStreamingRef = useRef(false);

  useEffect(() => {
    if (!isLastAssistant) {
      wasStreamingRef.current = false;
      return;
    }
    if (!message.reasoning) {
      wasStreamingRef.current = isStreaming;
      return;
    }
    if (isStreaming) {
      setThinkingExpanded(true);
    } else if (wasStreamingRef.current) {
      setThinkingExpanded(false);
    }
    wasStreamingRef.current = isStreaming;
  }, [message.reasoning, isLastAssistant, isStreaming]);

  return (
    <div className={`message-item ${isUser ? "user" : "assistant"}`}>
      <Avatar
        size={32}
        icon={isUser ? <UserOutlined /> : <RobotOutlined />}
        style={{
          backgroundColor: isUser ? "#1677ff" : "#52c41a",
          flexShrink: 0,
        }}
      />
      <div className="message-bubble">
        {message.selectedText && (
          <div className="quoted-text">
            <span className="quote-label">Selected text:</span>
            <span className="quote-content">
              {message.selectedText.length > 120
                ? message.selectedText.slice(0, 120) + "..."
                : message.selectedText}
            </span>
          </div>
        )}
        {isUser ? (
          <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>
            {message.content}
          </p>
        ) : (
          <>
            {message.reasoning ? (
              <Collapse
                bordered={false}
                className="thinking-collapse"
                activeKey={thinkingExpanded ? ["think"] : []}
                onChange={(keys) => {
                  const k = Array.isArray(keys) ? keys : [keys];
                  setThinkingExpanded(k.includes("think"));
                }}
                items={[
                  {
                    key: "think",
                    label:
                      isLastAssistant && isStreaming
                        ? "思考中…"
                        : "思考过程",
                    children: (
                      <pre className="thinking-pre">{message.reasoning}</pre>
                    ),
                  },
                ]}
              />
            ) : null}
            <div className="markdown-body">
              <ReactMarkdown>{message.content || "…"}</ReactMarkdown>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
