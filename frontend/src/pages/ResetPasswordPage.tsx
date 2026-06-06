import React, { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { API_BASE } from "../api/apiClient";
import { parseApiError } from "../utils/api";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get("token") || "", [searchParams]);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!token) {
      setError("This reset link is invalid or incomplete.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setSuccess("");

      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: newPassword }),
      });

      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }

      const data = await res.json();
      setSuccess(data?.message || "Password updated successfully.");
      setTimeout(() => navigate("/login", { replace: true }), 1500);
    } catch (err: any) {
      setError(err?.message || "Unable to reset password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={pageShell}>
      <div style={card}>
        <div style={eyebrow}>Secure account recovery</div>
        <h1 style={title}>Reset your password</h1>
        <p style={subtitle}>
          Choose a new password for your Ordanex account. This will update your sign-in credentials in the application database.
        </p>

        {error ? <div style={errorBanner}>{error}</div> : null}
        {success ? <div style={successBanner}>{success}</div> : null}

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
          <div>
            <div style={labelStyle}>New password</div>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter a new password"
              style={inputStyle}
              autoComplete="new-password"
            />
          </div>

          <div>
            <div style={labelStyle}>Confirm password</div>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your new password"
              style={inputStyle}
              autoComplete="new-password"
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
            {loading ? "Updating..." : "Update password"}
          </button>
        </form>

        <div style={footerNote}>
          <Link to="/login" style={linkStyle}>Back to sign in</Link>
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

const card: React.CSSProperties = {
  width: "100%",
  maxWidth: 460,
  background: "rgba(255,255,255,0.94)",
  border: "1px solid rgba(219,228,238,0.9)",
  borderRadius: 24,
  padding: 32,
  boxShadow: "0 28px 80px rgba(15,23,42,0.14)",
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
  margin: 0,
  fontSize: 36,
  fontWeight: 800,
  color: "#0f172a",
  letterSpacing: "-0.03em",
};

const subtitle: React.CSSProperties = {
  fontSize: 14,
  color: "#64748b",
  lineHeight: 1.7,
  marginTop: 12,
  marginBottom: 24,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  color: "#334155",
  marginBottom: 6,
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

const successBanner: React.CSSProperties = {
  border: "1px solid #bbf7d0",
  background: "#f0fdf4",
  color: "#166534",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 13,
  fontWeight: 600,
  marginBottom: 16,
};

const footerNote: React.CSSProperties = {
  fontSize: 12,
  textAlign: "center",
  marginTop: 20,
};

const linkStyle: React.CSSProperties = {
  color: "#0b5fff",
  fontWeight: 700,
  textDecoration: "none",
};
