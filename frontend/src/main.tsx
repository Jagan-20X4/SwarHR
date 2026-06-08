import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { initRuntimeConfig } from "@/app/bootstrap/initRuntimeConfig";
import { AppProviders } from "@/app/providers/AppProviders";
import { setupPdfJs } from "@/shared/utils/pdfjs";
import { setupMammoth } from "@/shared/utils/mammothSetup";
import App from "@/App";
import "@/styles/index.css";

initRuntimeConfig();
setupPdfJs();
void setupMammoth();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppProviders>
        <App />
      </AppProviders>
    </BrowserRouter>
  </React.StrictMode>,
);
