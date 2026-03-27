import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./components/AuthContext";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { OverviewPage } from "./pages/OverviewPage";
import { TopicsPage } from "./pages/TopicsPage";
import { ConnectionsPage } from "./pages/ConnectionsPage";
import { DeadLettersPage } from "./pages/DeadLettersPage";
import { ApiKeysPage } from "./pages/ApiKeysPage";
import { DocumentationPage } from "./pages/DocumentationPage";
import { TestPage } from "./pages/TestPage";
import { SettingsPage } from "./pages/SettingsPage";

function ProtectedRoutes() {
  const { isLoading, isAuthenticated, needsSetup } = useAuth();

  if (isLoading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#1a1a2e", color: "#fff", fontFamily: "system-ui" }}>
        <div style={{ textAlign: "center" }}>
          <h2 style={{ margin: "0 0 8px" }}>🐇 EchoBus</h2>
          <p style={{ color: "#888" }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (needsSetup || !isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/topics" element={<TopicsPage />} />
        <Route path="/connections" element={<ConnectionsPage />} />
        <Route path="/dlq" element={<DeadLettersPage />} />
        <Route path="/api-keys" element={<ApiKeysPage />} />
        <Route path="/test" element={<TestPage />} />
        <Route path="/docs" element={<DocumentationPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="*" element={<ProtectedRoutes />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
