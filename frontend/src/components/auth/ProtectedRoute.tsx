import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { isAuthenticated } from "../../utils/auth";

export default function ProtectedRoute({ children }: { children: React.ReactNode; }) {
  const location = useLocation();

  if (!isAuthenticated()) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }

  return <>{children}</>;
}
