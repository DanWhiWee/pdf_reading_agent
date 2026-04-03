import { lazy, Suspense } from "react";
import { Allotment } from "allotment";
import { Spin } from "antd";
import { CommentOutlined } from "@ant-design/icons";
import "allotment/dist/style.css";

import ChatPanel from "./components/ChatPanel/ChatPanel";
import { READER_OUTER_BG } from "./constants/readerTheme";
import { useAppStore } from "./stores/appStore";
import "./App.css";

const PdfReaderPane = lazy(
  () => import("./components/PDFViewer/PdfReaderPane"),
);

function ReaderSuspenseFallback() {
  const readerBackground = useAppStore((s) => s.readerBackground);
  return (
    <div
      className="pdf-reader-suspense-fallback"
      style={{ background: READER_OUTER_BG[readerBackground] }}
    >
      <Spin size="large" tip="加载阅读器...">
        <div className="pdf-reader-suspense-spin-placeholder" />
      </Spin>
    </div>
  );
}

export default function App() {
  const chatCollapsed = useAppStore((s) => s.chatPanelCollapsed);
  const setChatCollapsed = useAppStore((s) => s.setChatPanelCollapsed);

  if (chatCollapsed) {
    return (
      <div className="app app--chat-collapsed">
        <button
          type="button"
          className="chat-reveal-rail"
          title="展开对话"
          onClick={() => setChatCollapsed(false)}
        >
          <CommentOutlined />
          <span className="chat-reveal-rail-text">对话</span>
        </button>
        <div className="app__reader-full">
          <Suspense fallback={<ReaderSuspenseFallback />}>
            <PdfReaderPane />
          </Suspense>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Allotment defaultSizes={[35, 65]}>
        <Allotment.Pane minSize={280} preferredSize={380}>
          <ChatPanel />
        </Allotment.Pane>
        <Allotment.Pane minSize={400}>
          <Suspense fallback={<ReaderSuspenseFallback />}>
            <PdfReaderPane />
          </Suspense>
        </Allotment.Pane>
      </Allotment>
    </div>
  );
}
