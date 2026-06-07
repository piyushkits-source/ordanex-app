import { useEffect, useState } from "react";
import PageHeader from "../components/common/PageHeader";
import { apiFetch, parseApiError } from "../utils/api";
import { getAuth } from "../utils/auth";
import { useAppScope } from "../context/AppScopeContext";

const API_BASE = "/users";

type UserRow = {
  user_id?: string;
  email: string;
  client_id?: string | null;
  environment?: string | null;
  role: string;
  is_active: boolean;
  created_at?: string | null;
  last_login_at?: string | null;
  created_by?: string | null;
};

export default function UsersPage() {
  const auth = getAuth();
  const { scope } = useAppScope();
  const scopeEnvironment = String(scope.environment || auth?.environment || "PROD").toUpperCase() === "PROD" ? "production" : "staging";
  const [rows, setRows] = useState<UserRow[]>([]);
  const [banner, setBanner] = useState("");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    client_id: "",
    email: "",
    password: "",
    role: "client_admin",
    environment: scopeEnvironment,
    is_active: true,
  });

  useEffect(() => {
    setForm((current) => ({ ...current, environment: scopeEnvironment }));
  }, [scopeEnvironment]);

  const environmentLabel = form.environment === "production" ? "Production" : "Staging";

  useEffect(() => {
    loadUsers();
  }, [form.environment]);

  async function loadUsers() {
    try {
      setLoading(true);
      setBanner("");
      const res = await apiFetch(`${API_BASE}?environment=${encodeURIComponent(form.environment)}`, { method: "GET" });
      if (!res.ok) throw new Error(await parseApiError(res));
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setBanner(err?.message || "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }

  async function createUser() {
    try {
      const res = await apiFetch(API_BASE, { method: "POST", body: JSON.stringify(form) });
      if (!res.ok) throw new Error(await parseApiError(res));
      setBanner(`User created successfully in ${environmentLabel}.`);
      setForm({
        client_id: "",
        email: "",
        password: "",
        role: "client_admin",
        environment: form.environment,
        is_active: true,
      });
      await loadUsers();
    } catch (err: any) {
      setBanner(err?.message || "Unable to create user.");
    }
  }

  async function toggleActive(email: string, is_active: boolean) {
    try {
      const res = await apiFetch(`${API_BASE}/${encodeURIComponent(email)}/active?environment=${encodeURIComponent(form.environment)}`, { method: "PUT", body: JSON.stringify({ is_active: !is_active }) });
      if (!res.ok) throw new Error(await parseApiError(res));
      setBanner("User status updated.");
      await loadUsers();
    } catch (err: any) {
      setBanner(err?.message || "Unable to update user status.");
    }
  }

  function formatLastLogin(value?: string | null) {
    if (!value) return "-";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString();
  }

  return (
    <div>
      <PageHeader title="User Management" subtitle={`Create users for the active ${environmentLabel} workspace and keep Production and Staging access separate.`} />
      {banner ? <div style={bannerStyle}>{banner}</div> : null}

      <div style={layout}>
        <div style={card}>
          <div style={title}>Create User</div>
          <div style={environmentNotice}>
            Users created from this screen are scoped to <strong>{environmentLabel}</strong> and can only access {environmentLabel.toLowerCase()} data.
          </div>
          <div style={grid}>
            {field("Client ID", <input value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })} style={input} />)}
            {field("Email", <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={input} />)}
            {field("Password", <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} style={input} />)}
            {field("Role", <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} style={input}><option value="super_admin">super_admin</option><option value="client_admin">client_admin</option><option value="it_admin">it_admin</option><option value="business_user">business_user</option></select>)}
            {field("Environment", (
              <select value={form.environment} onChange={(e) => setForm({ ...form, environment: e.target.value })} style={input}>
                <option value="production">Production</option>
                <option value="staging">Staging</option>
              </select>
            ))}
          </div>
          <div style={{ marginTop: 14 }}><button type="button" style={primaryButton} onClick={createUser}>Create User</button></div>
        </div>

        <div style={card}>
          <div style={title}>Users</div>
          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Email</th>
                  <th style={th}>Client</th>
                  <th style={th}>Environment</th>
                  <th style={th}>Role</th>
                  <th style={th}>Status</th>
                  <th style={th}>Last Login</th>
                  <th style={th}>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan={7} style={tdEmpty}>Loading...</td></tr> : rows.length === 0 ? <tr><td colSpan={7} style={tdEmpty}>No users found.</td></tr> : rows.map((row) => (
                  <tr key={row.email}>
                    <td style={td}>{row.email}</td>
                    <td style={td}>{row.client_id || "-"}</td>
                    <td style={td}>{String(row.environment || activeEnvironment).toUpperCase()}</td>
                    <td style={td}>{row.role}</td>
                    <td style={td}>{row.is_active ? "ACTIVE" : "INACTIVE"}</td>
                    <td style={td}>{formatLastLogin(row.last_login_at)}</td>
                    <td style={td}><button type="button" style={actionButton} onClick={() => toggleActive(row.email, row.is_active)}>{row.is_active ? "Deactivate" : "Activate"}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function field(label: string, child: React.ReactNode) { return <div><div style={labelStyle}>{label}</div>{child}</div>; }
const layout: React.CSSProperties = { display: "grid", gap: 16 };
const card: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 16 };
const title: React.CSSProperties = { fontSize: 16, fontWeight: 800, color: "#0f172a", marginBottom: 14 };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 };
const environmentNotice: React.CSSProperties = { marginBottom: 14, border: "1px solid #dbeafe", background: "#eff6ff", color: "#1d4ed8", borderRadius: 10, padding: "10px 12px", fontSize: 13, lineHeight: 1.5 };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 6 };
const input: React.CSSProperties = { width: "100%", minHeight: 38, padding: "8px 10px", borderRadius: 8, border: "1px solid #dbe4ee", boxSizing: "border-box" };
const primaryButton: React.CSSProperties = { border: "1px solid #0b5fff", background: "#0b5fff", color: "#fff", borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" };
const bannerStyle: React.CSSProperties = { marginBottom: 14, border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", borderRadius: 10, padding: "10px 12px", fontSize: 13, fontWeight: 600 };
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const th: React.CSSProperties = { textAlign: "left", padding: "10px 12px", fontSize: 12, fontWeight: 800, color: "#334155", borderBottom: "1px solid #e5e7eb", background: "#f8fafc" };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: 13, color: "#0f172a", borderBottom: "1px solid #eef2f7" };
const tdEmpty: React.CSSProperties = { padding: "16px 12px", fontSize: 13, color: "#64748b", borderBottom: "1px solid #eef2f7" };
const actionButton: React.CSSProperties = { border: "1px solid #dbe4ee", background: "#fff", color: "#0f172a", borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" };
