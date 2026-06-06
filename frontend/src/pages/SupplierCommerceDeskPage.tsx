import React, { useEffect, useMemo, useState } from "react";
import {
  fetchBuyerOrder,
  updateBuyerPortalCommerce,
  type BuyerPortalOrder,
  type BuyerPortalCommerceUpdate,
} from "../api/buyerPortalApi";
import { uploadPortalFile } from "../api/fileStorageApi";

type Props = {
  poId?: string;
};

const MAX_DOC_BYTES = 6 * 1024 * 1024;

function resolvePoId(explicitPoId?: string) {
  if (explicitPoId) return explicitPoId;
  if (typeof window === "undefined") return "";
  const parts = window.location.pathname.split("/").filter(Boolean);
  return parts[parts.length - 1] || "";
}

export default function SupplierCommerceDeskPage({ poId: propPoId }: Props) {
  const poId = useMemo(() => resolvePoId(propPoId), [propPoId]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [order, setOrder] = useState<BuyerPortalOrder | null>(null);
  const [form, setForm] = useState({
    invoice_number: "",
    invoice_date: "",
    invoice_amount: "",
    invoice_currency: "USD",
    due_date: "",
    payment_status: "",
    invoice_url: "",
    invoice_file_name: "",
    invoice_file_data_url: "",
    invoice_notes: "",
    shipment_number: "",
    shipment_status: "",
    carrier: "",
    tracking_number: "",
    tracking_url: "",
    shipment_document_name: "",
    shipment_document_url: "",
    shipment_document_data_url: "",
    ship_date: "",
    estimated_delivery_date: "",
    delivered_date: "",
    shipment_notes: "",
  });

  useEffect(() => {
    if (!poId) {
      setBanner("Missing order id in the supplier commerce route.");
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchBuyerOrder(poId)
      .then((row) => {
        setOrder(row);
        setForm({
          invoice_number: row.invoice?.invoice_number || "",
          invoice_date: row.invoice?.invoice_date || "",
          invoice_amount:
            row.invoice?.invoice_amount != null ? String(row.invoice.invoice_amount) : "",
          invoice_currency: row.invoice?.currency || "USD",
          due_date: row.invoice?.due_date || "",
          payment_status: row.invoice?.payment_status || row.payment_status || "",
          invoice_url: row.invoice?.invoice_url || "",
          invoice_file_name: row.invoice?.invoice_file_name || "",
          invoice_file_data_url: row.invoice?.invoice_file_data_url || "",
          invoice_notes: row.invoice?.invoice_notes || "",
          shipment_number: row.shipment?.shipment_number || "",
          shipment_status: row.shipment?.shipment_status || row.dispatch_status || "",
          carrier: row.shipment?.carrier || "",
          tracking_number: row.shipment?.tracking_number || "",
          tracking_url: row.shipment?.tracking_url || "",
          shipment_document_name: row.shipment?.shipment_document_name || "",
          shipment_document_url: row.shipment?.shipment_document_url || "",
          shipment_document_data_url: row.shipment?.shipment_document_data_url || "",
          ship_date: row.shipment?.ship_date || "",
          estimated_delivery_date: row.shipment?.estimated_delivery_date || "",
          delivered_date: row.shipment?.delivered_date || "",
          shipment_notes: row.shipment?.shipment_notes || "",
        });
      })
      .catch((err: any) => setBanner(err?.message || "Failed to load supplier commerce order."))
      .finally(() => setLoading(false));
  }, [poId]);

  async function handleDocumentUpload(
    file: File | null | undefined,
    kind: "invoice" | "shipment",
  ) {
    if (!file) return;
    if (file.size > MAX_DOC_BYTES) {
      setBanner("Document is too large. Use a file up to 6MB.");
      return;
    }
    const allowed =
      file.type === "application/pdf" ||
      file.type.startsWith("image/") ||
      /\.(pdf|png|jpe?g|webp)$/i.test(file.name);
    if (!allowed) {
      setBanner("Use PDF or image files for invoice and shipment documents.");
      return;
    }
    try {
      const uploaded = await uploadPortalFile({
        file,
        clientId: order?.client_id || null,
        orderId: poId || null,
        scope: kind === "invoice" ? "invoice-document" : "shipment-document",
      });
      if (kind === "invoice") {
        setForm((prev) => ({
          ...prev,
          invoice_file_name: uploaded.fileName || file.name,
          invoice_url: uploaded.fileUrl || prev.invoice_url,
          invoice_file_data_url: uploaded.fileDataUrl || "",
        }));
      } else {
        setForm((prev) => ({
          ...prev,
          shipment_document_name: uploaded.fileName || file.name,
          shipment_document_url: uploaded.fileUrl || prev.shipment_document_url,
          shipment_document_data_url: uploaded.fileDataUrl || "",
        }));
      }
      setBanner(
        `${uploaded.storageMode === "remote" ? "Uploaded" : "Attached"} ${kind === "invoice" ? "invoice" : "shipment"} document: ${uploaded.fileName || file.name}`,
      );
    } catch (err: any) {
      setBanner(err?.message || "Failed to read document.");
    }
  }

  async function saveCommerce() {
    if (!poId) return;
    try {
      setSaving(true);
      setBanner(null);
      const payload: BuyerPortalCommerceUpdate = {
        invoice: {
          invoice_number: form.invoice_number || null,
          invoice_date: form.invoice_date || null,
          invoice_amount: form.invoice_amount ? Number(form.invoice_amount) : null,
          currency: form.invoice_currency || null,
          due_date: form.due_date || null,
          payment_status: form.payment_status || null,
          invoice_url: form.invoice_url || null,
          invoice_file_name: form.invoice_file_name || null,
          invoice_file_data_url: form.invoice_file_data_url || null,
          invoice_notes: form.invoice_notes || null,
        },
        shipment: {
          shipment_number: form.shipment_number || null,
          shipment_status: form.shipment_status || null,
          carrier: form.carrier || null,
          tracking_number: form.tracking_number || null,
          tracking_url: form.tracking_url || null,
          shipment_document_name: form.shipment_document_name || null,
          shipment_document_url: form.shipment_document_url || null,
          shipment_document_data_url: form.shipment_document_data_url || null,
          ship_date: form.ship_date || null,
          estimated_delivery_date: form.estimated_delivery_date || null,
          delivered_date: form.delivered_date || null,
          shipment_notes: form.shipment_notes || null,
        },
      };
      const updated = await updateBuyerPortalCommerce(poId, payload);
      setOrder(updated);
      setBanner("Supplier commerce updates saved successfully.");
    } catch (err: any) {
      setBanner(err?.message || "Failed to save supplier commerce updates.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div style={shell}><div style={card}>Loading supplier commerce desk...</div></div>;
  }

  return (
    <div style={shell}>
      <div style={container}>
        <div style={headerCard}>
          <div>
            <div style={eyebrow}>Supplier commerce desk</div>
            <div style={title}>Invoice, shipment, and document updates</div>
            <div style={subtitle}>
              Maintain invoice PDFs, shipment documents, tracking information, and payment status for portal-managed supplier orders.
            </div>
          </div>
          <div style={orderBadge}>
            {order?.po_number || poId}
          </div>
        </div>

        {banner ? <div style={bannerBox}>{banner}</div> : null}

        <div style={grid}>
          <section style={card}>
            <div style={sectionTitle}>Order summary</div>
            <div style={summaryGrid}>
              <div><strong>Order:</strong> {order?.po_number || order?.po_id || "-"}</div>
              <div><strong>Status:</strong> {order?.status || "NEW"}</div>
              <div><strong>Supplier:</strong> {order?.supplier_name || "-"}</div>
              <div><strong>Client:</strong> {order?.client_id || "-"}</div>
            </div>
          </section>

          <section style={card}>
            <div style={sectionTitle}>Invoice details</div>
            <div style={formGrid}>
              <input style={field} placeholder="Invoice number" value={form.invoice_number} onChange={(e) => setForm((prev) => ({ ...prev, invoice_number: e.target.value }))} />
              <input style={field} type="date" value={form.invoice_date} onChange={(e) => setForm((prev) => ({ ...prev, invoice_date: e.target.value }))} />
              <input style={field} type="number" min="0" step="0.01" placeholder="Invoice amount" value={form.invoice_amount} onChange={(e) => setForm((prev) => ({ ...prev, invoice_amount: e.target.value }))} />
              <input style={field} placeholder="Currency" value={form.invoice_currency} onChange={(e) => setForm((prev) => ({ ...prev, invoice_currency: e.target.value.toUpperCase() }))} />
              <input style={field} type="date" value={form.due_date} onChange={(e) => setForm((prev) => ({ ...prev, due_date: e.target.value }))} />
              <input style={field} placeholder="Payment status" value={form.payment_status} onChange={(e) => setForm((prev) => ({ ...prev, payment_status: e.target.value }))} />
              <input style={{ ...field, gridColumn: "1 / -1" }} placeholder="Invoice URL" value={form.invoice_url} onChange={(e) => setForm((prev) => ({ ...prev, invoice_url: e.target.value }))} />
              <textarea style={{ ...field, minHeight: 96, gridColumn: "1 / -1", resize: "vertical" }} placeholder="Invoice notes" value={form.invoice_notes} onChange={(e) => setForm((prev) => ({ ...prev, invoice_notes: e.target.value }))} />
            </div>
            <div style={uploadRow}>
              <label style={uploadButton}>
                Upload invoice PDF / image
                <input type="file" accept="application/pdf,image/*" hidden onChange={(e) => void handleDocumentUpload(e.target.files?.[0], "invoice")} />
              </label>
              {form.invoice_file_name ? <span style={docLabel}>Attached: {form.invoice_file_name}</span> : null}
              {form.invoice_url || form.invoice_file_data_url ? (
                <a href={form.invoice_url || form.invoice_file_data_url || "#"} target="_blank" rel="noreferrer" style={linkButton}>
                  Open invoice document
                </a>
              ) : null}
            </div>
          </section>

          <section style={card}>
            <div style={sectionTitle}>Shipment details</div>
            <div style={formGrid}>
              <input style={field} placeholder="Shipment number" value={form.shipment_number} onChange={(e) => setForm((prev) => ({ ...prev, shipment_number: e.target.value }))} />
              <input style={field} placeholder="Shipment status" value={form.shipment_status} onChange={(e) => setForm((prev) => ({ ...prev, shipment_status: e.target.value }))} />
              <input style={field} placeholder="Carrier" value={form.carrier} onChange={(e) => setForm((prev) => ({ ...prev, carrier: e.target.value }))} />
              <input style={field} placeholder="Tracking number" value={form.tracking_number} onChange={(e) => setForm((prev) => ({ ...prev, tracking_number: e.target.value }))} />
              <input style={{ ...field, gridColumn: "1 / -1" }} placeholder="Tracking URL" value={form.tracking_url} onChange={(e) => setForm((prev) => ({ ...prev, tracking_url: e.target.value }))} />
              <input style={field} type="date" value={form.ship_date} onChange={(e) => setForm((prev) => ({ ...prev, ship_date: e.target.value }))} />
              <input style={field} type="date" value={form.estimated_delivery_date} onChange={(e) => setForm((prev) => ({ ...prev, estimated_delivery_date: e.target.value }))} />
              <input style={{ ...field, gridColumn: "1 / -1" }} type="date" value={form.delivered_date} onChange={(e) => setForm((prev) => ({ ...prev, delivered_date: e.target.value }))} />
              <input style={{ ...field, gridColumn: "1 / -1" }} placeholder="Shipment document URL" value={form.shipment_document_url} onChange={(e) => setForm((prev) => ({ ...prev, shipment_document_url: e.target.value }))} />
              <textarea style={{ ...field, minHeight: 96, gridColumn: "1 / -1", resize: "vertical" }} placeholder="Shipment notes" value={form.shipment_notes} onChange={(e) => setForm((prev) => ({ ...prev, shipment_notes: e.target.value }))} />
            </div>
            <div style={uploadRow}>
              <label style={uploadButton}>
                Upload shipment document
                <input type="file" accept="application/pdf,image/*" hidden onChange={(e) => void handleDocumentUpload(e.target.files?.[0], "shipment")} />
              </label>
              {form.shipment_document_name ? <span style={docLabel}>Attached: {form.shipment_document_name}</span> : null}
              {form.shipment_document_url || form.shipment_document_data_url ? (
                <a href={form.shipment_document_url || form.shipment_document_data_url || "#"} target="_blank" rel="noreferrer" style={linkButton}>
                  Open shipment document
                </a>
              ) : null}
            </div>
          </section>
        </div>

        <div style={footerRow}>
          <button type="button" onClick={saveCommerce} disabled={saving} style={primaryButton}>
            {saving ? "Saving..." : "Save commerce updates"}
          </button>
        </div>
      </div>
    </div>
  );
}

const shell: React.CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at top left, rgba(37, 99, 235, 0.08), transparent 30%), linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)",
  padding: 24,
};

const container: React.CSSProperties = {
  maxWidth: 1200,
  margin: "0 auto",
  display: "grid",
  gap: 16,
};

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 20,
  padding: 20,
  boxShadow: "0 16px 48px rgba(15, 23, 42, 0.06)",
};

const headerCard: React.CSSProperties = {
  ...card,
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "start",
  flexWrap: "wrap",
};

const eyebrow: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  color: "#2563eb",
  textTransform: "uppercase",
  letterSpacing: 0.08,
};

const title: React.CSSProperties = {
  marginTop: 8,
  fontSize: 30,
  fontWeight: 900,
  color: "#0f172a",
  lineHeight: 1.1,
};

const subtitle: React.CSSProperties = {
  marginTop: 10,
  color: "#64748b",
  lineHeight: 1.7,
  maxWidth: 760,
};

const orderBadge: React.CSSProperties = {
  borderRadius: 999,
  padding: "10px 14px",
  background: "#eff6ff",
  color: "#1d4ed8",
  fontWeight: 800,
  fontSize: 13,
};

const bannerBox: React.CSSProperties = {
  ...card,
  borderColor: "#c7d2fe",
  background: "#eff6ff",
  color: "#1d4ed8",
  fontWeight: 700,
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 16,
  alignItems: "start",
};

const sectionTitle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 900,
  color: "#0f172a",
  marginBottom: 14,
};

const summaryGrid: React.CSSProperties = {
  display: "grid",
  gap: 10,
  color: "#475569",
  lineHeight: 1.6,
};

const formGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const field: React.CSSProperties = {
  width: "100%",
  maxWidth: "100%",
  border: "1px solid #dbe2ea",
  borderRadius: 12,
  padding: "12px 13px",
  minHeight: 46,
  fontSize: 14,
  lineHeight: 1.4,
  outline: "none",
  background: "#fff",
  boxSizing: "border-box",
};

const uploadRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
  marginTop: 14,
};

const uploadButton: React.CSSProperties = {
  border: "1px solid #1d4ed8",
  background: "#eff6ff",
  color: "#1d4ed8",
  borderRadius: 12,
  padding: "10px 14px",
  fontWeight: 800,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
};

const docLabel: React.CSSProperties = {
  color: "#475569",
  fontSize: 13,
  fontWeight: 700,
};

const linkButton: React.CSSProperties = {
  color: "#1d4ed8",
  textDecoration: "none",
  fontWeight: 800,
  fontSize: 13,
};

const footerRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
};

const primaryButton: React.CSSProperties = {
  border: "1px solid #0b5fff",
  background: "#0b5fff",
  color: "#fff",
  borderRadius: 12,
  padding: "12px 16px",
  fontWeight: 800,
  cursor: "pointer",
};
