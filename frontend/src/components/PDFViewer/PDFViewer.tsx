import { useState, useCallback, useEffect, useRef } from "react";
import { Alert } from "antd";

import { useAppStore } from "../../stores/appStore";
import {
  READER_OUTER_BG,
  READER_VIEWPORT_BG,
  READER_PAGE_FILTER,
} from "../../constants/readerTheme";
import { getPDFFileUrl } from "../../services/api";
import UploadArea from "./UploadArea";
import PDFToolbar from "./PDFToolbar";
import PdfiumViewer, {
  type AnnotationToolbarUiState,
  type PdfiumViewerHandle,
} from "./PdfiumViewer";
import "./PDFViewer.css";

function lastPageKey(docId: string) {
  return `pdf-last-page-${docId}`;
}

function saveLastPage(docId: string, page: number) {
  try { localStorage.setItem(lastPageKey(docId), String(page)); } catch { /* ignore */ }
}

function loadLastPage(docId: string): number {
  try {
    const v = parseInt(localStorage.getItem(lastPageKey(docId)) ?? "", 10);
    return isNaN(v) || v < 1 ? 1 : v;
  } catch { return 1; }
}

export default function PDFViewer() {
  const { currentDocId, currentDocMeta, readerBackground } = useAppStore();
  const pdfNav = useAppStore((s) => s.pdfNav);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [annotUi, setAnnotUi] = useState<AnnotationToolbarUiState>({
    canUndo: false,
    canRedo: false,
    activeToolId: null,
    selectedAnnotationCount: 0,
  });
  const setSelectedPage = useAppStore((s) => s.setSelectedPage);
  const viewerRef = useRef<PdfiumViewerHandle>(null);
  const fileUrl = currentDocId ? getPDFFileUrl(currentDocId) : "";

  const handleDocReady = useCallback((n: number) => {
    setLoadError(null);
    setNumPages(n);
    setCurrentPage(1);
    // Restore last reading position (skip page 1 — it's the default)
    const docId = useAppStore.getState().currentDocId;
    if (docId) {
      const saved = loadLastPage(docId);
      if (saved > 1) {
        // Small delay to let the viewer finish its initial FitWidth zoom
        setTimeout(() => {
          useAppStore.getState().navigatePdf({ page: saved });
        }, 300);
      }
    }
  }, []);

  const handleLoadError = useCallback((msg: string) => {
    setLoadError(msg);
    setNumPages(0);
  }, []);

  useEffect(() => {
    if (!currentDocId) {
      setNumPages(0);
      setCurrentPage(1);
      setScale(1);
      setLoadError(null);
      setAnnotUi({
        canUndo: false,
        canRedo: false,
        activeToolId: null,
        selectedAnnotationCount: 0,
      });
    }
  }, [currentDocId]);

  useEffect(() => {
    if (!pdfNav?.page || pdfNav.page <= 0) return;
    setCurrentPage(pdfNav.page);
    setSelectedPage(pdfNav.page);
  }, [pdfNav, setSelectedPage]);

  const handlePageChange = useCallback(
    (page: number) => {
      setCurrentPage(page);
      setSelectedPage(page);
      const docId = useAppStore.getState().currentDocId;
      if (docId) saveLastPage(docId, page);
    },
    [setSelectedPage],
  );

  if (!currentDocId || !currentDocMeta) {
    return (
      <div
        className="pdf-viewer-empty"
        style={{ background: READER_VIEWPORT_BG[readerBackground] }}
      >
        <UploadArea />
      </div>
    );
  }

  return (
    <div
      className="pdf-viewer"
      style={{ background: READER_OUTER_BG[readerBackground] }}
    >
      <PDFToolbar
        currentPage={currentPage}
        numPages={numPages || currentDocMeta.num_pages}
        scale={scale}
        onPageChange={handlePageChange}
        embedZoom={{
          onIn: () => viewerRef.current?.zoomIn(),
          onOut: () => viewerRef.current?.zoomOut(),
          onFitWidth: () => viewerRef.current?.fitWidth(),
          on100: () => viewerRef.current?.zoom100(),
          onSetZoomPercent: (p) => viewerRef.current?.setZoomPercent(p),
        }}
        embedSearch={{
          run: (q) => viewerRef.current?.search(q),
          next: () => viewerRef.current?.searchNext(),
          prev: () => viewerRef.current?.searchPrev(),
          clear: () => viewerRef.current?.clearSearch(),
        }}
        embedAnnotations={{
          activeToolId: annotUi.activeToolId,
          canUndo: annotUi.canUndo,
          canRedo: annotUi.canRedo,
          selectedAnnotationCount: annotUi.selectedAnnotationCount,
          setTool: (t) => viewerRef.current?.setAnnotationTool(t),
          undo: () => viewerRef.current?.annotationUndo(),
          redo: () => viewerRef.current?.annotationRedo(),
          exportPdf: () => viewerRef.current?.downloadAnnotatedPdf(),
          deleteSelected: () =>
            viewerRef.current?.deleteSelectedAnnotations(),
        }}
      />
      <div className="pdf-content">
        {loadError ? (
          <Alert
            type="error"
            showIcon
            message="PDF 渲染失败"
            description={loadError}
            style={{ marginBottom: 12 }}
          />
        ) : null}
        <PdfiumViewer
          ref={viewerRef}
          fileUrl={fileUrl}
          appDocId={currentDocId}
          exportFileStem={currentDocMeta.filename}
          readerViewportBg={READER_VIEWPORT_BG[readerBackground]}
          pageFilter={READER_PAGE_FILTER[readerBackground]}
          onPageChange={handlePageChange}
          onDocReady={handleDocReady}
          onLoadError={handleLoadError}
          onZoomLevel={setScale}
          navPage={pdfNav?.page ?? null}
          navNonce={pdfNav?.nonce ?? null}
          onAnnotationUiChange={setAnnotUi}
        />
      </div>
    </div>
  );
}
