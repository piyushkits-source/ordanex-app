import { Routes, Route, Navigate } from "react-router-dom";
import MessageMonitorPage from "./pages/MessageMonitorPage";
import ClientConfigWorkspacePage from "./pages/ClientConfigWorkspacePage";
import TradingPartnerPage from "./pages/TradingPartnerPage";
import TradingPartnerWorkspacePage from "./pages/TradingPartnerWorkspacePage";
import LoginPage from "./pages/LoginPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import UsersPage from "./pages/UsersPage";
import ReportsPage from "./pages/ReportsPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import BuyerPortalPage from "./pages/BuyerPortalPage";
import SupplierOrdersPage from "./pages/SupplierOrdersPage";
import SupplierCommerceDeskPage from "./pages/SupplierCommerceDeskPage";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import PublicRoute from "./components/auth/PublicRoute";
import AccessRoute from "./components/auth/AccessRoute";
import AppLayout from "./app/layout/AppLayout";
import { clearAuthOnAppBoot, getAuth, getPostLoginPath } from "./utils/auth";

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
  clearAuthOnAppBoot();

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
        path="/reset-password"
        element={
          <PublicRoute>
            <ResetPasswordPage />
          </PublicRoute>
        }
      />

      <Route path="/portal/:clientId" element={<BuyerPortalPage />} />

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/monitoring" element={<AccessRoute moduleKey="monitoring"><MessageMonitorPage /></AccessRoute>} />
        <Route path="/client-config" element={<AccessRoute moduleKey="client_config"><ClientConfigWorkspacePage /></AccessRoute>} />
        <Route path="/trading-partners" element={<AccessRoute moduleKey="trading_partners"><TradingPartnerPage /></AccessRoute>} />
        <Route path="/trading-partners/:partnerId/*" element={<AccessRoute moduleKey="trading_partners"><TradingPartnerWorkspacePage /></AccessRoute>} />
        <Route path="/Trading-Partner/:partnerId/*" element={<Navigate to="/trading-partners" replace />} />
        <Route path="/users" element={<AccessRoute moduleKey="users"><UsersPage /></AccessRoute>} />
        <Route path="/user-admin" element={<Navigate to="/users" replace />} />
        <Route path="/connections" element={<AccessRoute moduleKey="connections"><Placeholder title="Connections" /></AccessRoute>} />
        <Route path="/business-rules" element={<AccessRoute moduleKey="business_rules"><Placeholder title="Business Rules" /></AccessRoute>} />
        <Route path="/reports" element={<AccessRoute moduleKey="reports"><ReportsPage /></AccessRoute>} />
        <Route path="/analytics" element={<AccessRoute moduleKey="analytics"><AnalyticsPage /></AccessRoute>} />
        <Route path="/supplier/:clientId/orders" element={<AccessRoute moduleKey="client_config"><SupplierOrdersPage /></AccessRoute>} />
        <Route path="/supplier/orders/:poId/commerce" element={<AccessRoute moduleKey="client_config"><SupplierCommerceDeskPage /></AccessRoute>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
