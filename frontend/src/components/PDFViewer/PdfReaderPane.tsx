import PdfTocSplit from "./PdfTocSplit";
import PDFViewer from "./PDFViewer";

/** 独立 chunk，供 App 懒加载，减小首屏 JS（EmbedPDF / PDFium 延后拉取） */
export default function PdfReaderPane() {
  return (
    <PdfTocSplit>
      <PDFViewer />
    </PdfTocSplit>
  );
}
