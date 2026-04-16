import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LoadingOverlay } from "@/components/loading-overlay";
import AppPopup from "@/popup";
import { useAppStore } from "@/stores/app.store";
import { Routes, Route, HashRouter, Navigate } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import HomePage from "@/pages/home";
import "./index.css";

function AppContent() {
  const { isLoading } = useAppStore();

  return (
    <>
      <Routes>
        <Route path="/Home" element={<HomePage />} />
        <Route path="/" element={<AppPopup />} />
      </Routes>
      {isLoading && <LoadingOverlay message="Loading..." />}
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      <Toaster position="top-right" />
      <HashRouter>
        <AppContent />
      </HashRouter>
    </ThemeProvider>
  </StrictMode>,
);
