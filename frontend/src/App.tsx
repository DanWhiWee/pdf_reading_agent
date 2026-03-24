import { Allotment } from "allotment";
import "allotment/dist/style.css";

import ChatPanel from "./components/ChatPanel/ChatPanel";
import PDFViewer from "./components/PDFViewer/PDFViewer";
import "./App.css";

export default function App() {
  return (
    <div className="app">
      <Allotment defaultSizes={[35, 65]}>
        <Allotment.Pane minSize={320}>
          <ChatPanel />
        </Allotment.Pane>
        <Allotment.Pane minSize={400}>
          <PDFViewer />
        </Allotment.Pane>
      </Allotment>
    </div>
  );
}
