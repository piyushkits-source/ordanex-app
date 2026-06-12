import { useEffect, useMemo, useState } from "react";
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

type UserFormState = {
  client_id: string;
  email: string;
  password: string;
  role: string;
  environment: string;
  is_active: boolean;
};

function buildEmptyForm(environment: string, defaultClientId: string, isSuperAdmin: boolean): UserFormState {
  return {
    client_id: defaultClientId,
    email: "",
    password: "",
    role: isSuperAdmin ? "client_admin" : "business_user",
    environment,
    is_active: true,
  };
}

export default function UsersPage() {
  const auth = getAuth();
  const { scope } = useAppScope();
  const isSuperAdmin = String(auth?.role || "").toLowerCase() === "super_admin";
  const lockedClientId = String(auth?.client_id || "").trim();
  const scopeEnvironment =
    String(scope.environment || auth?.environment || "PROD").toUpperCase() === "PROD" ? "production" : "staging";

  const [rows, setRows] = useState<UserRow[]>([]);
  const [banner, setBanner] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingEmail, setEditingEmail] = useState("");
  const [form, setForm] = useState<UserFormState>(() => buildEmptyForm(scopeEnvironment, lockedClientId, isSuperAdmin));

  useEffect(() => {
    setForm((current) => ({
      ...current,
      environment: scopeEnvironment,
      client_id: isSuperAdmin ? current.client_id : lockedClientId,
    }));
  }, [scopeEnvironment, lockedClientId, isSuperAdmin]);

  const environmentLabel = form.environment === "production" ? "Production" : "Staging";
  const roleOptions = useMemo(
    () => (isSuperAdmin ? ["super_admin", "client_admin", "it_admin", "business_user"] : ["client_admin", "it_admin", "business_user"]),
    [isSuperAdmin],
  );

  useEffect(() => {
    void loadUsers();
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

  function resetForm(nextEnvironment = form.environment) {
    setEditingEmail("");
    setForm(buildEmptyForm(nextEnvironment, lockedClientId, isSuperAdmin));
  }

  async function saveUser() {
    try {
      const payload = {
        client_id: isSuperAdmin ? form.client_id || null : lockedClientId || null,
        email: form.email,
        password: form.password,
        role: form.role,
        environment: form.environment,
        is_active: form.is_active,
      };

      const res = editingEmail
        ? await apiFetch(`${API_BASE}/${encodeURIComponent(editingEmail)}?environment=${encodeURIComponent(form.environment)}`, {
            method: "PUT",
            body: JSON.stringify({
              client_id: payload.client_id,
              password: form.password || undefined,
              role: form.role,
              is_active: form.is_active,
            }),
          })
        : await apiFetch(API_BASE, { method: "POST", body: JSON.stringify(payload) });

      if (!res.ok) throw new Error(await parseApiError(res));

      setBanner(editingEmail ? `User updated successfully in ${environmentLabel}.` : `User created successfully in ${environmentLabel}.`);
      resetForm(form.environment);
      await loadUsers();
    } catch (err: any) {
      setBanner(err?.message || (editingEmail ? "Unable to update user." : "Unable to create user."));
    }
  }

  function startEdit(row: UserRow) {
    setEditingEmail(row.email);
    setForm({
      client_id: row.client_id || lockedClientId,
      email: row.email,
      password: "",
      role: row.role,
      environment: String(row.environment || form.environment || scopeEnvironment).toLowerCase(),
      is_active: row.is_active,
    });
    setBanner(`Editing ${row.email}. Leave password blank to keep the current password.`);
  }

  async function toggleActive(email: string, is_active: boolean) {
    try {
      const res = await apiFetch(
        `${API_BASE}/${encodeURIComponent(email)}/active?environment=${encodeURIComponent(form.environment)}`,
        { method: "PUT", body: JSON.stringify({ is_active: !is_active }) },
      );
      if (!res.ok) throw new Error(await parseApiError(res));
      setBanner("User status updated.");
      await loadUsers();
    } catch (err: any) {
      setBanner(err?.message || "Unable to update user status.");
    }
  }

  async function deleteUser(email: string) {
    if (typeof window !== "undefined" && !window.confirm(`Delete user ${email}?`)) {
      return;
    }
    try {
      const res = await apiFetch(
        `${API_BASE}/${encodeURIComponent(email)}?environment=${encodeURIComponent(form.environment)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error(await parseApiError(res));
      if (editingEmail === email) {
        resetForm(form.environment);
      }
      setBanner("User deleted.");
      await loadUsers();
    } catch (err: any) {
      setBanner(err?.message || "Unable to delete user.");
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
      <PageHeader
        title="User Management"
        subtitle={`Create users for the active ${environmentLabel} workspace and keep Production and Staging access separate.`}
      />
      {banner ? <div style={bannerStyle}>{banner}</div> : null}

      <div style={layout}>
        <div style={card}>
          <div style={title}>{editingEmail ? "Update User" : "Create User"}</div>
          <div style={environmentNotice}>
            Users created from this screen are scoped to <strong>{environmentLabel}</strong> and can only access {environmentLabel.toLowerCase()} data.
          </div>
          <div style={grid}>
            {field(
              "Client ID",
              <input
                value={form.client_id}
                onChange={(e) => setForm({ ...form, client_id: e.target.value })}
                style={input}
                disabled={!isSuperAdmin}
                placeholder={isSuperAdmin ? "Client ID" : lockedClientId || "Assigned from your login"}
              />,
            )}
            {field(
              "Email",
              <input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                style={input}
                disabled={Boolean(editingEmail)}
              />,
            )}
            {field(
              "Password",
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                style={input}
                placeholder={editingEmail ? "Leave blank to keep current password" : "Enter password"}
              />,
            )}
            {field(
              "Role",
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} style={input}>
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>,
            )}
            {field(
              "Environment",
              <select value={form.environment} onChange={(e) => setForm({ ...form, environment: e.target.value })} style={input}>
                <option value="production">Production</option>
                <option value="staging">Staging</option>
              </select>,
            )}
          </div>
          <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" style={primaryButton} onClick={saveUser}>
              {editingEmail ? "Save Changes" : "Create User"}
            </button>
            {editingEmail ? (
              <button type="button" style={secondaryButton} onClick={() => resetForm(form.environment)}>
                Cancel Edit
              </button>
            ) : null}
          </div>
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
                {loading ? (
                  <tr>
                    <td colSpan={7} style={tdEmpty}>Loading...</td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={tdEmpty}>No users found.</td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.email}>
                      <td style={td}>{row.email}</td>
                      <td style={td}>{row.client_id || "-"}</td>
                      <td style={td}>{String(row.environment || form.environment).toUpperCase()}</td>
                      <td style={td}>{row.role}</td>
                      <td style={td}>{row.is_active ? "ACTIVE" : "INACTIVE"}</td>
                      <td style={td}>{formatLastLogin(row.last_login_at)}</td>
                      <td style={td}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button type="button" style={actionButton} onClick={() => startEdit(row)}>
                            Edit
                          </button>
                          <button type="button" style={actionButton} onClick={() => void toggleActive(row.email, row.is_active)}>
                            {row.is_active ? "Deactivate" : "Activate"}
                          </button>
                          <button type="button" style={dangerButton} onClick={() => void deleteUser(row.email)}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function field(label: string, child: React.ReactNode) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      {child}
    </div>
  );
}

const layout: React.CSSProperties = { display: "grid", gap: 16 };
const card: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 16 };
const title: React.CSSProperties = { fontSize: 16, fontWeight: 800, color: "#0f172a", marginBottom: 14 };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 };
const environmentNotice: React.CSSProperties = { marginBottom: 14, border: "1px solid #dbeafe", background: "#eff6ff", color: "#1d4ed8", borderRadius: 10, padding: "10px 12px", fontSize: 13, lineHeight: 1.5 };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 6 };
const input: React.CSSProperties = { width: "100%", minHeight: 38, padding: "8px 10px", borderRadius: 8, border: "1px solid #dbe4ee", boxSizing: "border-box" };
const primaryButton: React.CSSProperties = { border: "1px solid #0b5fff", background: "#0b5fff", color: "#fff", borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" };
const secondaryButton: React.CSSProperties = { border: "1px solid #dbe4ee", background: "#fff", color: "#0f172a", borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" };
const bannerStyle: React.CSSProperties = { marginBottom: 14, border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", borderRadius: 10, padding: "10px 12px", fontSize: 13, fontWeight: 600 };
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const th: React.CSSProperties = { textAlign: "left", padding: "10px 12px", fontSize: 12, fontWeight: 800, color: "#334155", borderBottom: "1px solid #e5e7eb", background: "#f8fafc" };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: 13, color: "#0f172a", borderBottom: "1px solid #eef2f7", verticalAlign: "top" };
const tdEmpty: React.CSSProperties = { padding: "16px 12px", fontSize: 13, color: "#64748b", borderBottom: "1px solid #eef2f7" };
const actionButton: React.CSSProperties = { border: "1px solid #dbe4ee", background: "#fff", color: "#0f172a", borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" };
const dangerButton: React.CSSProperties = { border: "1px solid #fecaca", background: "#fff", color: "#b91c1c", borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" };
