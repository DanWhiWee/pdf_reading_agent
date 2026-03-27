import { useCallback, useState } from "react";
import {
  Button,
  Input,
  InputNumber,
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
} from "@ant-design/icons";
import { uploadPDF, searchPDF } from "../../services/api";
import { useAppStore } from "../../stores/appStore";
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
  onScaleChange: (scale: number) => void;
  /** Like Chrome: fit page width to the viewer */
  onFitWidth?: () => void;
}

export default function PDFToolbar({
  currentPage,
  numPages,
  scale,
  onPageChange,
  onScaleChange,
  onFitWidth,
}: Props) {
  const {
    currentDocId,
    currentDocMeta,
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
      clearPdfSearch();
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
      pdfSearchNext();
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
              {!searchExpanded && hitCount > 0 ? (
                <>
                  <span className="pdf-search-compact-label">{matchLabel}</span>
                  <Button
                    size="small"
                    onClick={() => pdfSearchPrev()}
                  >
                    上一个
                  </Button>
                  <Button
                    size="small"
                    onClick={() => pdfSearchNext()}
                  >
                    下一个
                  </Button>
                  <Button size="small" type="link" onClick={() => clearPdfSearch()}>
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
          <span className="toolbar-divider" />
          <Tooltip title="缩小">
            <Button
              icon={<ZoomOutOutlined />}
              size="small"
              onClick={() => onScaleChange(Math.max(0.5, scale - 0.2))}
            />
          </Tooltip>
          <span className="scale-label">{Math.round(scale * 100)}%</span>
          <Tooltip title="放大">
            <Button
              icon={<ZoomInOutlined />}
              size="small"
              onClick={() => onScaleChange(Math.min(3, scale + 0.2))}
            />
          </Tooltip>
          <Tooltip title="适应宽度（与 Chrome 打开 PDF 类似）">
            <Button
              icon={<ColumnWidthOutlined />}
              size="small"
              disabled={!onFitWidth}
              onClick={() => onFitWidth?.()}
            />
          </Tooltip>
          <Tooltip title="100% 缩放（PDF 原始尺寸）">
            <Button
              icon={<ExpandOutlined />}
              size="small"
              onClick={() => onScaleChange(1.0)}
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
            onClick={() => pdfSearchPrev()}
          >
            上一个
          </Button>
          <Button
            size="small"
            disabled={!hitCount}
            onClick={() => pdfSearchNext()}
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
            onClick={() => clearPdfSearch()}
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
