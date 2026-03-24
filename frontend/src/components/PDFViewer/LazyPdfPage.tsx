import { useEffect, useRef, useState, useCallback } from "react";
import { Page } from "react-pdf";

interface Props {
  pageNumber: number;
  scale: number;
  eager: boolean;
  estimatedHeight: number;
  registerWrapper: (page: number, el: HTMLDivElement | null) => void;
}

export default function LazyPdfPage({
  pageNumber,
  scale,
  eager,
  estimatedHeight,
  registerWrapper,
}: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [renderPage, setRenderPage] = useState(eager);

  useEffect(() => {
    if (eager || renderPage) return;
    const el = wrapRef.current;
    if (!el) return;
    const root = el.closest(".pdf-content");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setRenderPage(true);
      },
      { root: root instanceof Element ? root : null, rootMargin: "280px", threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [eager, renderPage]);

  const setWrapperRef = useCallback(
    (node: HTMLDivElement | null) => {
      wrapRef.current = node;
      registerWrapper(pageNumber, node);
    },
    [pageNumber, registerWrapper]
  );

  return (
    <div ref={setWrapperRef} data-page={pageNumber} className="pdf-page-wrapper">
      {renderPage ? (
        <Page
          pageNumber={pageNumber}
          scale={scale}
          renderTextLayer={true}
          renderAnnotationLayer={true}
        />
      ) : (
        <div
          className="pdf-page-placeholder"
          style={{ minHeight: Math.max(estimatedHeight, 120) }}
        />
      )}
      <div className="page-number-label">Page {pageNumber}</div>
    </div>
  );
}
