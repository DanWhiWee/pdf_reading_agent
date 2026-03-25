import { useState, type ReactNode } from "react";
import { Allotment } from "allotment";
import { MenuUnfoldOutlined } from "@ant-design/icons";
import { useAppStore } from "../../stores/appStore";
import TOCSidebar from "./TOCSidebar";
import "./PDFViewer.css";

export default function PdfTocSplit({ children }: { children: ReactNode }) {
  const currentDocMeta = useAppStore((s) => s.currentDocMeta);
  const [tocVisible, setTocVisible] = useState(true);

  if (!currentDocMeta) {
    return <div className="pdf-pane-main pdf-pane-main--solo">{children}</div>;
  }

  if (!tocVisible) {
    return (
      <div className="pdf-toc-split-outer pdf-toc-split-outer--collapsed">
        <button
          type="button"
          className="pdf-toc-expand-rail"
          title="展开目录"
          onClick={() => setTocVisible(true)}
        >
          <MenuUnfoldOutlined />
          <span className="pdf-toc-expand-rail-text">目录</span>
        </button>
        <div className="pdf-pane-main">{children}</div>
      </div>
    );
  }

  return (
    <div className="pdf-toc-split-outer">
      <Allotment defaultSizes={[300, 900]} className="pdf-toc-inner-allotment">
        <Allotment.Pane minSize={200} maxSize={520} preferredSize={280}>
          <TOCSidebar onCollapse={() => setTocVisible(false)} />
        </Allotment.Pane>
        <Allotment.Pane minSize={320}>
          <div className="pdf-pane-main">{children}</div>
        </Allotment.Pane>
      </Allotment>
    </div>
  );
}
