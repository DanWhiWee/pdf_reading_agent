import { useState, useRef, useEffect } from "react";
import { Button, Tag } from "antd";
import { SendOutlined, StopOutlined, CloseOutlined } from "@ant-design/icons";
import { useAppStore } from "../../stores/appStore";

const QUICK_ACTIONS = ["解释这句话", "翻译成中文", "总结", "用简单语言解释"];

interface Props {
  onSend: (content: string, imageDataUrl?: string) => void;
  onStop: () => void;
}

export default function ChatInput({ onSend, onStop }: Props) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const {
    isStreaming,
    selectedText,
    selectedPage,
    clearSelectedText,
    pendingImage,
    setPendingImage,
  } = useAppStore();

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
    onSend(text, pendingImage ?? undefined);
    setInput("");
    setPendingImage(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === "string") {
            setPendingImage(reader.result);
          }
        };
        reader.readAsDataURL(file);
        break;
      }
    }
  };

  return (
    <div className="chat-input-area">
      {(selectedText || selectedPage || pendingImage) && (
        <div className="selected-text-preview">
          {selectedText ? (
            <div className="quick-actions-row">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action}
                  className="quick-action-chip"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    if (isStreaming) return;
                    onSend(action, undefined);
                  }}
                >
                  {action}
                </button>
              ))}
            </div>
          ) : null}
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
          {pendingImage ? (
            <div className="pending-image-preview">
              <img src={pendingImage} alt="截图预览" />
              <button
                className="pending-image-remove"
                onClick={() => setPendingImage(null)}
                title="移除截图"
              >
                <CloseOutlined />
              </button>
            </div>
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
          onPaste={handlePaste}
          placeholder="输入问题，或粘贴截图后提问..."
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
