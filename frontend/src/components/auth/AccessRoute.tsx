import React from "react";
import { Navigate } from "react-router-dom";
import { getAuth } from "../../utils/auth";
import { canAccessModule, getDefaultRouteForAuth, type AppModuleKey } from "../../utils/access";

export default function AccessRoute({
  moduleKey,
  children,
}: {
  moduleKey: AppModuleKey;
  children: React.ReactNode;
}) {
  const auth = getAuth();

  if (!auth) {
    return <Navigate to="/login" replace />;
  }

  if (!canAccessModule(auth, moduleKey)) {
    return <Navigate to={getDefaultRouteForAuth(auth)} replace />;
  }

  return <>{children}</>;
}
