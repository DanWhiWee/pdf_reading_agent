import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useLayoutEffect,
} from "react";
import { Page } from "react-pdf";
import type { PDFPageProxy } from "pdfjs-dist";
import { getPdfRenderDevicePixelRatio } from "../../utils/pdfDisplay";

export interface SearchDomHint {
  query: string;
  ordinal: number;
}

type TextSlice = { node: Text; start: number; len: number };

type DomBox = { left: number; top: number; width: number; height: number };

function buildTextSlices(layer: Element): { slices: TextSlice[]; full: string } {
  const spans = layer.querySelectorAll('span[role="presentation"]');
  const slices: TextSlice[] = [];
  let full = "";
  spans.forEach((sp) => {
    const tn = sp.firstChild;
    if (!tn || tn.nodeType !== Node.TEXT_NODE) return;
    const s = tn.textContent ?? "";
    slices.push({ node: tn as Text, start: full.length, len: s.length });
    full += s;
  });
  return { slices, full };
}

function offsetToBoundary(
  slices: TextSlice[],
  charOffset: number
): { node: Text; offset: number } | null {
  for (const p of slices) {
    const end = p.start + p.len;
    if (charOffset <= end) {
      return {
        node: p.node,
        offset: Math.min(p.len, Math.max(0, charOffset - p.start)),
      };
    }
  }
  return null;
}

/** PyMuPDF: top-left origin, y down. pdf.js: PDF user space, y up. Fallback only. */
function pymupdfSearchRectToPdfUserSpace(
  pdfPage: PDFPageProxy,
  r: number[]
): [number, number, number, number] {
  const [px0, py0, px1, py1] = r;
  const v = pdfPage.view;
  if (v.length < 4) return [px0, py0, px1, py1];
  const minX = v[0];
  const maxY = v[3];
  return [minX + px0, maxY - py1, minX + px1, maxY - py0];
}

function PageHighlightOverlays({
  page,
  scale,
  rectsPdf,
}: {
  page: PDFPageProxy;
  scale: number;
  rectsPdf: number[][];
}) {
  const rotate = page.rotate ?? 0;
  const viewport = page.getViewport({ scale, rotation: rotate });
  return (
    <div
      className="pdf-highlight-layer"
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: viewport.width,
        height: viewport.height,
        pointerEvents: "none",
        zIndex: 14,
      }}
    >
      {rectsPdf.map((r, i) => {
        if (r.length < 4) return null;
        const pdfUser = pymupdfSearchRectToPdfUserSpace(page, r);
        const [vx0, vy0, vx1, vy1] =
          viewport.convertToViewportRectangle(pdfUser);
        const left = Math.min(vx0, vx1);
        const top = Math.min(vy0, vy1);
        const w = Math.abs(vx1 - vx0);
        const h = Math.abs(vy1 - vy0);
        const vpArea = viewport.width * viewport.height;
        if (w < 6 || h < 6) return null;
        if (vpArea > 0 && w * h > 0.5 * vpArea) return null;
        return (
          <div
            key={i}
            className="pdf-hit-highlight"
            style={{
              position: "absolute",
              left,
              top,
              width: w,
              height: h,
              background: "rgba(255, 214, 10, 0.35)",
              border: "1px solid rgba(230, 162, 60, 0.9)",
              boxSizing: "border-box",
            }}
          />
        );
      })}
    </div>
  );
}

function DomSearchHighlights({
  innerRef,
  hint,
  textLayerGen,
  onDomBoxCount,
}: {
  innerRef: React.RefObject<HTMLDivElement | null>;
  hint: SearchDomHint | null;
  textLayerGen: number;
  onDomBoxCount?: (n: number) => void;
}) {
  const [boxes, setBoxes] = useState<DomBox[]>([]);
  const onDomBoxCountRef = useRef(onDomBoxCount);
  onDomBoxCountRef.current = onDomBoxCount;

  useLayoutEffect(() => {
    if (!hint?.query) {
      setBoxes([]);
      onDomBoxCountRef.current?.(0);
      return;
    }
    const wrap = innerRef.current;
    if (!wrap) {
      setBoxes([]);
      onDomBoxCountRef.current?.(0);
      return;
    }

    const report = (n: number, next: DomBox[]) => {
      setBoxes(next);
      onDomBoxCountRef.current?.(n);
    };

    const measure = () => {
      const layer = wrap.querySelector(".textLayer");
      if (!layer) {
        report(0, []);
        return;
      }
      const { slices, full } = buildTextSlices(layer);
      if (!slices.length || !full.length) {
        report(0, []);
        return;
      }
      const q = hint.query;
      const fl = full.toLowerCase();
      const ql = q.toLowerCase();
      let from = 0;
      let idx = -1;
      for (let k = 0; k <= hint.ordinal; k++) {
        idx = fl.indexOf(ql, from);
        if (idx < 0) {
          report(0, []);
          return;
        }
        from = idx + 1;
      }
      const end = idx + q.length;
      const startB = offsetToBoundary(slices, idx);
      const endB = offsetToBoundary(slices, end);
      if (!startB || !endB) {
        report(0, []);
        return;
      }
      const range = document.createRange();
      range.setStart(startB.node, startB.offset);
      range.setEnd(endB.node, endB.offset);
      const inner = wrap.getBoundingClientRect();
      const out: DomBox[] = [];
      for (const r of range.getClientRects()) {
        if (r.width < 1 && r.height < 1) continue;
        out.push({
          left: r.left - inner.left,
          top: r.top - inner.top,
          width: r.width,
          height: r.height,
        });
      }
      report(out.length, out);
    };

    const raf = requestAnimationFrame(measure);
    const t = window.setTimeout(measure, 80);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [hint, textLayerGen, innerRef]);

  if (!boxes.length) return null;

  return (
    <div
      className="pdf-highlight-layer pdf-dom-search-highlight-layer"
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        pointerEvents: "none",
        zIndex: 15,
      }}
    >
      {boxes.map((b, i) => (
        <div
          key={i}
          className="pdf-hit-highlight"
          style={{
            position: "absolute",
            left: b.left,
            top: b.top,
            width: b.width,
            height: b.height,
            background: "rgba(255, 214, 10, 0.4)",
            border: "1px solid rgba(230, 162, 60, 0.95)",
            boxSizing: "border-box",
          }}
        />
      ))}
    </div>
  );
}

interface Props {
  pageNumber: number;
  scale: number;
  eager: boolean;
  estimatedHeight: number;
  registerWrapper: (page: number, el: HTMLDivElement | null) => void;
  searchDomHint?: SearchDomHint | null;
  fallbackHighlightRectsPdf?: number[][] | null;
}

export default function LazyPdfPage({
  pageNumber,
  scale,
  eager,
  estimatedHeight,
  registerWrapper,
  searchDomHint,
  fallbackHighlightRectsPdf,
}: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [renderPage, setRenderPage] = useState(eager);
  const [pdfPage, setPdfPage] = useState<PDFPageProxy | null>(null);
  const [textLayerGen, setTextLayerGen] = useState(0);
  const [domBoxCount, setDomBoxCount] = useState(0);
  const [allowPymupdfFallback, setAllowPymupdfFallback] = useState(false);

  useEffect(() => {
    if (eager) setRenderPage(true);
  }, [eager]);

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

  useEffect(() => {
    if (!renderPage) setPdfPage(null);
  }, [pageNumber, renderPage]);

  const bumpTextLayer = useCallback(() => {
    setTextLayerGen((g) => g + 1);
  }, []);

  useEffect(() => {
    if (!searchDomHint?.query) {
      setAllowPymupdfFallback(false);
      return;
    }
    setAllowPymupdfFallback(false);
    const tid = window.setTimeout(() => setAllowPymupdfFallback(true), 200);
    return () => clearTimeout(tid);
  }, [
    searchDomHint?.query,
    searchDomHint?.ordinal,
    textLayerGen,
    pageNumber,
    scale,
  ]);

  const showFallback =
    allowPymupdfFallback &&
    domBoxCount === 0 &&
    Boolean(
      pdfPage &&
        fallbackHighlightRectsPdf?.length &&
        searchDomHint?.query
    );

  useEffect(() => {
    if (!searchDomHint?.query) return;
    if (domBoxCount === 0 && !showFallback) return;
    const scrollHitIntoView = () => {
      const inner = innerRef.current;
      if (!inner) return;
      const hit = inner.querySelector(".pdf-hit-highlight") as HTMLElement | null;
      if (!hit) return;
      hit.scrollIntoView({
        block: "center",
        behavior: "smooth",
        inline: "nearest",
      });
    };
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(scrollHitIntoView);
    });
    const t = window.setTimeout(scrollHitIntoView, 100);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [
    searchDomHint?.query,
    searchDomHint?.ordinal,
    domBoxCount,
    showFallback,
    textLayerGen,
  ]);

  return (
    <div ref={setWrapperRef} data-page={pageNumber} className="pdf-page-wrapper">
      {renderPage ? (
        <div className="pdf-page-inner" ref={innerRef}>
          <Page
            pageNumber={pageNumber}
            scale={scale}
            devicePixelRatio={getPdfRenderDevicePixelRatio()}
            canvasBackground="#faf9f7"
            renderTextLayer={true}
            renderAnnotationLayer={true}
            onLoadSuccess={(p) => setPdfPage(p as unknown as PDFPageProxy)}
            onRenderTextLayerSuccess={bumpTextLayer}
          />
          <DomSearchHighlights
            innerRef={innerRef}
            hint={searchDomHint ?? null}
            textLayerGen={textLayerGen}
            onDomBoxCount={setDomBoxCount}
          />
          {showFallback && pdfPage ? (
            <PageHighlightOverlays
              page={pdfPage}
              scale={scale}
              rectsPdf={fallbackHighlightRectsPdf!}
            />
          ) : null}
        </div>
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
