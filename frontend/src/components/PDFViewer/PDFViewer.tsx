import { useState, useRef, useCallback, useEffect } from "react";
import { Document, pdfjs } from "react-pdf";
import type { PDFDocumentProxy } from "pdfjs-dist";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

import { useAppStore } from "../../stores/appStore";
import { getPDFFileUrl } from "../../services/api";
import UploadArea from "./UploadArea";
import PDFToolbar from "./PDFToolbar";
import TextSelectionPopover from "./TextSelectionPopover";
import LazyPdfPage from "./LazyPdfPage";
import "./PDFViewer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

export default function PDFViewer() {
  const { currentDocId, currentDocMeta } = useAppStore();
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [estimatedPageHeight, setEstimatedPageHeight] = useState(800);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const pdfRef = useRef<PDFDocumentProxy | null>(null);

  const registerWrapper = useCallback(
    (page: number, el: HTMLDivElement | null) => {
      if (el) pageRefs.current.set(page, el);
      else pageRefs.current.delete(page);
    },
    []
  );

  const onDocumentLoadSuccess = useCallback(
    async (pdf: PDFDocumentProxy) => {
      pdfRef.current = pdf;
      setNumPages(pdf.numPages);
      setCurrentPage(1);
      const page = await pdf.getPage(1);
      setEstimatedPageHeight(page.getViewport({ scale }).height);
    },
    [scale]
  );

  useEffect(() => {
    const pdf = pdfRef.current;
    if (!pdf) return;
    let cancelled = false;
    pdf.getPage(1).then((page) => {
      if (!cancelled) {
        setEstimatedPageHeight(page.getViewport({ scale }).height);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [scale]);

  const scrollToPage = useCallback((page: number) => {
    const el = pageRefs.current.get(page);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const handlePageChange = useCallback(
    (page: number) => {
      setCurrentPage(page);
      scrollToPage(page);
    },
    [scrollToPage]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || numPages === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const pageNum = Number(entry.target.getAttribute("data-page"));
            if (pageNum) setCurrentPage(pageNum);
          }
        }
      },
      {
        root: container,
        rootMargin: "-50% 0px",
        threshold: 0,
      }
    );

    pageRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [numPages, scale]);

  useEffect(() => {
    if (!currentDocId) {
      pdfRef.current = null;
      setNumPages(0);
    }
  }, [currentDocId]);

  if (!currentDocId || !currentDocMeta) {
    return (
      <div className="pdf-viewer-empty">
        <UploadArea />
      </div>
    );
  }

  const fileUrl = getPDFFileUrl(currentDocId);

  return (
    <div className="pdf-viewer">
      <PDFToolbar
        currentPage={currentPage}
        numPages={numPages}
        scale={scale}
        onPageChange={handlePageChange}
        onScaleChange={setScale}
      />
      <div className="pdf-content" ref={containerRef}>
        <TextSelectionPopover containerRef={containerRef} />
        <Document
          key={currentDocId}
          file={fileUrl}
          onLoadSuccess={onDocumentLoadSuccess}
        >
          {Array.from({ length: numPages }, (_, i) => {
            const pageNumber = i + 1;
            return (
              <LazyPdfPage
                key={pageNumber}
                pageNumber={pageNumber}
                scale={scale}
                eager={pageNumber <= 2}
                estimatedHeight={estimatedPageHeight}
                registerWrapper={registerWrapper}
              />
            );
          })}
        </Document>
      </div>
    </div>
  );
}
