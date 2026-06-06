import React, { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getPostLoginPath, saveAuth } from "../utils/auth";
import { parseApiError } from "../utils/api";
import { API_BASE } from "../api/apiClient";
import ordanexLoginImage from "../assets/ordanex-login.png";


export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("admin@ordanex.com");
  const [password, setPassword] = useState("Admin@123");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showResetRequest, setShowResetRequest] = useState(false);
  const [resetEmail, setResetEmail] = useState("admin@ordanex.com");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState("");

  const nextPath = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("next");
  }, [location.search]);

  async function handleResetRequest(e: React.FormEvent) {
    e.preventDefault();

    try {
      setResetLoading(true);
      setResetMessage("");

      const res = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail }),
      });

      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }

      const data = await res.json();
      setResetMessage(data?.message || "Reset link sent.");
    } catch (err: any) {
      setResetMessage(err?.message || "Unable to request a password reset.");
    } finally {
      setResetLoading(false);
    }
  }

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
          <div style={brandingGlowLarge} />
          <div style={brandingGlowSmall} />
          <div style={brandingOverlay}>
            <div style={brandBadge}>Enterprise Order Intelligence</div>
            <div style={brandImageFrame}>
              <img
                src={ordanexLoginImage}
                alt="Ordanex"
                style={brandImage}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            </div>

            <div style={brandTextWrap}>
              <div style={brandTitle}>From Documents to Decisions</div>
              <div style={brandSubtitle}>Built for high-trust trading partner automation</div>
              <div style={brandDescription}>
                Unify intake, extraction, mapping, validation, and ERP-ready message generation in one operational workspace.
              </div>

              <div style={metricGrid}>
                <div style={metricCard}>
                  <div style={metricValue}>Multi-Channel</div>
                  <div style={metricLabel}>Email, API, EDI, SFTP</div>
                </div>
                <div style={metricCard}>
                  <div style={metricValue}>AI + Rules</div>
                  <div style={metricLabel}>Robust extraction and mapping</div>
                </div>
                <div style={metricCard}>
                  <div style={metricValue}>ERP Ready</div>
                  <div style={metricLabel}>Canonical, XML, IDOC outputs</div>
                </div>
              </div>

              <div style={featureList}>
                <div style={featurePill}>Straight-through processing</div>
                <div style={featurePill}>Trading partner onboarding</div>
                <div style={featurePill}>Operational monitoring</div>
              </div>
            </div>
          </div>
        </div>

        <div style={formPanel}>
          <div style={formCard}>
            <div style={eyebrow}>Welcome back</div>
            <div style={title}>Sign in</div>
            <div style={subtitle}>
              Access your monitoring, client configuration, onboarding, analytics, and automation workspace.
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
                  <button
                    type="button"
                    style={linkButton}
                    onClick={() => {
                      setShowResetRequest((current) => !current);
                      setResetEmail(email || "admin@ordanex.com");
                      setResetMessage("");
                    }}
                  >
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

              {showResetRequest ? (
                <div style={resetPanel}>
                  <div style={resetTitle}>Reset password</div>
                  <div style={resetBody}>
                    Enter your email address and we will send you a secure reset link.
                  </div>
                  <form onSubmit={handleResetRequest} style={{ display: "grid", gap: 10 }}>
                    <input
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="Enter your email"
                      style={inputStyle}
                      autoComplete="email"
                    />
                    <div style={resetActions}>
                      <button
                        type="submit"
                        style={{
                          ...secondaryButton,
                          opacity: resetLoading ? 0.85 : 1,
                          cursor: resetLoading ? "not-allowed" : "pointer",
                        }}
                        disabled={resetLoading}
                      >
                        {resetLoading ? "Sending..." : "Send reset link"}
                      </button>
                      <button
                        type="button"
                        style={ghostButton}
                        onClick={() => {
                          setShowResetRequest(false);
                          setResetMessage("");
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                  {resetMessage ? <div style={resetMessageStyle}>{resetMessage}</div> : null}
                </div>
              ) : null}

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
  background: "radial-gradient(circle at top left, #dbeafe 0%, #eff6ff 28%, #f8fafc 62%, #f8fafc 100%)",
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
  background: "rgba(255,255,255,0.82)",
  border: "1px solid rgba(219,228,238,0.9)",
  borderRadius: 28,
  overflow: "hidden",
  boxShadow: "0 28px 80px rgba(15,23,42,0.16)",
  backdropFilter: "blur(14px)",
};

const brandingPanel: React.CSSProperties = {
  position: "relative",
  background: "linear-gradient(155deg, #eaf3ff 0%, #d8e8ff 34%, #d7efff 100%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 56,
  overflow: "hidden",
};

const brandingOverlay: React.CSSProperties = {
  position: "relative",
  zIndex: 1,
  width: "100%",
  maxWidth: 540,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  gap: 22,
};

const brandingGlowLarge: React.CSSProperties = {
  position: "absolute",
  width: 340,
  height: 340,
  borderRadius: "50%",
  background: "radial-gradient(circle, rgba(37,99,235,0.18) 0%, rgba(37,99,235,0) 72%)",
  top: -80,
  left: -40,
};

const brandingGlowSmall: React.CSSProperties = {
  position: "absolute",
  width: 260,
  height: 260,
  borderRadius: "50%",
  background: "radial-gradient(circle, rgba(14,165,233,0.18) 0%, rgba(14,165,233,0) 74%)",
  bottom: -90,
  right: -40,
};

const brandBadge: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "8px 14px",
  borderRadius: 999,
  border: "1px solid rgba(37,99,235,0.18)",
  background: "rgba(255,255,255,0.62)",
  color: "#1d4ed8",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const brandImageFrame: React.CSSProperties = {
  width: "100%",
  maxWidth: 420,
  padding: 26,
  borderRadius: 28,
  background: "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.82) 100%)",
  border: "1px solid rgba(255,255,255,0.85)",
  boxShadow: "0 24px 50px rgba(37,99,235,0.12)",
};

const brandImage: React.CSSProperties = {
  width: "100%",
  maxWidth: 360,
  objectFit: "contain",
  display: "block",
  margin: "0 auto",
  filter: "drop-shadow(0 10px 24px rgba(11,95,255,0.14))",
};

const brandTextWrap: React.CSSProperties = {
  display: "grid",
  gap: 10,
};

const brandTitle: React.CSSProperties = {
  fontSize: 42,
  fontWeight: 800,
  color: "#0f172a",
  letterSpacing: "-0.03em",
  lineHeight: 1.05,
};

const brandSubtitle: React.CSSProperties = {
  fontSize: 17,
  fontWeight: 700,
  color: "#2563eb",
};

const brandDescription: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.8,
  color: "#334155",
  maxWidth: 470,
};

const metricGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: 12,
  marginTop: 8,
};

const metricCard: React.CSSProperties = {
  padding: "14px 12px",
  borderRadius: 18,
  background: "rgba(255,255,255,0.58)",
  border: "1px solid rgba(255,255,255,0.72)",
  boxShadow: "0 10px 20px rgba(148,163,184,0.10)",
};

const metricValue: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  color: "#0f172a",
};

const metricLabel: React.CSSProperties = {
  fontSize: 12,
  color: "#475569",
  marginTop: 4,
};

const featureList: React.CSSProperties = {
  marginTop: 2,
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  justifyContent: "center",
};

const featurePill: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 999,
  border: "1px solid rgba(37,99,235,0.14)",
  background: "rgba(255,255,255,0.56)",
  fontSize: 12,
  fontWeight: 700,
  color: "#1e3a8a",
};

const formPanel: React.CSSProperties = {
  background: "linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.86) 100%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 48,
};

const formCard: React.CSSProperties = {
  width: "100%",
  maxWidth: 420,
  padding: "6px 2px",
};

const eyebrow: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  color: "#0b5fff",
  marginBottom: 10,
  letterSpacing: "0.02em",
  textTransform: "uppercase",
};

const title: React.CSSProperties = {
  fontSize: 40,
  fontWeight: 800,
  color: "#0f172a",
  letterSpacing: "-0.03em",
};

const subtitle: React.CSSProperties = {
  fontSize: 14,
  color: "#64748b",
  lineHeight: 1.7,
  marginTop: 12,
  marginBottom: 28,
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
  fontWeight: 800,
  color: "#334155",
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

const resetPanel: React.CSSProperties = {
  border: "1px solid #d7e1ee",
  background: "#f8fbff",
  borderRadius: 14,
  padding: 14,
  display: "grid",
  gap: 10,
};

const resetTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  color: "#0f172a",
};

const resetBody: React.CSSProperties = {
  fontSize: 13,
  color: "#64748b",
  lineHeight: 1.6,
};

const resetActions: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const secondaryButton: React.CSSProperties = {
  border: "1px solid #2563eb",
  background: "#2563eb",
  color: "#fff",
  borderRadius: 10,
  padding: "10px 14px",
  fontSize: 13,
  fontWeight: 700,
};

const ghostButton: React.CSSProperties = {
  border: "1px solid #d7e1ee",
  background: "#fff",
  color: "#0f172a",
  borderRadius: 10,
  padding: "10px 14px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const resetMessageStyle: React.CSSProperties = {
  border: "1px solid #bfdbfe",
  background: "#eff6ff",
  color: "#1d4ed8",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 13,
  lineHeight: 1.5,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 50,
  padding: "11px 14px",
  borderRadius: 14,
  border: "1px solid #d7e1ee",
  background: "rgba(255,255,255,0.94)",
  fontSize: 14,
  color: "#0f172a",
  outline: "none",
  boxSizing: "border-box",
  boxShadow: "0 6px 18px rgba(15,23,42,0.04)",
};

const primaryButton: React.CSSProperties = {
  border: "1px solid #2563eb",
  background: "linear-gradient(135deg, #2563eb 0%, #0b5fff 55%, #0284c7 100%)",
  color: "#fff",
  borderRadius: 14,
  padding: "13px 16px",
  fontSize: 14,
  fontWeight: 800,
  transition: "all 0.2s ease",
  boxShadow: "0 14px 28px rgba(37,99,235,0.22)",
};

const footerNote: React.CSSProperties = {
  fontSize: 12,
  color: "#94a3b8",
  textAlign: "center",
  marginTop: 20,
};
