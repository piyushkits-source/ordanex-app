import React, { useEffect, useState } from "react";
import { apiFetch, parseApiError } from "../../../utils/api";

const API_BASE = "/client-config";

type ClientRow = {
  client_id: string;
  client_name: string;
  status?: string;
  subscription_type?: string | null;
  default_currency?: string | null;
  default_vendor?: string | null;
  default_sold_to?: string | null;
  default_ship_to?: string | null;
};

type Props = {
  client: ClientRow | null;
  onSaved: () => Promise<void> | void;
  onBanner: (text: string, type?: "success" | "error" | "info") => void;
};

const emptyForm: ClientRow = {
  client_id: "",
  client_name: "",
  status: "ACTIVE",
  subscription_type: "BASIC",
  default_currency: "",
  default_vendor: "",
  default_sold_to: "",
  default_ship_to: "",
};

export default function ClientMasterSection({ client, onSaved, onBanner }: Props) {
  const [form, setForm] = useState<ClientRow>(emptyForm);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (client) {
      setForm({
        client_id: client.client_id || "",
        client_name: client.client_name || "",
        status: client.status || "ACTIVE",
        subscription_type: client.subscription_type || "BASIC",
        default_currency: client.default_currency || "",
        default_vendor: client.default_vendor || "",
        default_sold_to: client.default_sold_to || "",
        default_ship_to: client.default_ship_to || "",
      });
    } else {
      setForm(emptyForm);
    }
  }, [client]);

  async function saveClient() {
    try {
      setLoading(true);
      if (!form.client_id.trim()) throw new Error("Client ID is required.");
      if (!form.client_name.trim()) throw new Error("Client Name is required.");

      const isEdit = !!client;
      const res = await apiFetch(
        isEdit
          ? `${API_BASE}/clients/${encodeURIComponent(client.client_id)}`
          : `${API_BASE}/clients`,
        {
          method: isEdit ? "PUT" : "POST",
          body: JSON.stringify({
            client_id: form.client_id.trim(),
            client_name: form.client_name.trim(),
            status: form.status || "ACTIVE",
            subscription_type: form.subscription_type || "BASIC",
            default_currency: form.default_currency || null,
            default_vendor: form.default_vendor || null,
            default_sold_to: form.default_sold_to || null,
            default_ship_to: form.default_ship_to || null,
          }),
        }
      );
      if (!res.ok) throw new Error(await parseApiError(res));
      onBanner(isEdit ? "Client master updated successfully." : "Client created successfully.", "success");
      await onSaved();
    } catch (err: any) {
      onBanner(err?.message || "Unable to save client master.", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div style={headerRow}>
        <div>
          <div style={title}>{client ? "Client Master" : "Create Client"}</div>
          <div style={subtitle}>Set commercial defaults, subscription tier, and identity for the client workspace.</div>
        </div>
        <div style={modePill}>{client ? "Edit" : "Create"}</div>
      </div>

      <div style={cardGrid}>
        <div style={heroCard}>
          <div style={heroLabel}>Client Profile</div>
          <div style={grid2}>
            {field("Client ID", <input value={form.client_id} disabled={!!client} onChange={(e) => setForm({ ...form, client_id: e.target.value.toUpperCase() })} style={!!client ? inputStyleDisabled : inputStyle} placeholder="e.g. DUPONT" />)}
            {field("Client Name", <input value={form.client_name || ""} onChange={(e) => setForm({ ...form, client_name: e.target.value })} style={inputStyle} placeholder="Enter client legal or business name" />)}
            {field("Status", <select value={form.status || "ACTIVE"} onChange={(e) => setForm({ ...form, status: e.target.value })} style={inputStyle}><option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option></select>)}
            {field("Subscription Type", <select value={form.subscription_type || "BASIC"} onChange={(e) => setForm({ ...form, subscription_type: e.target.value })} style={inputStyle}><option value="BASIC">BASIC</option><option value="STANDARD">STANDARD</option><option value="PREMIUM">PREMIUM</option><option value="ENTERPRISE">ENTERPRISE</option></select>)}
          </div>
        </div>

        <div style={sideCard}>
          <div style={heroLabel}>Workspace Defaults</div>
          <div style={grid2}>
            {field("Default Currency", <input value={form.default_currency || ""} onChange={(e) => setForm({ ...form, default_currency: e.target.value.toUpperCase() })} style={inputStyle} placeholder="USD / EUR / INR" />)}
            {field("Default Vendor", <input value={form.default_vendor || ""} onChange={(e) => setForm({ ...form, default_vendor: e.target.value })} style={inputStyle} placeholder="Optional supplier / vendor" />)}
            {field("Default Sold-To", <input value={form.default_sold_to || ""} onChange={(e) => setForm({ ...form, default_sold_to: e.target.value })} style={inputStyle} placeholder="Sold-to code" />)}
            {field("Default Ship-To", <input value={form.default_ship_to || ""} onChange={(e) => setForm({ ...form, default_ship_to: e.target.value })} style={inputStyle} placeholder="Ship-to code" />)}
          </div>
        </div>
      </div>

      <div style={buttonRow}>
        <button type="button" style={primaryButton} onClick={saveClient} disabled={loading}>
          {loading ? "Saving..." : client ? "Save Client Master" : "Create Client"}
        </button>
      </div>
    </div>
  );
}

function field(label: string, children: React.ReactNode) {
  return <div><div style={labelStyle}>{label}</div>{children}</div>;
}

const headerRow: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16, flexWrap: "wrap" };
const title: React.CSSProperties = { fontSize: 18, fontWeight: 800, color: "#0f172a" };
const subtitle: React.CSSProperties = { fontSize: 12, color: "#64748b", marginTop: 4 };
const modePill: React.CSSProperties = { border: "1px solid #dbe4ee", background: "#fff", color: "#334155", borderRadius: 999, padding: "6px 10px", fontSize: 12, fontWeight: 700 };
const cardGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16, alignItems: "start" };
const heroCard: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 14, background: "linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)", padding: 16 };
const sideCard: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 14, background: "#fff", padding: 16 };
const heroLabel: React.CSSProperties = { fontSize: 13, fontWeight: 800, color: "#334155", marginBottom: 14 };
const grid2: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 6 };
const inputStyle: React.CSSProperties = { width: "100%", minHeight: 40, padding: "8px 10px", borderRadius: 10, border: "1px solid #dbe4ee", background: "#fff", fontSize: 13, color: "#0f172a", outline: "none", boxSizing: "border-box" };
const inputStyleDisabled: React.CSSProperties = { ...inputStyle, background: "#f8fafc", color: "#64748b" };
const buttonRow: React.CSSProperties = { display: "flex", gap: 10, marginTop: 16 };
const primaryButton: React.CSSProperties = { border: "1px solid #0b5fff", background: "#0b5fff", color: "#fff", borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" };
