import { Routes, Route, Navigate } from "react-router-dom";
import MessageMonitorPage from "./pages/MessageMonitorPage";
import ClientConfigWorkspacePage from "./pages/ClientConfigWorkspacePage";
import TradingPartnerPage from "./pages/TradingPartnerPage";
import TradingPartnerWorkspacePage from "./pages/TradingPartnerWorkspacePage";
import LoginPage from "./pages/LoginPage";
import UsersPage from "./pages/UsersPage";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import PublicRoute from "./components/auth/PublicRoute";
import AppLayout from "./app/layout/AppLayout";
import { getAuth, getPostLoginPath } from "./utils/auth";

function Placeholder({ title }: { title: string }) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        background: "#fff",
        padding: 24,
      }}
    >
      <h1 style={{ margin: 0, fontSize: 22, color: "#0f172a" }}>{title}</h1>
      <p style={{ marginTop: 8, color: "#64748b" }}>
        This page is ready to be wired next.
      </p>
    </div>
  );
}

function HomeRedirect() {
  const auth = getAuth();
  return <Navigate to={auth?.access_token ? getPostLoginPath(auth.role) : "/login"} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />

      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/monitoring" element={<MessageMonitorPage />} />
        <Route path="/client-config" element={<ClientConfigWorkspacePage />} />

        {/* Trading Partners: list view then workspace detail */}
        <Route path="/trading-partners" element={<TradingPartnerPage />} />
        <Route path="/trading-partners/:partnerId/*" element={<TradingPartnerWorkspacePage />} />

        {/* Legacy URL redirect */}
        <Route
          path="/Trading-Partner/:partnerId/*"
          element={<Navigate to="/trading-partners" replace />}
        />

        <Route path="/users" element={<UsersPage />} />
        <Route path="/user-admin" element={<Navigate to="/users" replace />} />
        <Route path="/connections" element={<Placeholder title="Connections" />} />
        <Route path="/business-rules" element={<Placeholder title="Business Rules" />} />
        <Route path="/reports" element={<Placeholder title="Reports" />} />
        <Route path="/analytics" element={<Placeholder title="Analytics" />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
