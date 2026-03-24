import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "antd";
import { MessageOutlined } from "@ant-design/icons";
import { useAppStore } from "../../stores/appStore";

interface Props {
  containerRef: React.RefObject<HTMLDivElement | null>;
}

function selectionAnchoredInContainer(
  sel: Selection,
  container: HTMLElement
): boolean {
  if (!sel.rangeCount) return false;
  const range = sel.getRangeAt(0);
  return (
    container.contains(range.startContainer) &&
    container.contains(range.endContainer)
  );
}

function findPdfPageNumber(node: Node | null): number | undefined {
  let cur: Node | null = node;
  while (cur) {
    if (cur instanceof HTMLElement && cur.dataset.page != null) {
      const p = parseInt(cur.dataset.page, 10);
      if (!Number.isNaN(p) && p > 0) return p;
    }
    cur = cur.parentNode;
  }
  return undefined;
}

export default function TextSelectionPopover({ containerRef }: Props) {
  const [visible, setVisible] = useState(false);
  const [fixedPos, setFixedPos] = useState({ x: 0, y: 0 });
  const popoverRef = useRef<HTMLDivElement>(null);
  const visibleRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Clicking the button clears document selection — do not re-read getSelection() in handleAsk */
  const capturedSelectionRef = useRef("");
  const capturedPageRef = useRef<number | undefined>(undefined);
  const { setSelectedText } = useAppStore();

  visibleRef.current = visible;

  const updateFromSelection = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const container = containerRef.current;
      const sel = window.getSelection();
      if (!container || !sel || sel.rangeCount === 0) {
        setVisible(false);
        return;
      }

      const text = sel.toString().trim();
      if (!text || !selectionAnchoredInContainer(sel, container)) {
        setVisible(false);
        return;
      }

      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        setVisible(false);
        return;
      }

      capturedSelectionRef.current = text;
      capturedPageRef.current =
        findPdfPageNumber(range.startContainer) ??
        findPdfPageNumber(range.endContainer);
      setFixedPos({
        x: rect.left + rect.width / 2,
        y: rect.top - 8,
      });
      setVisible(true);
    }, 120);
  }, [containerRef]);

  const handleAsk = () => {
    const text = capturedSelectionRef.current.trim();
    const page = capturedPageRef.current;
    if (text) {
      setSelectedText(text, page);
    }
    capturedSelectionRef.current = "";
    capturedPageRef.current = undefined;
    setVisible(false);
    window.getSelection()?.removeAllRanges();
  };

  useEffect(() => {
    document.addEventListener("selectionchange", updateFromSelection);
    document.addEventListener("mouseup", updateFromSelection);
    document.addEventListener("touchend", updateFromSelection, { passive: true });

    const hideOnPointerDown = (e: PointerEvent) => {
      if (!visibleRef.current) return;
      const t = e.target as Node;
      if (popoverRef.current?.contains(t)) return;
      if (containerRef.current?.contains(t)) return;
      setVisible(false);
    };

    document.addEventListener("pointerdown", hideOnPointerDown);

    return () => {
      document.removeEventListener("selectionchange", updateFromSelection);
      document.removeEventListener("mouseup", updateFromSelection);
      document.removeEventListener("touchend", updateFromSelection);
      document.removeEventListener("pointerdown", hideOnPointerDown);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [updateFromSelection, containerRef]);

  if (!visible) return null;

  const popover = (
    <div
      ref={popoverRef}
      className="text-selection-popover text-selection-popover--fixed"
      style={{
        position: "fixed",
        left: fixedPos.x,
        top: fixedPos.y,
        transform: "translate(-50%, -100%)",
        zIndex: 100000,
      }}
    >
      <Button
        type="primary"
        size="small"
        icon={<MessageOutlined />}
        onMouseDown={(e) => e.preventDefault()}
        onClick={handleAsk}
      >
        Ask about this
      </Button>
    </div>
  );

  return createPortal(popover, document.body);
}
