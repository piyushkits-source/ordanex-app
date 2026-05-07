import React, { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { isAuthenticated, redirectToLogin, verifyCurrentSession } from "../../utils/auth";

export default function ProtectedRoute({ children }: { children: React.ReactNode; }) {
  const location = useLocation();
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    let active = true;

    async function validateSession() {
      if (!isAuthenticated()) {
        if (active) setVerified(true);
        return;
      }

      const ok = await verifyCurrentSession();
      if (!active) return;

      if (!ok) {
        redirectToLogin(location.pathname + location.search);
        return;
      }

      setVerified(true);
    }

    void validateSession();

    const revalidate = () => {
      if (document.visibilityState === "hidden") return;
      void validateSession();
    };

    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    const timer = window.setInterval(revalidate, 5000);

    return () => {
      active = false;
      window.removeEventListener("focus", revalidate);
      document.removeEventListener("visibilitychange", revalidate);
      window.clearInterval(timer);
    };
  }, [location.pathname, location.search]);

  if (!isAuthenticated()) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }

  if (!verified) {
    return null;
  }

  return <>{children}</>;
}
