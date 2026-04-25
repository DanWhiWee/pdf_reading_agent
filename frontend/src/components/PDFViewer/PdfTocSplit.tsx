import { useState, type ReactNode } from "react";
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

  // Always keep children mounted to prevent PdfiumViewer from reinitializing.
  // TOC is hidden via CSS (display:none) rather than unmounted.
  return (
    <div className={`pdf-toc-split-outer${tocVisible ? "" : " pdf-toc-split-outer--collapsed"}`}>
      {!tocVisible && (
        <button
          type="button"
          className="pdf-toc-expand-rail"
          title="展开目录"
          onClick={() => setTocVisible(true)}
        >
          <MenuUnfoldOutlined />
          <span className="pdf-toc-expand-rail-text">目录</span>
        </button>
      )}
      <div className="pdf-toc-pane" style={tocVisible ? undefined : { display: "none" }}>
        <TOCSidebar onCollapse={() => setTocVisible(false)} />
      </div>
      <div className="pdf-pane-main">{children}</div>
    </div>
  );
}
