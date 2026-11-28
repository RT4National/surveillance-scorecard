import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { DataProvider } from "./data/context";
import "./styles.css";
import "./styles/motion.css";

const root = document.getElementById("root")!;
// The Worker renders home and member pages into #root (data-server). Keep that markup on screen
// until the publication has loaded; createRoot replaces it, no hydration.
const serverHtml = root.dataset.server ? root.innerHTML : undefined;
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <DataProvider>
      <App serverHtml={serverHtml} />
    </DataProvider>
  </React.StrictMode>,
);
