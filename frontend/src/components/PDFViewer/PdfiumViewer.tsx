import {
  useEffect,
  useRef,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Button } from "antd";
import { MessageOutlined } from "@ant-design/icons";
import { createPluginRegistration } from "@embedpdf/core";
import { EmbedPDF } from "@embedpdf/core/react";
import { usePdfiumEngine } from "@embedpdf/engines/react";
import {
  Viewport,
  ViewportPluginPackage,
} from "@embedpdf/plugin-viewport/react";
import {
  Scroller,
  ScrollPluginPackage,
  useScroll,
} from "@embedpdf/plugin-scroll/react";
import {
  DocumentContent,
  DocumentManagerPluginPackage,
  useDocumentManagerCapability,
} from "@embedpdf/plugin-document-manager/react";
import {
  RenderLayer,
  RenderPluginPackage,
} from "@embedpdf/plugin-render/react";
import { SearchLayer, useSearch } from "@embedpdf/plugin-search/react";
import { SearchPluginPackage } from "@embedpdf/plugin-search";
import {
  SelectionLayer,
  useSelectionCapability,
} from "@embedpdf/plugin-selection/react";
import { SelectionPluginPackage } from "@embedpdf/plugin-selection/react";
import { InteractionManagerPluginPackage } from "@embedpdf/plugin-interaction-manager";
import { PagePointerProvider } from "@embedpdf/plugin-interaction-manager/react";
import { ZoomPluginPackage, ZoomMode } from "@embedpdf/plugin-zoom";
import { useZoom } from "@embedpdf/plugin-zoom/react";
import { HistoryPluginPackage } from "@embedpdf/plugin-history";
import { AnnotationPluginPackage } from "@embedpdf/plugin-annotation";
import type { AnnotationTransferItem } from "@embedpdf/plugin-annotation";
import {
  AnnotationLayer,
  useAnnotation,
  useAnnotationCapability,
} from "@embedpdf/plugin-annotation/react";
import { ExportPluginPackage } from "@embedpdf/plugin-export";
import { useExportCapability } from "@embedpdf/plugin-export/react";
import { useHistoryCapability } from "@embedpdf/plugin-history/react";
import { ignore, type SearchResult } from "@embedpdf/models";
import type { SelectionMenuPropsBase } from "@embedpdf/utils/react";
import type { SelectionSelectionContext } from "@embedpdf/plugin-selection/react";
import { Spin } from "antd";

import { useAppStore } from "../../stores/appStore";
import {
  fetchPdfAnnotations,
  savePdfAnnotations,
  savePdfAnnotationsKeepalive,
  fetchDocLinks,
  type PdfLink,
} from "../../services/api";
import type { SearchHit } from "../../types";

/** 避免小数 DPR（如 1.25）或异常值导致位图欠采样发糊；上限控制性能 */
function clampRenderDpr(): number {
  if (typeof window === "undefined") return 1;
  const raw = window.devicePixelRatio || 1;
  return Math.min(Math.max(Math.ceil(raw), 1), 3);
}

function useRenderDpr(): number {
  const [dpr, setDpr] = useState(clampRenderDpr);
  const sync = useCallback(() => setDpr(clampRenderDpr()), []);
  useEffect(() => {
    sync();
    window.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("resize", sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("resize", sync);
    };
  }, [sync]);
  return dpr;
}

function mapSearchResultsToHits(results: SearchResult[]): SearchHit[] {
  return results.map((r) => {
    const text =
      `${r.context.before}${r.context.match}${r.context.after}`.trim() ||
      r.context.match;
    let rect: number[] | null = null;
    const b = r.rects?.[0];
    if (b) {
      rect = [
        b.origin.x,
        b.origin.y,
        b.origin.x + b.size.width,
        b.origin.y + b.size.height,
      ];
    }
    return { page: r.pageIndex + 1, rect, text };
  });
}

const plugins = [
  createPluginRegistration(DocumentManagerPluginPackage, {}),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage),
  createPluginRegistration(RenderPluginPackage),
  createPluginRegistration(InteractionManagerPluginPackage),
  createPluginRegistration(SearchPluginPackage, { showAllResults: true }),
  createPluginRegistration(SelectionPluginPackage, {
    /** 与自定义菜单实际高度接近，供插件在 head/tail 间选锚点 */
    menuHeight: 44,
    minSelectionDragDistance: 2,
    /** 与文本选区同时启用时，拖动会出现虚线框虚影，此处关闭框选 */
    marquee: { enabled: false },
  }),
  createPluginRegistration(HistoryPluginPackage, {}),
  createPluginRegistration(AnnotationPluginPackage, {
    annotationAuthor: "Reader",
    deactivateToolAfterCreate: false,
  }),
  createPluginRegistration(ExportPluginPackage, {
    defaultFileName: "document.pdf",
  }),
  createPluginRegistration(ZoomPluginPackage, {
    defaultZoomLevel: ZoomMode.FitWidth,
  }),
];

export type AnnotationToolMode = "highlight" | "underline" | null;

export type PdfiumViewerHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
  fitWidth: () => void;
  zoom100: () => void;
  /** 按百分比设置缩放，如 125 → 1.25 */
  setZoomPercent: (percent: number) => void;
  search: (query: string) => void;
  searchNext: () => void;
  searchPrev: () => void;
  clearSearch: () => void;
  setAnnotationTool: (tool: AnnotationToolMode) => void;
  annotationUndo: () => void;
  annotationRedo: () => void;
  downloadAnnotatedPdf: () => void;
  deleteSelectedAnnotations: () => void;
};

export type AnnotationToolbarUiState = {
  canUndo: boolean;
  canRedo: boolean;
  activeToolId: string | null;
  selectedAnnotationCount: number;
};

const noop = () => {};

function EmbedDocLoadedFlag({
  isLoaded,
  onLoaded,
}: {
  isLoaded: boolean;
  onLoaded: (v: boolean) => void;
}) {
  useEffect(() => {
    onLoaded(isLoaded);
  }, [isLoaded, onLoaded]);
  return null;
}

type SelectionAskMenuProps = SelectionMenuPropsBase<SelectionSelectionContext> & {
  documentId: string;
};

/** 跟随选区几何，锚在选中文本块顶边上方（与 EmbedPDF CounterRotate 局部坐标一致） */
function SelectionAskFloatingMenu({
  documentId,
  menuWrapperProps,
  context,
}: SelectionAskMenuProps) {
  const setSelectedText = useAppStore((s) => s.setSelectedText);
  const { provides: selCap } = useSelectionCapability();

  const handleAsk = () => {
    const scope = selCap?.forDocument(documentId);
    if (!scope) return;
    scope.getSelectedText().wait(
      (texts) => {
        const t = texts.join("\n").trim();
        if (!t) return;
        const sel = scope.getState().selection;
        const page =
          sel != null
            ? Math.min(sel.start.page, sel.end.page) + 1
            : context.pageIndex + 1;
        setSelectedText(t, page);
      },
      ignore,
    );
  };

  return (
    <div ref={menuWrapperProps.ref} style={menuWrapperProps.style}>
      <div className="pdfium-selection-ask-anchor">
        <Button
          type="primary"
          size="small"
          icon={<MessageOutlined />}
          className="pdfium-selection-ask-btn"
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={handleAsk}
        >
          用选中文本提问
        </Button>
      </div>
    </div>
  );
}

function resolvePdfFetchUrl(fileUrl: string): string {
  if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
    return fileUrl;
  }
  const path = fileUrl.startsWith("/") ? fileUrl : `/${fileUrl}`;
  return `${window.location.origin}${path}`;
}

function pdfDisplayName(stem: string): string {
  const s = stem?.trim() || "document";
  return /\.pdf$/i.test(s) ? s : `${s}.pdf`;
}

/**
 * 使用页面主线程 fetch 完整 PDF 再以 buffer 打开，避免 openDocumentUrl 在部分环境下
 * 对相对路径 / 代理响应解析异常；切换文档时先 closeAll，防止 EmbedPDF 内部多文档状态错乱。
 */
function DocumentLoader({
  fileUrl,
  displayName,
  onLoadError,
}: {
  fileUrl: string;
  displayName: string;
  onLoadError?: (msg: string) => void;
}) {
  const { provides: docManager } = useDocumentManagerCapability();

  useEffect(() => {
    if (!docManager || !fileUrl) return;
    let cancelled = false;
    const absUrl = resolvePdfFetchUrl(fileUrl);
    const name = pdfDisplayName(displayName);

    docManager.closeAllDocuments().wait(
      () => {
        if (cancelled) return;
        void (async () => {
          try {
            // 必须绕过 HTTP 磁盘缓存：后端对 /file 曾返回长缓存 + ETag，再次请求易为 304 且无 body，
            // fetch().arrayBuffer() 会得到空，表现为「响应体过短」。
            const res = await fetch(absUrl, {
              cache: "no-store",
              headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
            });
            if (cancelled) return;
            if (res.status === 304) {
              throw new Error(
                "收到 HTTP 304 且无正文（缓存协商异常）。请硬刷新页面；若仍出现请反馈。",
              );
            }
            if (!res.ok) {
              const hint = await res.text().catch(() => "");
              throw new Error(
                `获取 PDF 失败 (HTTP ${res.status})` +
                  (hint ? `：${hint.slice(0, 160)}` : ` ${res.statusText}`),
              );
            }
            const buf = await res.arrayBuffer();
            if (cancelled) return;
            if (buf.byteLength < 8) {
              throw new Error(
                `PDF 数据过短（HTTP ${res.status}，${buf.byteLength} 字节）。请确认直连 ` +
                  `${absUrl} 能下载完整 PDF，或检查代理是否改写响应。`,
              );
            }
            docManager.openDocumentBuffer({
              buffer: buf,
              name,
              autoActivate: true,
            }).wait(
              () => {},
              (err) => {
                if (cancelled) return;
                const msg =
                  err && typeof err === "object" && "message" in err
                    ? String((err as { message?: string }).message)
                    : String(err);
                console.error("PDFium openDocumentBuffer failed:", err);
                onLoadError?.(
                  msg ||
                    "PDF 无法在浏览器引擎中打开（加密或 PDFium 不支持的特性时，其它阅读器仍可能能打开）",
                );
              },
            );
          } catch (e) {
            if (cancelled) return;
            const msg = e instanceof Error ? e.message : String(e);
            console.error("PDF fetch / open failed:", e);
            onLoadError?.(msg);
          }
        })();
      },
      ignore,
    );

    return () => {
      cancelled = true;
    };
  }, [docManager, fileUrl, displayName, onLoadError]);

  return null;
}

function ViewerContent({
  documentId,
  appDocId,
  exportFileStem,
  renderDpr,
  readerViewportBg,
  pageFilter,
  onPageChange,
  onDocReady,
  navPage,
  navNonce,
  onZoomLevel,
  onAnnotationUiChange,
  viewerHandleRef,
}: {
  documentId: string;
  appDocId: string;
  exportFileStem: string;
  renderDpr: number;
  readerViewportBg: string;
  pageFilter?: string;
  onPageChange?: (page: number) => void;
  onDocReady?: (numPages: number) => void;
  navPage?: number | null;
  navNonce?: number | null;
  onZoomLevel?: (scale: number) => void;
  onAnnotationUiChange?: (s: AnnotationToolbarUiState) => void;
  viewerHandleRef: React.MutableRefObject<PdfiumViewerHandle>;
}) {
  const scrollHook = useScroll(documentId);
  const { provides: zoom, state: zoomState } = useZoom(documentId);
  const { state: annDocState } = useAnnotation(documentId);
  const { provides: search } = useSearch(documentId);
  const { provides: annCap } = useAnnotationCapability();
  const { provides: histCap } = useHistoryCapability();
  const { provides: exportCap } = useExportCapability();
  const reportedPages = useRef(0);
  const zoomUserAdjustedRef = useRef(false);
  const initialFitAppliedForDocRef = useRef<string | null>(null);
  const lastEmittedZoomRef = useRef<number | null>(null);
  const lastEmittedPageRef = useRef<number | null>(null);
  const [embedDocLoaded, setEmbedDocLoaded] = useState(false);
  const [pageLinksMap, setPageLinksMap] = useState<Map<number, PdfLink[]>>(new Map());
  const hydratingRef = useRef(false);
  const saveEnabledRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistAnnotationsRef = useRef<() => void>(() => {});
  const onAnnotationUiChangeRef = useRef(onAnnotationUiChange);
  onAnnotationUiChangeRef.current = onAnnotationUiChange;

  const emitAnnotUi = useCallback(() => {
    const cb = onAnnotationUiChangeRef.current;
    if (!cb || !documentId) return;
    const h = histCap?.forDocument(documentId);
    const a = annCap?.forDocument(documentId);
    cb({
      canUndo: h?.canUndo() ?? false,
      canRedo: h?.canRedo() ?? false,
      activeToolId: a?.getActiveTool()?.id ?? null,
      selectedAnnotationCount: annDocState.selectedUids.length,
    });
  }, [documentId, histCap, annCap, annDocState.selectedUids]);

  useEffect(() => {
    lastEmittedPageRef.current = null;
    lastEmittedZoomRef.current = null;
    setEmbedDocLoaded(false);
    saveEnabledRef.current = false;
    hydratingRef.current = false;
    zoomUserAdjustedRef.current = false;
    initialFitAppliedForDocRef.current = null;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, [documentId]);

  const setEmbedLoadedStable = useCallback((v: boolean) => {
    setEmbedDocLoaded(v);
  }, []);

  useEffect(() => {
    const z = zoomState?.currentZoomLevel;
    if (z == null) return;
    const prev = lastEmittedZoomRef.current;
    if (prev != null && Math.abs(z - prev) < 0.002) return;
    lastEmittedZoomRef.current = z;
    onZoomLevel?.(z);
  }, [zoomState?.currentZoomLevel, onZoomLevel]);

  /** 打开文档后默认适应宽度；用户未手动改缩放时，窗口变化也重新适应宽度（接近 Chrome PDF） */
  useEffect(() => {
    const total = scrollHook?.state?.totalPages;
    if (!embedDocLoaded || !total || total < 1 || !zoom) return;
    if (initialFitAppliedForDocRef.current === documentId) return;
    if (zoomUserAdjustedRef.current) return;
    initialFitAppliedForDocRef.current = documentId;
    zoom.requestZoom(ZoomMode.FitWidth);
  }, [embedDocLoaded, scrollHook?.state?.totalPages, zoom, documentId]);

  useEffect(() => {
    if (!zoom) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (zoomUserAdjustedRef.current) return;
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        zoom.requestZoom(ZoomMode.FitWidth);
      }, 120);
    };
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    return () => {
      if (t) clearTimeout(t);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
    };
  }, [zoom]);

  /** 滚轮/触控板等改为具体倍率时，视为用户手动缩放，避免 resize 再强制适应宽度 */
  useEffect(() => {
    if (!zoom) return;
    const unsub = zoom.onZoomChange((ev) => {
      if (typeof ev.level === "number") {
        zoomUserAdjustedRef.current = true;
      }
    });
    return () => unsub();
  }, [zoom]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const el = e.target as HTMLElement | null;
      if (
        el?.closest(
          "input, textarea, [contenteditable=true], .ant-input, .ant-input-number",
        )
      ) {
        return;
      }
      const scope = annCap?.forDocument(documentId);
      if (!scope) return;
      const sel = scope.getSelectedAnnotations();
      if (sel.length === 0) return;
      e.preventDefault();
      scope.deleteAnnotations(
        sel.map((ta) => ({
          pageIndex: ta.object.pageIndex,
          id: ta.object.id,
        })),
      );
      emitAnnotUi();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [annCap, documentId, emitAnnotUi]);

  useEffect(() => {
    if (!embedDocLoaded || !appDocId || !annCap) return;
    /** 与拉取服务端标注并行：避免「未返回 JSON 前用户已标高亮」导致永远不保存 */
    saveEnabledRef.current = true;
    // Load PDF internal links for click-through navigation hotspots
    void fetchDocLinks(appDocId).then((links) => {
      const m = new Map<number, PdfLink[]>();
      for (const lk of links) {
        const arr = m.get(lk.page) ?? [];
        arr.push(lk);
        m.set(lk.page, arr);
      }
      setPageLinksMap(m);
    });
    let cancelled = false;
    const scope = annCap.forDocument(documentId);
    void fetchPdfAnnotations(appDocId).then((items) => {
      if (cancelled) return;
      if (items.length > 0) {
        hydratingRef.current = true;
        scope.importAnnotations(items as AnnotationTransferItem[]);
        window.requestAnimationFrame(() => {
          window.setTimeout(() => {
            hydratingRef.current = false;
          }, 200);
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [embedDocLoaded, documentId, appDocId, annCap]);

  useEffect(() => {
    if (!documentId || !appDocId || !annCap) return;
    const scope = annCap.forDocument(documentId);
    const scheduleSave = () => {
      if (!saveEnabledRef.current || hydratingRef.current) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        scope.exportAnnotations().wait(
          (items) => {
            void savePdfAnnotations(appDocId, items as unknown[]).catch(
              (e) => console.error("savePdfAnnotations", e),
            );
          },
          ignore,
        );
      }, 200);
    };
    persistAnnotationsRef.current = () => {
      if (!saveEnabledRef.current || hydratingRef.current) return;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      scope.exportAnnotations().wait(
        (items) => {
          savePdfAnnotationsKeepalive(appDocId, items as unknown[]);
        },
        ignore,
      );
    };
    const unsub = annCap.onAnnotationEvent((ev) => {
      if (ev.documentId !== documentId) return;
      if (!saveEnabledRef.current || hydratingRef.current) return;
      if (ev.type === "loaded") return;
      if (!ev.committed) return;
      scheduleSave();
    });
    return () => {
      unsub();
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [documentId, appDocId, annCap]);

  useEffect(() => {
    const flush = () => persistAnnotationsRef.current();
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
    };
  }, []);

  useEffect(() => {
    if (!documentId || !histCap) return;
    const h = histCap.forDocument(documentId);
    const off = h.onHistoryChange(() => emitAnnotUi());
    emitAnnotUi();
    return () => off();
  }, [documentId, histCap, emitAnnotUi]);

  useEffect(() => {
    if (!documentId || !annCap) return;
    const a = annCap.forDocument(documentId);
    // Reset annotation tool on every doc load so clicks are normal Browse mode.
    a.setActiveTool(null);
    const off = a.onActiveToolChange(() => emitAnnotUi());
    emitAnnotUi();
    return () => off();
  }, [documentId, annCap, emitAnnotUi]);

  useEffect(() => {
    viewerHandleRef.current = {
      zoomIn: () => {
        zoomUserAdjustedRef.current = true;
        zoom?.zoomIn();
      },
      zoomOut: () => {
        zoomUserAdjustedRef.current = true;
        zoom?.zoomOut();
      },
      fitWidth: () => {
        zoomUserAdjustedRef.current = false;
        zoom?.requestZoom(ZoomMode.FitWidth);
      },
      zoom100: () => {
        zoomUserAdjustedRef.current = true;
        zoom?.requestZoom(1);
      },
      setZoomPercent: (percent: number) => {
        zoomUserAdjustedRef.current = true;
        if (!zoom || !Number.isFinite(percent)) return;
        const z = Math.min(5, Math.max(0.1, percent / 100));
        zoom.requestZoom(z);
      },
      search: (query: string) => {
        const q = query.trim();
        if (!search || !q) return;
        search.searchAllPages(q).wait(
          (res) => {
            const hits = mapSearchResultsToHits(res.results);
            useAppStore.getState().setPdfSearchResults(hits, q, 0);
          },
          ignore,
        );
      },
      searchNext: () => {
        if (!search) return;
        const i = search.nextResult();
        useAppStore.getState().setPdfSearchIndex(i);
      },
      searchPrev: () => {
        if (!search) return;
        const i = search.previousResult();
        useAppStore.getState().setPdfSearchIndex(i);
      },
      clearSearch: () => {
        search?.stopSearch();
        useAppStore.getState().clearPdfSearch();
      },
      setAnnotationTool: (tool) => {
        annCap?.forDocument(documentId).setActiveTool(tool);
        emitAnnotUi();
      },
      annotationUndo: () => {
        histCap?.forDocument(documentId).undo();
        emitAnnotUi();
      },
      annotationRedo: () => {
        histCap?.forDocument(documentId).redo();
        emitAnnotUi();
      },
      downloadAnnotatedPdf: () => {
        const ex = exportCap?.forDocument(documentId);
        if (!ex) return;
        const stem = (exportFileStem || "document").replace(/\.pdf$/i, "");
        ex.saveAsCopy().wait(
          (buf) => {
            const blob = new Blob([buf], { type: "application/pdf" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${stem}-annotated.pdf`;
            a.click();
            URL.revokeObjectURL(url);
          },
          ignore,
        );
      },
      deleteSelectedAnnotations: () => {
        const scope = annCap?.forDocument(documentId);
        if (!scope) return;
        const sel = scope.getSelectedAnnotations();
        if (sel.length === 0) return;
        scope.deleteAnnotations(
          sel.map((ta) => ({
            pageIndex: ta.object.pageIndex,
            id: ta.object.id,
          })),
        );
        emitAnnotUi();
      },
    };
  }, [
    zoom,
    search,
    annCap,
    histCap,
    exportCap,
    documentId,
    exportFileStem,
    emitAnnotUi,
    viewerHandleRef,
  ]);

  useEffect(() => {
    if (!scrollHook?.state) return;
    const { currentPage } = scrollHook.state;
    if (currentPage == null) return;
    const page1 = currentPage + 1;
    if (lastEmittedPageRef.current === page1) return;
    lastEmittedPageRef.current = page1;
    onPageChange?.(page1);
  }, [scrollHook?.state?.currentPage, onPageChange]);

  useEffect(() => {
    const total = scrollHook?.state?.totalPages;
    if (total && total > 0 && total !== reportedPages.current) {
      reportedPages.current = total;
      onDocReady?.(total);
    }
  }, [scrollHook?.state?.totalPages, onDocReady]);

  // Track last-consumed nonce to prevent re-scrolling when scrollHook.provides
  // object identity changes during normal scroll re-renders.
  const lastNavNonceRef = useRef<number | null>(null);
  useEffect(() => {
    if (navPage == null || navPage <= 0 || !scrollHook?.provides) return;
    if (navNonce == null || lastNavNonceRef.current === navNonce) return;
    lastNavNonceRef.current = navNonce;
    scrollHook.provides.scrollToPage({ pageNumber: navPage - 1 });
  }, [navPage, navNonce, scrollHook?.provides]);

  const navigatePdf = useAppStore((s) => s.navigatePdf);

  const renderSelectionAskMenu = useCallback(
    (props: SelectionMenuPropsBase<SelectionSelectionContext>) => (
      <SelectionAskFloatingMenu documentId={documentId} {...props} />
    ),
    [documentId],
  );

  return (
    <DocumentContent documentId={documentId}>
      {({ isLoading, isError, isLoaded }) => (
        <>
          <EmbedDocLoadedFlag
            isLoaded={isLoaded}
            onLoaded={setEmbedLoadedStable}
          />
          {isLoading && (
            <div className="pdfium-loading">
              <Spin size="large" />
            </div>
          )}
          {isError && (
            <div className="pdfium-error">文档加载失败</div>
          )}
          {isLoaded && (
            <Viewport
              documentId={documentId}
              style={{
                backgroundColor: readerViewportBg,
                height: "100%",
              }}
            >
              <Scroller
                documentId={documentId}
                renderPage={({ width, height, pageIndex }) => {
                  const pageNum = pageIndex + 1;
                  const links = pageLinksMap.get(pageNum) ?? [];
                  return (
                  <PagePointerProvider
                    documentId={documentId}
                    pageIndex={pageIndex}
                    style={{ width, height }}
                  >
                    <div
                      style={pageFilter && pageFilter !== "none"
                        ? { position: "absolute", inset: 0, filter: pageFilter }
                        : { position: "absolute", inset: 0 }}
                    >
                      <RenderLayer
                        documentId={documentId}
                        pageIndex={pageIndex}
                        dpr={renderDpr}
                        draggable={false}
                      />
                    </div>
                    <SearchLayer documentId={documentId} pageIndex={pageIndex} />
                    <SelectionLayer
                      documentId={documentId}
                      pageIndex={pageIndex}
                      textStyle={{ background: "rgba(22, 119, 255, 0.28)" }}
                      selectionMenu={renderSelectionAskMenu}
                    />
                    <AnnotationLayer documentId={documentId} pageIndex={pageIndex} />
                    {/* Transparent hotspots for PDF internal GoTo links */}
                    {links.map((lk, i) => (
                      <div
                        key={i}
                        style={{
                          position: "absolute",
                          left: `${lk.rect[0] * 100}%`,
                          top: `${lk.rect[1] * 100}%`,
                          width: `${(lk.rect[2] - lk.rect[0]) * 100}%`,
                          height: `${(lk.rect[3] - lk.rect[1]) * 100}%`,
                          cursor: "pointer",
                          zIndex: 10,
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigatePdf({ page: lk.dest_page });
                        }}
                      />
                    ))}
                  </PagePointerProvider>
                  );
                }}
              />
            </Viewport>
          )}
        </>
      )}
    </DocumentContent>
  );
}

type Props = {
  fileUrl: string;
  /** 后端文档 id，用于标注 JSON 存取 */
  appDocId: string;
  /** 导出带标注 PDF 时的文件名前缀（不含 -annotated.pdf） */
  exportFileStem: string;
  /** 视口页间背景色，与阅读主题一致 */
  readerViewportBg?: string;
  /** PDF 页面 canvas 的 CSS filter，随阅读主题染色 */
  pageFilter?: string;
  onPageChange?: (page: number) => void;
  onDocReady?: (numPages: number) => void;
  onLoadError?: (msg: string) => void;
  onZoomLevel?: (scale: number) => void;
  navPage?: number | null;
  navNonce?: number | null;
  onAnnotationUiChange?: (s: AnnotationToolbarUiState) => void;
};

const PdfiumViewer = forwardRef<PdfiumViewerHandle, Props>(
  function PdfiumViewer(
    {
      fileUrl,
      appDocId,
      exportFileStem,
      readerViewportBg = "#f1f3f5",
      pageFilter = "none",
      onPageChange,
      onDocReady,
      onLoadError,
      onZoomLevel,
      navPage,
      navNonce,
      onAnnotationUiChange,
    },
    ref,
  ) {
    const { engine, isLoading, error } = usePdfiumEngine();
    const renderDpr = useRenderDpr();
    const viewerHandleRef = useRef<PdfiumViewerHandle>({
      zoomIn: noop,
      zoomOut: noop,
      fitWidth: noop,
      zoom100: noop,
      setZoomPercent: noop,
      search: noop,
      searchNext: noop,
      searchPrev: noop,
      clearSearch: noop,
      setAnnotationTool: (_t: AnnotationToolMode) => {},
      annotationUndo: noop,
      annotationRedo: noop,
      downloadAnnotatedPdf: noop,
      deleteSelectedAnnotations: noop,
    });

    useImperativeHandle(
      ref,
      () => ({
        zoomIn: () => viewerHandleRef.current.zoomIn(),
        zoomOut: () => viewerHandleRef.current.zoomOut(),
        fitWidth: () => viewerHandleRef.current.fitWidth(),
        zoom100: () => viewerHandleRef.current.zoom100(),
        setZoomPercent: (p) => viewerHandleRef.current.setZoomPercent(p),
        search: (q) => viewerHandleRef.current.search(q),
        searchNext: () => viewerHandleRef.current.searchNext(),
        searchPrev: () => viewerHandleRef.current.searchPrev(),
        clearSearch: () => viewerHandleRef.current.clearSearch(),
        setAnnotationTool: (t) =>
          viewerHandleRef.current.setAnnotationTool(t),
        annotationUndo: () => viewerHandleRef.current.annotationUndo(),
        annotationRedo: () => viewerHandleRef.current.annotationRedo(),
        downloadAnnotatedPdf: () =>
          viewerHandleRef.current.downloadAnnotatedPdf(),
        deleteSelectedAnnotations: () =>
          viewerHandleRef.current.deleteSelectedAnnotations(),
      }),
      [],
    );

    useEffect(() => {
      if (error) onLoadError?.(error.message ?? "PDFium engine failed to load");
    }, [error, onLoadError]);

    if (isLoading || !engine) {
      return (
        <div className="pdfium-loading">
          <Spin size="large" tip="初始化 PDF 引擎...">
            <div className="pdfium-spin-placeholder" />
          </Spin>
        </div>
      );
    }

    return (
      <div
        className="pdfium-viewer-root"
        style={{ "--page-filter": pageFilter } as React.CSSProperties}
      >
        <EmbedPDF engine={engine} plugins={plugins}>
          {({ activeDocumentId }) => (
            <>
              <DocumentLoader
                fileUrl={fileUrl}
                displayName={exportFileStem || "document"}
                onLoadError={onLoadError}
              />
              {activeDocumentId ? (
                <ViewerContent
                  documentId={activeDocumentId}
                  appDocId={appDocId}
                  exportFileStem={exportFileStem}
                  renderDpr={renderDpr}
                  readerViewportBg={readerViewportBg}
                  pageFilter={pageFilter}
                  onPageChange={onPageChange}
                  onDocReady={onDocReady}
                  navPage={navPage}
                  navNonce={navNonce}
                  onZoomLevel={onZoomLevel}
                  onAnnotationUiChange={onAnnotationUiChange}
                  viewerHandleRef={viewerHandleRef}
                />
              ) : (
                <div className="pdfium-loading">
                  <Spin size="large" tip="加载文档中...">
                    <div className="pdfium-spin-placeholder" />
                  </Spin>
                </div>
              )}
            </>
          )}
        </EmbedPDF>
      </div>
    );
  },
);

export default PdfiumViewer;
