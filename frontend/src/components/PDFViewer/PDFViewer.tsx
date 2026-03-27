import { useState, useRef, useCallback, useEffect, useMemo } from "react";
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
import { computeFitWidthScale } from "../../utils/pdfDisplay";
import "./PDFViewer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

type ScaleMode = "fitWidth" | "manual";

export default function PDFViewer() {
  const { currentDocId, currentDocMeta } = useAppStore();
  const pdfNav = useAppStore((s) => s.pdfNav);
  const pdfSearch = useAppStore((s) => s.pdfSearch);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [scaleMode, setScaleMode] = useState<ScaleMode>("fitWidth");
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

  const onDocumentLoadSuccess = useCallback(async (pdf: PDFDocumentProxy) => {
    pdfRef.current = pdf;
    setNumPages(pdf.numPages);
    setCurrentPage(1);
    setScaleMode("fitWidth");
    const runFit = () => {
      const el = containerRef.current;
      if (!el) return;
      void computeFitWidthScale(pdf, el).then(setScale);
    };
    requestAnimationFrame(() => {
      requestAnimationFrame(runFit);
    });
  }, []);

  const handleFitWidth = useCallback(async () => {
    const pdf = pdfRef.current;
    const el = containerRef.current;
    if (!pdf || !el) return;
    setScaleMode("fitWidth");
    setScale(await computeFitWidthScale(pdf, el));
  }, []);

  const handleScaleChange = useCallback((next: number) => {
    setScaleMode("manual");
    setScale(next);
  }, []);

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

  const searchScrollPageRef = useRef<number | null>(null);

  const findTitleTopInPage = useCallback(
    (wrapper: HTMLDivElement, title: string): number | null => {
      const textLayer = wrapper.querySelector(".react-pdf__Page__textContent");
      if (!textLayer) return null;
      const tokens = title.split(/\s+/).filter(Boolean);
      const needle =
        tokens.length >= 2
          ? tokens.slice(0, 2).join("").slice(0, 8)
          : (tokens[0] || "").slice(0, 8);
      if (!needle) return null;
      const spans = textLayer.querySelectorAll("span");
      for (const span of spans) {
        const txt = (span.textContent ?? "").replace(/\s+/g, "");
        if (txt.includes(needle)) {
          return (span as HTMLElement).offsetTop;
        }
      }
      return null;
    },
    []
  );

  const scrollToPage = useCallback(
    (page: number, y?: number | null, title?: string | null) => {
      const container = containerRef.current;
      const wrapper = pageRefs.current.get(page);
      if (!container || !wrapper) return;

      const wrapperTop = wrapper.offsetTop - container.offsetTop;

      let inPageOffset = 0;

      if (typeof y === "number" && y > 0) {
        const canvas = wrapper.querySelector("canvas");
        if (canvas) {
          inPageOffset = (y / (canvas.height / scale)) * canvas.clientHeight;
        }
      }

      if (inPageOffset === 0 && title) {
        const found = findTitleTopInPage(wrapper, title);
        if (found !== null) {
          inPageOffset = found;
        }
      }

      container.scrollTo({
        top: wrapperTop + inPageOffset,
        behavior: "smooth",
      });
    },
    [scale, findTitleTopInPage]
  );

  const scheduleScrollToPage = useCallback(
    (page: number, y?: number | null, title?: string | null) => {
      const t1 = window.setTimeout(() => scrollToPage(page, y, title), 60);
      const t2 = window.setTimeout(() => scrollToPage(page, y, title), 220);
      const t3 = window.setTimeout(() => scrollToPage(page, y, title), 450);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    },
    [scrollToPage]
  );

  const searchJumpPage = useMemo(() => {
    if (!pdfSearch?.hits?.length) return null;
    return pdfSearch.hits[pdfSearch.index]?.page ?? null;
  }, [pdfSearch]);

  const navJumpPage = pdfNav?.page ?? null;

  const searchHitContext = useMemo(() => {
    if (!pdfSearch?.hits.length) return null;
    const hit = pdfSearch.hits[pdfSearch.index];
    if (!hit) return null;
    let ordinal = 0;
    for (let i = 0; i < pdfSearch.index; i++) {
      if (pdfSearch.hits[i].page === hit.page) ordinal++;
    }
    const query = (pdfSearch.query || hit.text || "").trim();
    const fallback =
      hit.rect && hit.rect.length === 4 ? [hit.rect as number[]] : null;
    return { page: hit.page, query, ordinal, fallback };
  }, [pdfSearch]);

  useEffect(() => {
    const nav = useAppStore.getState().pdfNav;
    if (!nav) return;
    return scheduleScrollToPage(nav.page, nav.y, nav.title);
  }, [pdfNav?.nonce, scheduleScrollToPage]);

  useEffect(() => {
    if (!pdfSearch?.hits.length) {
      searchScrollPageRef.current = null;
      return;
    }
    const hit = pdfSearch.hits[pdfSearch.index];
    if (!hit) return;
    const p = hit.page;
    if (searchScrollPageRef.current === p) {
      return;
    }
    searchScrollPageRef.current = p;
    return scheduleScrollToPage(p);
  }, [pdfSearch, scheduleScrollToPage]);

  const handlePageChange = useCallback(
    (page: number) => {
      setCurrentPage(page);
      scrollToPage(page, null, null);
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
      setScaleMode("fitWidth");
    }
  }, [currentDocId]);

  useEffect(() => {
    if (scaleMode !== "fitWidth" || numPages === 0) return;
    const pdf = pdfRef.current;
    const el = containerRef.current;
    if (!pdf || !el) return;
    let tid: ReturnType<typeof setTimeout>;
    const schedule = () => {
      clearTimeout(tid);
      tid = window.setTimeout(() => {
        void computeFitWidthScale(pdf, el).then(setScale);
      }, 120);
    };
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    schedule();
    return () => {
      ro.disconnect();
      clearTimeout(tid);
    };
  }, [scaleMode, numPages, currentDocId]);

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
        onScaleChange={handleScaleChange}
        onFitWidth={handleFitWidth}
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
                eager={
                  pageNumber <= 2 ||
                  (searchJumpPage != null && pageNumber === searchJumpPage) ||
                  (navJumpPage != null && pageNumber === navJumpPage)
                }
                estimatedHeight={estimatedPageHeight}
                registerWrapper={registerWrapper}
                searchDomHint={
                  searchHitContext &&
                  searchHitContext.page === pageNumber &&
                  searchHitContext.query
                    ? {
                        query: searchHitContext.query,
                        ordinal: searchHitContext.ordinal,
                      }
                    : null
                }
                fallbackHighlightRectsPdf={
                  searchHitContext?.page === pageNumber
                    ? searchHitContext.fallback
                    : null
                }
              />
            );
          })}
        </Document>
      </div>
    </div>
  );
}
