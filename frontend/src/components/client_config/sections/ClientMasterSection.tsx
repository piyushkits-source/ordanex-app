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

type ClientProfileDetails = {
  legal_tax: {
    legal_entity_name?: string;
    registration_number?: string;
    tax_registration_id?: string;
    country?: string;
    region?: string;
    registered_address?: string;
  };
  billing_invoicing: {
    invoice_recipient?: string;
    billing_email?: string;
    payment_terms?: string;
    default_payment_mode?: string;
    billing_currency?: string;
    billing_address?: string;
  };
  banking_remittance: {
    beneficiary_name?: string;
    bank_name?: string;
    account_number?: string;
    iban?: string;
    swift_code?: string;
    remittance_email?: string;
    remittance_notes?: string;
  };
};

type Props = {
  client: ClientRow | null;
  readOnly?: boolean;
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

const emptyProfileDetails: ClientProfileDetails = {
  legal_tax: {
    legal_entity_name: "",
    registration_number: "",
    tax_registration_id: "",
    country: "",
    region: "",
    registered_address: "",
  },
  billing_invoicing: {
    invoice_recipient: "",
    billing_email: "",
    payment_terms: "",
    default_payment_mode: "",
    billing_currency: "",
    billing_address: "",
  },
  banking_remittance: {
    beneficiary_name: "",
    bank_name: "",
    account_number: "",
    iban: "",
    swift_code: "",
    remittance_email: "",
    remittance_notes: "",
  },
};

export default function ClientMasterSection({ client, readOnly = false, onSaved, onBanner }: Props) {
  const [form, setForm] = useState<ClientRow>(emptyForm);
  const [profileDetails, setProfileDetails] = useState<ClientProfileDetails>(emptyProfileDetails);
  const [loading, setLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);

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
      setProfileDetails(emptyProfileDetails);
    }
  }, [client]);

  useEffect(() => {
    if (!client?.client_id) return;
    loadProfileDetails(client.client_id);
  }, [client?.client_id]);

  async function loadProfileDetails(clientId: string) {
    try {
      setDetailsLoading(true);
      const res = await apiFetch(`${API_BASE}/client-profile-details/${encodeURIComponent(clientId)}`, { method: "GET" });
      if (!res.ok) throw new Error(await parseApiError(res));
      const data = await res.json();
      setProfileDetails({
        legal_tax: { ...emptyProfileDetails.legal_tax, ...(data?.legal_tax || {}) },
        billing_invoicing: { ...emptyProfileDetails.billing_invoicing, ...(data?.billing_invoicing || {}) },
        banking_remittance: { ...emptyProfileDetails.banking_remittance, ...(data?.banking_remittance || {}) },
      });
    } catch (err: any) {
      onBanner(err?.message || "Unable to load client legal, billing, and banking details.", "error");
    } finally {
      setDetailsLoading(false);
    }
  }

  async function saveClient() {
    try {
      if (readOnly) {
        onBanner("Client master is read-only in Production. Switch to Staging to make changes.", "info");
        return;
      }
      setLoading(true);
      if (!form.client_id.trim()) throw new Error("Client ID is required.");
      if (!form.client_name.trim()) throw new Error("Client Name is required.");

      const clientId = form.client_id.trim();
      const isEdit = !!client;
      const res = await apiFetch(
        isEdit
          ? `${API_BASE}/clients/${encodeURIComponent(client.client_id)}`
          : `${API_BASE}/clients`,
        {
          method: isEdit ? "PUT" : "POST",
          body: JSON.stringify({
            client_id: clientId,
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

      const detailRes = await apiFetch(`${API_BASE}/client-profile-details/${encodeURIComponent(clientId)}`, {
        method: "PUT",
        body: JSON.stringify(profileDetails),
      });
      if (!detailRes.ok) throw new Error(await parseApiError(detailRes));

      onBanner(
        isEdit
          ? "Client master, legal, billing, and banking details updated successfully."
          : "Client created successfully with legal, billing, and banking details.",
        "success"
      );
      await onSaved();
    } catch (err: any) {
      onBanner(err?.message || "Unable to save client master.", "error");
    } finally {
      setLoading(false);
    }
  }

  function setLegalTax<K extends keyof ClientProfileDetails["legal_tax"]>(key: K, value: string) {
    setProfileDetails((current) => ({ ...current, legal_tax: { ...current.legal_tax, [key]: value } }));
  }

  function setBilling<K extends keyof ClientProfileDetails["billing_invoicing"]>(key: K, value: string) {
    setProfileDetails((current) => ({ ...current, billing_invoicing: { ...current.billing_invoicing, [key]: value } }));
  }

  function setBanking<K extends keyof ClientProfileDetails["banking_remittance"]>(key: K, value: string) {
    setProfileDetails((current) => ({ ...current, banking_remittance: { ...current.banking_remittance, [key]: value } }));
  }

  return (
    <div>
      {readOnly ? <div style={readOnlyBanner}>Production is read-only for Client Master changes. Use Staging for edits and controlled promotion.</div> : null}
      <fieldset style={editorFieldset} disabled={readOnly || loading}>
      <div style={headerRow}>
        <div>
          <div style={title}>{client ? "Client Master" : "Create Client"}</div>
          <div style={subtitle}>Set commercial defaults, subscription tier, legal entity, billing, and remittance setup for the client workspace.</div>
        </div>
        <div style={modePill}>{client ? "Edit" : "Create"}</div>
      </div>

      <div style={cardGrid}>
        <div style={heroCard}>
          <div style={heroLabel}>Client Profile</div>
          <div style={grid2}>
            {field("Client ID", <input value={form.client_id} disabled={!!client} onChange={(e) => setForm({ ...form, client_id: e.target.value.toUpperCase() })} style={!!client ? inputStyleDisabled : inputStyle} placeholder="e.g. CLIENT_US_01" />)}
            {field("Client Name", <input value={form.client_name || ""} onChange={(e) => setForm({ ...form, client_name: e.target.value })} style={inputStyle} placeholder="Enter client legal or business name" />)}
            {field("Status", <select value={form.status || "ACTIVE"} onChange={(e) => setForm({ ...form, status: e.target.value })} style={inputStyle}><option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option></select>)}
            {field("Subscription Type", <select value={form.subscription_type || "BASIC"} onChange={(e) => setForm({ ...form, subscription_type: e.target.value })} style={inputStyle}><option value="BASIC">BASIC</option><option value="STANDARD">STANDARD</option><option value="PREMIUM">PREMIUM</option><option value="ENTERPRISE">ENTERPRISE</option></select>)}
          </div>
        </div>

        <div style={sideCard}>
          <div style={heroLabel}>Workspace Defaults</div>
          <div style={helperCallout}>
            Optional fallback values used only when inbound documents omit these identifiers. They do not replace Trading Partner setup, connections, or partner-specific mappings.
          </div>
          <div style={grid2}>
            {field("Default Currency", <input value={form.default_currency || ""} onChange={(e) => setForm({ ...form, default_currency: e.target.value.toUpperCase() })} style={inputStyle} placeholder="3-letter code, e.g. USD" />)}
            {field("Default Vendor / Supplier", <input value={form.default_vendor || ""} onChange={(e) => setForm({ ...form, default_vendor: e.target.value })} style={inputStyle} placeholder="Optional vendor code, e.g. VEND_1001" />)}
            {field("Default Sold-To", <input value={form.default_sold_to || ""} onChange={(e) => setForm({ ...form, default_sold_to: e.target.value })} style={inputStyle} placeholder="Optional sold-to code, e.g. SOLD_TO_001" />)}
            {field("Default Ship-To", <input value={form.default_ship_to || ""} onChange={(e) => setForm({ ...form, default_ship_to: e.target.value })} style={inputStyle} placeholder="Optional ship-to code, e.g. SHIP_TO_001" />)}
          </div>
        </div>
      </div>

      <div style={detailsGrid}>
        <div style={detailCard}>
          <div style={detailHeader}>
            <div>
              <div style={detailTitle}>Legal & Tax</div>
              <div style={detailSubtitle}>Legal entity details used for contracts, taxation, and invoice identity.</div>
            </div>
          </div>
          <div style={grid2}>
            {field("Legal Entity Name", <input value={profileDetails.legal_tax.legal_entity_name || ""} onChange={(e) => setLegalTax("legal_entity_name", e.target.value)} style={inputStyle} placeholder="Registered legal entity name" />)}
            {field("Registration Number", <input value={profileDetails.legal_tax.registration_number || ""} onChange={(e) => setLegalTax("registration_number", e.target.value)} style={inputStyle} placeholder="Company registration number" />)}
            {field("Tax Registration ID", <input value={profileDetails.legal_tax.tax_registration_id || ""} onChange={(e) => setLegalTax("tax_registration_id", e.target.value)} style={inputStyle} placeholder="GST / VAT / EIN / PAN" />)}
            {field("Country", <input value={profileDetails.legal_tax.country || ""} onChange={(e) => setLegalTax("country", e.target.value)} style={inputStyle} placeholder="Country" />)}
            {field("Region", <input value={profileDetails.legal_tax.region || ""} onChange={(e) => setLegalTax("region", e.target.value)} style={inputStyle} placeholder="Region / State / Province" />)}
            {field("Registered Address", <textarea value={profileDetails.legal_tax.registered_address || ""} onChange={(e) => setLegalTax("registered_address", e.target.value)} style={textAreaStyle} placeholder="Registered address used on formal documents" />)}
          </div>
        </div>

        <div style={detailCard}>
          <div style={detailHeader}>
            <div>
              <div style={detailTitle}>Billing & Invoicing</div>
              <div style={detailSubtitle}>Invoice recipient, payment terms, billing email, payment mode, and billing address for Ordanex-issued invoices.</div>
            </div>
          </div>
          <div style={grid2}>
            {field("Invoice Recipient", <input value={profileDetails.billing_invoicing.invoice_recipient || ""} onChange={(e) => setBilling("invoice_recipient", e.target.value)} style={inputStyle} placeholder="Accounts payable / invoice recipient" />)}
            {field("Billing Email", <input value={profileDetails.billing_invoicing.billing_email || ""} onChange={(e) => setBilling("billing_email", e.target.value)} style={inputStyle} placeholder="billing@client.com" />)}
            {field("Payment Terms", <input value={profileDetails.billing_invoicing.payment_terms || ""} onChange={(e) => setBilling("payment_terms", e.target.value)} style={inputStyle} placeholder="e.g. Net 30" />)}
            {field("Default Payment Mode", <select value={profileDetails.billing_invoicing.default_payment_mode || ""} onChange={(e) => setBilling("default_payment_mode", e.target.value)} style={inputStyle}><option value="">Select payment mode</option><option value="BANK_TRANSFER">Bank Transfer</option><option value="ACH">ACH</option><option value="WIRE">Wire</option><option value="CARD">Card</option><option value="CHEQUE">Cheque</option></select>)}
            {field("Billing Currency", <input value={profileDetails.billing_invoicing.billing_currency || ""} onChange={(e) => setBilling("billing_currency", e.target.value.toUpperCase())} style={inputStyle} placeholder="3-letter code, e.g. USD" />)}
            {field("Billing Address", <textarea value={profileDetails.billing_invoicing.billing_address || ""} onChange={(e) => setBilling("billing_address", e.target.value)} style={textAreaStyle} placeholder="Billing address shown on Ordanex invoices" />)}
          </div>
        </div>

        <div style={detailCard}>
          <div style={detailHeader}>
            <div>
              <div style={detailTitle}>Banking & Remittance</div>
              <div style={detailSubtitle}>Bank and remittance details Ordanex should use while issuing invoices and collecting payment.</div>
            </div>
            {detailsLoading ? <div style={loadingChip}>Loading saved details...</div> : null}
          </div>
          <div style={grid2}>
            {field("Beneficiary Name", <input value={profileDetails.banking_remittance.beneficiary_name || ""} onChange={(e) => setBanking("beneficiary_name", e.target.value)} style={inputStyle} placeholder="Legal beneficiary / account holder name" />)}
            {field("Bank Name", <input value={profileDetails.banking_remittance.bank_name || ""} onChange={(e) => setBanking("bank_name", e.target.value)} style={inputStyle} placeholder="Receiving bank name" />)}
            {field("Account Number", <input value={profileDetails.banking_remittance.account_number || ""} onChange={(e) => setBanking("account_number", e.target.value)} style={inputStyle} placeholder="Bank account number" />)}
            {field("IBAN", <input value={profileDetails.banking_remittance.iban || ""} onChange={(e) => setBanking("iban", e.target.value.toUpperCase())} style={inputStyle} placeholder="IBAN if applicable" />)}
            {field("SWIFT / BIC", <input value={profileDetails.banking_remittance.swift_code || ""} onChange={(e) => setBanking("swift_code", e.target.value.toUpperCase())} style={inputStyle} placeholder="SWIFT / BIC code" />)}
            {field("Remittance Email", <input value={profileDetails.banking_remittance.remittance_email || ""} onChange={(e) => setBanking("remittance_email", e.target.value)} style={inputStyle} placeholder="remittance@client.com" />)}
            <div style={{ gridColumn: "1 / -1" }}>
              {field("Remittance Notes", <textarea value={profileDetails.banking_remittance.remittance_notes || ""} onChange={(e) => setBanking("remittance_notes", e.target.value)} style={textAreaStyle} placeholder="Payment instructions, beneficiary notes, or remittance guidance" />)}
            </div>
          </div>
        </div>
      </div>

      <div style={buttonRow}>
        <button type="button" style={primaryButton} onClick={saveClient} disabled={readOnly || loading}>
          {readOnly ? "Production is read-only" : loading ? "Saving..." : client ? "Save Client Master" : "Create Client"}
        </button>
      </div>
      </fieldset>
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
const detailsGrid: React.CSSProperties = { display: "grid", gap: 16, marginTop: 16 };
const detailCard: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 14, background: "#fff", padding: 16 };
const detailHeader: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14, flexWrap: "wrap" };
const detailTitle: React.CSSProperties = { fontSize: 14, fontWeight: 800, color: "#0f172a" };
const detailSubtitle: React.CSSProperties = { fontSize: 12, color: "#64748b", marginTop: 4, lineHeight: 1.5 };
const loadingChip: React.CSSProperties = { border: "1px solid #dbeafe", background: "#eff6ff", color: "#1d4ed8", borderRadius: 999, padding: "6px 10px", fontSize: 11, fontWeight: 700 };
const heroLabel: React.CSSProperties = { fontSize: 13, fontWeight: 800, color: "#334155", marginBottom: 14 };
const helperCallout: React.CSSProperties = { marginBottom: 14, border: "1px solid #dbeafe", background: "#eff6ff", color: "#1d4ed8", borderRadius: 10, padding: "10px 12px", fontSize: 12, lineHeight: 1.6 };
const grid2: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 6 };
const inputStyle: React.CSSProperties = { width: "100%", minHeight: 40, padding: "8px 10px", borderRadius: 10, border: "1px solid #dbe4ee", background: "#fff", fontSize: 13, color: "#0f172a", outline: "none", boxSizing: "border-box" };
const inputStyleDisabled: React.CSSProperties = { ...inputStyle, background: "#f8fafc", color: "#64748b" };
const textAreaStyle: React.CSSProperties = { ...inputStyle, minHeight: 88, resize: "vertical" as const };
const buttonRow: React.CSSProperties = { display: "flex", gap: 10, marginTop: 16 };
const primaryButton: React.CSSProperties = { border: "1px solid #0b5fff", background: "#0b5fff", color: "#fff", borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" };

const editorFieldset: React.CSSProperties = { border: 0, padding: 0, margin: 0, minInlineSize: 0 };
const readOnlyBanner: React.CSSProperties = { marginBottom: 14, border: "1px solid #fecaca", borderRadius: 10, padding: "10px 12px", fontSize: 13, fontWeight: 600, color: "#b91c1c", background: "#fef2f2" };
