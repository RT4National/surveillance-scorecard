import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { DataProvider } from './data/context';
import "./styles.css";
import "./styles/motion.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DataProvider><App /></DataProvider>
  </React.StrictMode>,
);
