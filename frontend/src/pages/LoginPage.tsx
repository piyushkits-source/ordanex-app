import React, { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getPostLoginPath, saveAuth } from "../utils/auth";
import { parseApiError } from "../utils/api";

const API_BASE = "";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("admin@ordanex.com");
  const [password, setPassword] = useState("Admin@123");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const nextPath = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("next");
  }, [location.search]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();

    try {
      setLoading(true);
      setError("");

      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }

      const data = await res.json();
      saveAuth(data);

      const redirectTo = nextPath || getPostLoginPath(data.role);
      navigate(redirectTo, { replace: true });
    } catch (err: any) {
      setError(err?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={pageShell}>
      <div style={layoutShell}>
        <div style={brandingPanel}>
          <div style={brandingOverlay}>
            <img
              src="/assets/ordanex-login.png"
              alt="Ordanex"
              style={brandImage}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />

            <div style={brandTextWrap}>
              <div style={brandTitle}>Ordanex</div>
              <div style={brandSubtitle}>From Documents to Decisions</div>
              <div style={brandDescription}>
                AI-powered order automation for seamless document intake,
                intelligent extraction, partner mapping, and ERP-ready processing.
              </div>

              <div style={featureList}>
                <div>• Email / API / EDI ingestion</div>
                <div>• Smart extraction and validation</div>
                <div>• ERP-ready transformation and routing</div>
              </div>
            </div>
          </div>
        </div>

        <div style={formPanel}>
          <div style={formCard}>
            <div style={eyebrow}>Welcome back</div>
            <div style={title}>Sign in</div>
            <div style={subtitle}>
              Access your monitoring, client configuration, onboarding, and automation workspace.
            </div>

            {error ? <div style={errorBanner}>{error}</div> : null}

            <form onSubmit={handleLogin} style={{ display: "grid", gap: 16 }}>
              <div>
                <div style={labelStyle}>Email</div>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  style={inputStyle}
                  autoComplete="email"
                />
              </div>

              <div>
                <div style={labelRow}>
                  <span style={labelStyle}>Password</span>
                  <button type="button" style={linkButton}>
                    Forgot password?
                  </button>
                </div>

                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  style={inputStyle}
                  autoComplete="current-password"
                />
              </div>

              <button
                type="submit"
                style={{
                  ...primaryButton,
                  opacity: loading ? 0.85 : 1,
                  cursor: loading ? "not-allowed" : "pointer",
                }}
                disabled={loading}
              >
                {loading ? "Signing in..." : "Sign in to Ordanex"}
              </button>
            </form>

            <div style={footerNote}>
              Secure enterprise access with role-based authorization.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const pageShell: React.CSSProperties = {
  minHeight: "100vh",
  background: "#f8fafc",
  padding: 24,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const layoutShell: React.CSSProperties = {
  width: "100%",
  maxWidth: 1240,
  minHeight: 720,
  display: "grid",
  gridTemplateColumns: "1.05fr 0.95fr",
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: 24,
  overflow: "hidden",
  boxShadow: "0 20px 60px rgba(15,23,42,0.10)",
};

const brandingPanel: React.CSSProperties = {
  position: "relative",
  background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 35%, #e0f2fe 100%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 48,
};

const brandingOverlay: React.CSSProperties = {
  width: "100%",
  maxWidth: 520,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
};

const brandImage: React.CSSProperties = {
  width: "100%",
  maxWidth: 430,
  objectFit: "contain",
  marginBottom: 18,
  filter: "drop-shadow(0 8px 25px rgba(11,95,255,0.12))",
};

const brandTextWrap: React.CSSProperties = {
  display: "grid",
  gap: 8,
};

const brandTitle: React.CSSProperties = {
  fontSize: 34,
  fontWeight: 800,
  color: "#0f172a",
  letterSpacing: "-0.02em",
};

const brandSubtitle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  color: "#1d4ed8",
};

const brandDescription: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.7,
  color: "#475569",
  maxWidth: 460,
  marginTop: 6,
};

const featureList: React.CSSProperties = {
  marginTop: 12,
  display: "grid",
  gap: 6,
  fontSize: 13,
  color: "#334155",
};

const formPanel: React.CSSProperties = {
  background: "#ffffff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 40,
};

const formCard: React.CSSProperties = {
  width: "100%",
  maxWidth: 420,
};

const eyebrow: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "#0b5fff",
  marginBottom: 10,
};

const title: React.CSSProperties = {
  fontSize: 34,
  fontWeight: 800,
  color: "#0f172a",
  letterSpacing: "-0.02em",
};

const subtitle: React.CSSProperties = {
  fontSize: 14,
  color: "#64748b",
  lineHeight: 1.6,
  marginTop: 10,
  marginBottom: 24,
};

const errorBanner: React.CSSProperties = {
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#b91c1c",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 13,
  fontWeight: 600,
  marginBottom: 16,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#475569",
  marginBottom: 6,
};

const labelRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 6,
};

const linkButton: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#0b5fff",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  padding: 0,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 46,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #dbe4ee",
  background: "#fff",
  fontSize: 14,
  color: "#0f172a",
  outline: "none",
  boxSizing: "border-box",
};

const primaryButton: React.CSSProperties = {
  border: "1px solid #0b5fff",
  background: "#0b5fff",
  color: "#fff",
  borderRadius: 10,
  padding: "12px 16px",
  fontSize: 14,
  fontWeight: 700,
  transition: "all 0.2s ease",
};

const footerNote: React.CSSProperties = {
  marginTop: 18,
  fontSize: 12,
  color: "#94a3b8",
  textAlign: "center",
};