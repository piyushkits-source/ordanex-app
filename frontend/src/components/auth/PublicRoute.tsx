import React from "react";
import { Navigate } from "react-router-dom";
import { getAuth, getPostLoginPath } from "../../utils/auth";

export default function PublicRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = getAuth();

  if (auth?.access_token) {
    return <Navigate to={getPostLoginPath(auth.role)} replace />;
  }

  return <>{children}</>;
}
