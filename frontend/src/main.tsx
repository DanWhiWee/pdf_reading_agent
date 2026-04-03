import React from "react";
import ReactDOM from "react-dom/client";
import { App as AntApp, ConfigProvider } from "antd";
import "katex/dist/katex.min.css";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#1677ff",
          borderRadius: 6,
        },
      }}
    >
      <AntApp style={{ height: "100%", minHeight: 0 }}>
        <App />
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>
);
