import { Button, Tooltip } from "antd";
import { MenuFoldOutlined } from "@ant-design/icons";
import { useAppStore } from "../../stores/appStore";
import "./PDFViewer.css";

interface Props {
  onCollapse?: () => void;
}

export default function TOCSidebar({ onCollapse }: Props) {
  const currentDocMeta = useAppStore((s) => s.currentDocMeta);
  const navigatePdf = useAppStore((s) => s.navigatePdf);

  if (!currentDocMeta) return null;

  const toc = currentDocMeta.toc ?? [];

  return (
    <aside className="pdf-toc-sidebar">
      <div className="pdf-toc-title-row">
        <span className="pdf-toc-title">目录</span>
        {onCollapse ? (
          <Tooltip title="收起目录">
            <Button
              type="text"
              size="small"
              className="pdf-toc-collapse-btn"
              icon={<MenuFoldOutlined />}
              onClick={onCollapse}
            />
          </Tooltip>
        ) : null}
      </div>
      {toc.length === 0 ? (
        <div className="pdf-toc-empty">本文档无书签目录</div>
      ) : (
        <ul className="pdf-toc-list">
          {toc.map((item, i) => (
            <li
              key={`${i}-${item.page}-${item.title.slice(0, 24)}`}
              className="pdf-toc-item"
              style={{
                paddingLeft: Math.max(0, (item.level - 1) * 12 + 4),
              }}
            >
              <button
                type="button"
                className="pdf-toc-link"
                onClick={() => navigatePdf({ page: item.page })}
              >
                {item.title}
              </button>
              <span className="pdf-toc-page">{item.page}</span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
