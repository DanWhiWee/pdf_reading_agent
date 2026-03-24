import { Button, InputNumber, Space, Tooltip, Upload, message } from "antd";
import {
  ZoomInOutlined,
  ZoomOutOutlined,
  ExpandOutlined,
  UploadOutlined,
  FileTextOutlined,
} from "@ant-design/icons";
import { uploadPDF } from "../../services/api";
import { useAppStore } from "../../stores/appStore";

interface Props {
  currentPage: number;
  numPages: number;
  scale: number;
  onPageChange: (page: number) => void;
  onScaleChange: (scale: number) => void;
}

export default function PDFToolbar({
  currentPage,
  numPages,
  scale,
  onPageChange,
  onScaleChange,
}: Props) {
  const { currentDocMeta, setCurrentDoc, clearDoc } = useAppStore();

  const handleUpload = async (file: File) => {
    try {
      clearDoc();
      const meta = await uploadPDF(file);
      setCurrentDoc(meta.id, meta);
      message.success(`Loaded: ${meta.filename}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      message.error(msg);
    }
    return false;
  };

  return (
    <div className="pdf-toolbar">
      <Space size="small">
        <Upload accept=".pdf" showUploadList={false} beforeUpload={handleUpload}>
          <Tooltip title="Upload PDF">
            <Button icon={<UploadOutlined />} size="small" />
          </Tooltip>
        </Upload>

        {currentDocMeta && (
          <>
            <span className="toolbar-filename">
              <FileTextOutlined /> {currentDocMeta.filename}
            </span>
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
        <Tooltip title="Zoom out">
          <Button
            icon={<ZoomOutOutlined />}
            size="small"
            onClick={() => onScaleChange(Math.max(0.5, scale - 0.2))}
          />
        </Tooltip>
        <span className="scale-label">{Math.round(scale * 100)}%</span>
        <Tooltip title="Zoom in">
          <Button
            icon={<ZoomInOutlined />}
            size="small"
            onClick={() => onScaleChange(Math.min(3, scale + 0.2))}
          />
        </Tooltip>
        <Tooltip title="Fit width">
          <Button
            icon={<ExpandOutlined />}
            size="small"
            onClick={() => onScaleChange(1.0)}
          />
        </Tooltip>
      </Space>
    </div>
  );
}
