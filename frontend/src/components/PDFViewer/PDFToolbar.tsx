import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Input,
  InputNumber,
  Select,
  Space,
  Tooltip,
  Upload,
  message,
} from "antd";
import {
  ZoomInOutlined,
  ZoomOutOutlined,
  ExpandOutlined,
  ColumnWidthOutlined,
  UploadOutlined,
  FileTextOutlined,
  SearchOutlined,
  UpOutlined,
  BgColorsOutlined,
  UnderlineOutlined,
  UndoOutlined,
  RedoOutlined,
  DownloadOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { uploadPDF, searchPDF } from "../../services/api";
import type { AnnotationToolMode } from "./PdfiumViewer";
import { useAppStore } from "../../stores/appStore";
import type { ReaderBackgroundId } from "../../constants/readerTheme";
import { READER_THEME_OPTIONS } from "../../constants/readerTheme";
import { waitForRagIndex } from "../../utils/ragPoll";

const SEARCH_MAX_HITS = 200;
const SEARCH_BAR_KEY = "pdf-reading-agent-search-bar-open";

function readSearchBarExpanded(): boolean {
  if (typeof sessionStorage === "undefined") return true;
  const v = sessionStorage.getItem(SEARCH_BAR_KEY);
  if (v === null) return true;
  return v !== "0";
}

interface Props {
  currentPage: number;
  numPages: number;
  scale: number;
  onPageChange: (page: number) => void;
  /** 未使用 Pdfium 引擎时：按倍率缩放（如 pdf.js） */
  onScaleChange?: (scale: number) => void;
  onFitWidth?: () => void;
  /** Pdfium：缩放由引擎处理 */
  embedZoom?: {
    onIn: () => void;
    onOut: () => void;
    onFitWidth: () => void;
    on100: () => void;
    /** 25–500，表示百分比 */
    onSetZoomPercent: (percent: number) => void;
  };
  /** Pdfium：文档内搜索由 @embedpdf/plugin-search 处理 */
  embedSearch?: {
    run: (q: string) => void;
    next: () => void;
    prev: () => void;
    clear: () => void;
  };
  /** Pdfium：高亮/下划线标注（不含手写） */
  embedAnnotations?: {
    activeToolId: string | null;
    canUndo: boolean;
    canRedo: boolean;
    selectedAnnotationCount: number;
    setTool: (tool: AnnotationToolMode) => void;
    undo: () => void;
    redo: () => void;
    exportPdf: () => void;
    deleteSelected: () => void;
  };
}

export default function PDFToolbar({
  currentPage,
  numPages,
  scale,
  onPageChange,
  onScaleChange,
  onFitWidth,
  embedZoom,
  embedSearch,
  embedAnnotations,
}: Props) {
  const browserZoomHint =
    typeof window !== "undefined"
      ? Math.round((window.devicePixelRatio || 1) * 100)
      : 100;
  const {
    currentDocId,
    currentDocMeta,
    readerBackground,
    setReaderBackground,
    setCurrentDoc,
    clearDoc,
    pdfSearch,
    setPdfSearchResults,
    clearPdfSearch,
    pdfSearchNext,
    pdfSearchPrev,
  } = useAppStore();
  const [searchQ, setSearchQ] = useState("");
  const [searchExpanded, setSearchExpanded] = useState(readSearchBarExpanded);
  const roundedZoomPct = Math.round(scale * 100);
  const [zoomPctDraft, setZoomPctDraft] = useState(roundedZoomPct);
  useEffect(() => {
    setZoomPctDraft(roundedZoomPct);
  }, [roundedZoomPct]);

  const commitEmbedZoomPct = useCallback(() => {
    if (!embedZoom?.onSetZoomPercent) return;
    const raw = Number(zoomPctDraft);
    if (!Number.isFinite(raw)) return;
    const v = Math.min(500, Math.max(25, Math.round(raw)));
    embedZoom.onSetZoomPercent(v);
  }, [embedZoom, zoomPctDraft]);

  const commitLegacyZoomPct = useCallback(() => {
    if (!onScaleChange) return;
    const raw = Number(zoomPctDraft);
    if (!Number.isFinite(raw)) return;
    const v = Math.min(500, Math.max(25, Math.round(raw)));
    onScaleChange(v / 100);
  }, [onScaleChange, zoomPctDraft]);

  const persistSearchExpanded = useCallback((open: boolean) => {
    setSearchExpanded(open);
    try {
      sessionStorage.setItem(SEARCH_BAR_KEY, open ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const afterUpload = (docId: string) => {
    const hide = message.loading("正在建立语义索引…", 0);
    void waitForRagIndex(docId).then((ok) => {
      hide();
      if (ok) {
        message.success("语义索引已就绪（对话使用检索增强）", 2);
      } else {
        message.warning("语义索引未完成，对话将使用全文摘录", 5);
      }
    });
  };

  const handleUpload = async (file: File) => {
    try {
      clearDoc();
      const meta = await uploadPDF(file);
      setCurrentDoc(meta.id, meta);
      message.success(`已加载：${meta.filename}`);
      afterUpload(meta.id);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      message.error(msg);
    }
    return false;
  };

  const runSearch = async () => {
    if (!currentDocId || !searchQ.trim()) {
      if (embedSearch) embedSearch.clear();
      else clearPdfSearch();
      return;
    }
    if (embedSearch) {
      const q = searchQ.trim();
      const ps = useAppStore.getState().pdfSearch;
      if (ps?.hits.length && ps.query === q) {
        embedSearch.next();
        return;
      }
      embedSearch.run(q);
      persistSearchExpanded(true);
      return;
    }
    try {
      const data = await searchPDF(currentDocId, searchQ.trim());
      const hits = data.results.slice(0, SEARCH_MAX_HITS);
      if (hits.length === 0) {
        clearPdfSearch();
        message.info("未找到匹配文本");
        return;
      }
      setPdfSearchResults(hits, searchQ.trim(), 0);
      persistSearchExpanded(true);
    } catch {
      message.error("搜索失败");
    }
  };

  const onSearchPressEnter = () => {
    const q = searchQ.trim();
    if (!q || !currentDocId) return;
    const ps = useAppStore.getState().pdfSearch;
    if (ps?.hits.length && ps.query === q) {
      if (embedSearch) embedSearch.next();
      else pdfSearchNext();
      return;
    }
    void runSearch();
  };

  const hitCount = pdfSearch?.hits.length ?? 0;
  const hitIndex = pdfSearch?.index ?? 0;
  const matchLabel =
    hitCount > 0 ? `${hitIndex + 1} / ${hitCount}` : "";

  return (
    <div className="pdf-toolbar-wrap">
      <div className="pdf-toolbar">
        <Space size="small" wrap>
          <Upload accept=".pdf" showUploadList={false} beforeUpload={handleUpload}>
            <Tooltip title="上传 PDF">
              <Button icon={<UploadOutlined />} size="small" />
            </Tooltip>
          </Upload>

          {currentDocMeta && (
            <>
              <span className="toolbar-filename">
                <FileTextOutlined /> {currentDocMeta.filename}
              </span>
              <span className="toolbar-divider" />
              <Tooltip title={searchExpanded ? "收起搜索栏" : "展开搜索栏"}>
                <Button
                  icon={<SearchOutlined />}
                  size="small"
                  type={searchExpanded ? "default" : "dashed"}
                  onClick={() => persistSearchExpanded(!searchExpanded)}
                />
              </Tooltip>
              {embedAnnotations ? (
                <>
                  <span className="toolbar-divider" />
                  <Tooltip title="浏览/选词（退出标注工具）">
                    <Button
                      size="small"
                      type={
                        embedAnnotations.activeToolId == null
                          ? "primary"
                          : "default"
                      }
                      onClick={() => embedAnnotations.setTool(null)}
                    >
                      浏览
                    </Button>
                  </Tooltip>
                  <Tooltip title="高亮：拖选文本添加高亮">
                    <Button
                      size="small"
                      icon={<BgColorsOutlined />}
                      type={
                        embedAnnotations.activeToolId === "highlight"
                          ? "primary"
                          : "default"
                      }
                      onClick={() =>
                        embedAnnotations.setTool(
                          embedAnnotations.activeToolId === "highlight"
                            ? null
                            : "highlight",
                        )
                      }
                    />
                  </Tooltip>
                  <Tooltip title="下划线：拖选文本添加下划线">
                    <Button
                      size="small"
                      icon={<UnderlineOutlined />}
                      type={
                        embedAnnotations.activeToolId === "underline"
                          ? "primary"
                          : "default"
                      }
                      onClick={() =>
                        embedAnnotations.setTool(
                          embedAnnotations.activeToolId === "underline"
                            ? null
                            : "underline",
                        )
                      }
                    />
                  </Tooltip>
                  <Tooltip title="撤销">
                    <Button
                      size="small"
                      icon={<UndoOutlined />}
                      disabled={!embedAnnotations.canUndo}
                      onClick={() => embedAnnotations.undo()}
                    />
                  </Tooltip>
                  <Tooltip title="重做">
                    <Button
                      size="small"
                      icon={<RedoOutlined />}
                      disabled={!embedAnnotations.canRedo}
                      onClick={() => embedAnnotations.redo()}
                    />
                  </Tooltip>
                  <Tooltip title="删除选中的批注（或按 Delete / Backspace）">
                    <Button
                      size="small"
                      icon={<DeleteOutlined />}
                      danger
                      disabled={embedAnnotations.selectedAnnotationCount < 1}
                      onClick={() => embedAnnotations.deleteSelected()}
                    />
                  </Tooltip>
                  <Tooltip title="下载带标注的 PDF">
                    <Button
                      size="small"
                      icon={<DownloadOutlined />}
                      onClick={() => embedAnnotations.exportPdf()}
                    />
                  </Tooltip>
                </>
              ) : null}
              {!searchExpanded && hitCount > 0 ? (
                <>
                  <span className="pdf-search-compact-label">{matchLabel}</span>
                  <Button
                    size="small"
                    onClick={() =>
                      embedSearch ? embedSearch.prev() : pdfSearchPrev()
                    }
                  >
                    上一个
                  </Button>
                  <Button
                    size="small"
                    onClick={() =>
                      embedSearch ? embedSearch.next() : pdfSearchNext()
                    }
                  >
                    下一个
                  </Button>
                  <Button
                    size="small"
                    type="link"
                    onClick={() =>
                      embedSearch ? embedSearch.clear() : clearPdfSearch()
                    }
                  >
                    清除
                  </Button>
                </>
              ) : null}
              <span className="toolbar-divider" />
            </>
          )}
        </Space>

        <Space size="small">
          <span className="page-indicator">
            <InputNumber
              min={1}
              max={numPages}
              value={currentPage}
              onChange={(v) => v && onPageChange(v)}
              size="small"
              style={{ width: 56 }}
            />
            <span>/ {numPages}</span>
          </span>
          {embedZoom ? (
            <>
              <span className="toolbar-divider" />
              <Tooltip title="缩小">
                <Button
                  icon={<ZoomOutOutlined />}
                  size="small"
                  onClick={() => embedZoom.onOut()}
                />
              </Tooltip>
              <Tooltip title="放大">
                <Button
                  icon={<ZoomInOutlined />}
                  size="small"
                  onClick={() => embedZoom.onIn()}
                />
              </Tooltip>
              <InputNumber
                size="small"
                min={25}
                max={500}
                step={5}
                value={zoomPctDraft}
                onChange={(v) => v != null && setZoomPctDraft(v)}
                onPressEnter={() => commitEmbedZoomPct()}
                onBlur={() => commitEmbedZoomPct()}
                addonAfter="%"
                controls={false}
                style={{ width: 88 }}
              />
              <Tooltip title="适应宽度（与 Chrome 打开 PDF 类似）">
                <Button
                  icon={<ColumnWidthOutlined />}
                  size="small"
                  onClick={() => embedZoom.onFitWidth()}
                />
              </Tooltip>
              <Tooltip title="浏览器缩放会影响 PDF 清晰度（建议 100%）">
                <span className="scale-label" style={{ minWidth: 62 }}>
                  浏览器 {browserZoomHint}%
                </span>
              </Tooltip>
              <Tooltip title="100% 缩放（PDF 原始尺寸）">
                <Button
                  icon={<ExpandOutlined />}
                  size="small"
                  onClick={() => embedZoom.on100()}
                />
              </Tooltip>
            </>
          ) : onScaleChange ? (
            <>
              <span className="toolbar-divider" />
              <Tooltip title="缩小">
                <Button
                  icon={<ZoomOutOutlined />}
                  size="small"
                  onClick={() => onScaleChange(Math.max(0.5, scale - 0.2))}
                />
              </Tooltip>
              <Tooltip title="放大">
                <Button
                  icon={<ZoomInOutlined />}
                  size="small"
                  onClick={() => onScaleChange(Math.min(3, scale + 0.2))}
                />
              </Tooltip>
              <InputNumber
                size="small"
                min={25}
                max={500}
                step={5}
                value={zoomPctDraft}
                onChange={(v) => v != null && setZoomPctDraft(v)}
                onPressEnter={() => commitLegacyZoomPct()}
                onBlur={() => commitLegacyZoomPct()}
                addonAfter="%"
                controls={false}
                style={{ width: 88 }}
              />
              <Tooltip title="适应宽度（与 Chrome 打开 PDF 类似）">
                <Button
                  icon={<ColumnWidthOutlined />}
                  size="small"
                  disabled={!onFitWidth}
                  onClick={() => onFitWidth?.()}
                />
              </Tooltip>
              <Tooltip title="浏览器缩放会影响 PDF 清晰度（建议 100%）">
                <span className="scale-label" style={{ minWidth: 62 }}>
                  浏览器 {browserZoomHint}%
                </span>
              </Tooltip>
              <Tooltip title="100% 缩放（PDF 原始尺寸）">
                <Button
                  icon={<ExpandOutlined />}
                  size="small"
                  onClick={() => onScaleChange(1.0)}
                />
              </Tooltip>
            </>
          ) : null}
          <span className="toolbar-divider" />
          <Tooltip title="阅读区背景（页间空隙与外框颜色）">
            <Select
              size="small"
              value={readerBackground}
              onChange={(v) => setReaderBackground(v as ReaderBackgroundId)}
              options={READER_THEME_OPTIONS}
              style={{ width: 100 }}
              popupMatchSelectWidth={false}
            />
          </Tooltip>
        </Space>
      </div>

      {currentDocMeta && searchExpanded ? (
        <div className="pdf-toolbar-search-row">
          <Input
            size="small"
            placeholder="在文档中搜索…"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            onPressEnter={onSearchPressEnter}
            allowClear
            style={{ flex: 1, minWidth: 120, maxWidth: 360 }}
          />
          <Button size="small" type="primary" onClick={() => void runSearch()}>
            查找
          </Button>
          <Button
            size="small"
            disabled={!hitCount}
            onClick={() =>
              embedSearch ? embedSearch.prev() : pdfSearchPrev()
            }
          >
            上一个
          </Button>
          <Button
            size="small"
            disabled={!hitCount}
            onClick={() =>
              embedSearch ? embedSearch.next() : pdfSearchNext()
            }
          >
            下一个
          </Button>
          {matchLabel ? (
            <span className="pdf-search-match-label">{matchLabel}</span>
          ) : null}
          <Button
            size="small"
            type="link"
            disabled={!hitCount}
            onClick={() =>
              embedSearch ? embedSearch.clear() : clearPdfSearch()
            }
          >
            清除高亮
          </Button>
          <Button
            size="small"
            type="link"
            icon={<UpOutlined />}
            onClick={() => persistSearchExpanded(false)}
          >
            收起
          </Button>
        </div>
      ) : null}
    </div>
  );
}
