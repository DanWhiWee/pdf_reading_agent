import { useState, useRef, useEffect } from "react";
import { Button, Tag } from "antd";
import { SendOutlined, StopOutlined, CloseOutlined } from "@ant-design/icons";
import { useAppStore } from "../../stores/appStore";

interface Props {
  onSend: (content: string) => void;
  onStop: () => void;
}

export default function ChatInput({ onSend, onStop }: Props) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { isStreaming, selectedText, selectedPage, clearSelectedText } = useAppStore();

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 150) + "px";
    }
  }, [input]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    onSend(text);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-input-area">
      {(selectedText || selectedPage) && (
        <div className="selected-text-preview">
          {selectedPage ? (
            <Tag
              color="geekblue"
              closable
              onClose={clearSelectedText}
              closeIcon={<CloseOutlined />}
            >
              当前页上下文: 第 {selectedPage} 页
            </Tag>
          ) : null}
          {selectedText ? (
            <Tag
              color="blue"
              closable
              onClose={clearSelectedText}
              closeIcon={<CloseOutlined />}
            >
              Selected: "
              {selectedText.length > 50
                ? selectedText.slice(0, 50) + "..."
                : selectedText}
              "
            </Tag>
          ) : null}
        </div>
      )}
      <div className="input-row">
        <textarea
          ref={textareaRef}
          className="chat-textarea"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your question about the PDF..."
          rows={1}
        />
        {isStreaming ? (
          <Button
            type="default"
            danger
            icon={<StopOutlined />}
            onClick={onStop}
            shape="circle"
            size="large"
          />
        ) : (
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleSend}
            disabled={!input.trim()}
            shape="circle"
            size="large"
          />
        )}
      </div>
    </div>
  );
}
