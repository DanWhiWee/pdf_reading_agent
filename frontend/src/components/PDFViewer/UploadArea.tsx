import { Upload, message } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import { uploadPDF } from "../../services/api";
import { useAppStore } from "../../stores/appStore";
import { waitForRagIndex } from "../../utils/ragPoll";

const { Dragger } = Upload;

export default function UploadArea() {
  const { setCurrentDoc } = useAppStore();

  const handleUpload = async (file: File) => {
    try {
      const meta = await uploadPDF(file);
      setCurrentDoc(meta.id, meta);
      message.success(`已加载：${meta.filename}（${meta.num_pages} 页）`);
      const hide = message.loading("正在建立语义索引…", 0);
      void waitForRagIndex(meta.id).then((ok) => {
        hide();
        if (ok) {
          message.success("语义索引已就绪", 2);
        } else {
          message.warning("语义索引未完成，将使用全文摘录", 5);
        }
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      message.error(msg);
    }
    return false;
  };

  return (
    <div className="upload-area">
      <Dragger
        accept=".pdf"
        showUploadList={false}
        beforeUpload={handleUpload}
        style={{ padding: "40px 20px" }}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined style={{ fontSize: 48, color: "#1677ff" }} />
        </p>
        <p className="ant-upload-text">Click or drag PDF file to upload</p>
        <p className="ant-upload-hint">Supports single PDF file upload</p>
      </Dragger>
    </div>
  );
}
