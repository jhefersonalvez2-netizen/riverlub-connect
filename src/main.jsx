import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./desktop/styles/tokens.css";
import "./styles.css";
import "./desktop/styles/layout.css";
import "./desktop/styles/components.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
