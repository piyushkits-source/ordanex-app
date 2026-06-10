import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchBuyerOrders, type BuyerPortalOrder } from "../api/buyerPortalApi";

type Props = {
  clientId?: string;
};

function resolveClientId(explicitClientId?: string) {
  if (explicitClientId) return explicitClientId;
  if (typeof window === "undefined") return "";
  const parts = window.location.pathname.split("/").filter(Boolean);
  return parts[parts.length - 2] || "";
}

function resolvePortalEnvironment(explicitEnvironment?: string) {
  const normalized = String(explicitEnvironment || "").trim().toLowerCase();
  if (normalized === "staging" || normalized === "stage" || normalized === "stg") return "staging";
  return "production";
}

function statusColors(status?: string | null) {
  const value = String(status || "").toUpperCase();
  if (value.includes("ERROR") || value.includes("FAIL")) {
    return { bg: "#fef2f2", fg: "#b91c1c" };
  }
  if (value.includes("PEND") || value.includes("NEW") || value.includes("HOLD")) {
    return { bg: "#fffbeb", fg: "#b45309" };
  }
  return { bg: "#f0fdf4", fg: "#15803d" };
}

export default function SupplierOrdersPage({ clientId: propClientId }: Props) {
  const params = useParams<{ clientId?: string; environment?: string }>();
  const clientId = useMemo(
    () => propClientId || params.clientId || resolveClientId(undefined),
    [params.clientId, propClientId],
  );
  const storefrontEnvironment = useMemo(
    () => resolvePortalEnvironment(params.environment),
    [params.environment],
  );
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [orders, setOrders] = useState<BuyerPortalOrder[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!clientId) {
      setBanner("Missing client id in the supplier orders route.");
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchBuyerOrders(clientId, undefined, storefrontEnvironment)
      .then((rows) => setOrders(Array.isArray(rows) ? rows : []))
      .catch((err: any) => setBanner(err?.message || "Failed to load supplier orders."))
      .finally(() => setLoading(false));
  }, [clientId, storefrontEnvironment]);

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return orders;
    return orders.filter((order) =>
      [order.po_number, order.po_id, order.supplier_name, order.client_id, order.status, order.payment_status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [orders, search]);

  return (
    <div style={shell}>
      <div style={container}>
        <div style={heroCard}>
          <div>
            <div style={eyebrow}>Supplier operations</div>
            <div style={title}>Portal-managed order dashboard</div>
            <div style={subtitle}>
              Review {storefrontEnvironment} portal orders for client {clientId || "-"}, then open invoice and shipment maintenance from one place.
            </div>
          </div>
          <div style={heroMeta}>/supplier/{clientId || "clientId"}/orders</div>
        </div>

        {banner ? <div style={bannerBox}>{banner}</div> : null}

        <section style={card}>
          <div style={toolbar}>
            <div>
              <div style={sectionTitle}>Orders</div>
              <div style={mutedText}>
                Open the commerce desk for invoice PDFs, shipment documents, tracking updates, and payment follow-up.
              </div>
            </div>
            <input
              style={searchField}
              placeholder="Search order, PO, status, supplier..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {loading ? (
            <div style={mutedText}>Loading supplier orders...</div>
          ) : filteredOrders.length === 0 ? (
            <div style={mutedText}>No orders found for this client yet.</div>
          ) : (
            <div style={tableWrap}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>Order</th>
                    <th style={th}>Supplier</th>
                    <th style={th}>Status</th>
                    <th style={th}>Payment</th>
                    <th style={th}>Dispatch</th>
                    <th style={th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => {
                    const status = statusColors(order.status);
                    return (
                      <tr key={order.po_id}>
                        <td style={td}>
                          <div style={{ fontWeight: 800, color: "#0f172a" }}>{order.po_number || order.po_id}</div>
                          <div style={smallText}>{order.po_id}</div>
                        </td>
                        <td style={td}>
                          <div style={{ fontWeight: 700, color: "#0f172a" }}>{order.supplier_name || "-"}</div>
                          <div style={smallText}>{order.client_id}</div>
                        </td>
                        <td style={td}>
                          <span style={{ ...statusPill, background: status.bg, color: status.fg }}>
                            {order.status || "NEW"}
                          </span>
                        </td>
                        <td style={td}>
                          <div style={smallTextStrong}>{order.payment_status || "Pending"}</div>
                          <div style={smallText}>{order.payment_reference || order.payment_method || "-"}</div>
                        </td>
                        <td style={td}>
                          <div style={smallTextStrong}>{order.dispatch_status || "Pending"}</div>
                          <div style={smallText}>{order.ack_status || "Awaiting acknowledgement"}</div>
                        </td>
                        <td style={td}>
                          <a href={`/supplier/orders/${order.po_id}/commerce`} style={actionLink}>
                            Open commerce desk
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
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
  maxWidth: 1280,
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

const heroCard: React.CSSProperties = {
  ...card,
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "start",
  flexWrap: "wrap",
  background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 42%, #0f172a 100%)",
  color: "#fff",
};

const eyebrow: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: 0.08,
  opacity: 0.9,
};

const title: React.CSSProperties = {
  marginTop: 8,
  fontSize: 30,
  fontWeight: 900,
  lineHeight: 1.1,
};

const subtitle: React.CSSProperties = {
  marginTop: 10,
  lineHeight: 1.7,
  color: "rgba(255,255,255,0.86)",
  maxWidth: 760,
};

const heroMeta: React.CSSProperties = {
  borderRadius: 999,
  padding: "10px 14px",
  background: "rgba(255,255,255,0.12)",
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

const toolbar: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "end",
  flexWrap: "wrap",
  marginBottom: 16,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 900,
  color: "#0f172a",
};

const mutedText: React.CSSProperties = {
  marginTop: 6,
  color: "#64748b",
  lineHeight: 1.6,
  fontSize: 14,
};

const searchField: React.CSSProperties = {
  width: 320,
  maxWidth: "100%",
  border: "1px solid #dbe2ea",
  borderRadius: 14,
  padding: "12px 14px",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};

const tableWrap: React.CSSProperties = {
  overflowX: "auto",
};

const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const th: React.CSSProperties = {
  textAlign: "left",
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 0.06,
  color: "#64748b",
  borderBottom: "1px solid #e5e7eb",
  padding: "12px 10px",
};

const td: React.CSSProperties = {
  borderBottom: "1px solid #eef2f7",
  padding: "14px 10px",
  verticalAlign: "top",
};

const smallText: React.CSSProperties = {
  marginTop: 4,
  fontSize: 12,
  color: "#64748b",
  lineHeight: 1.5,
};

const smallTextStrong: React.CSSProperties = {
  fontSize: 13,
  color: "#0f172a",
  fontWeight: 700,
  lineHeight: 1.5,
};

const statusPill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 999,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 800,
};

const actionLink: React.CSSProperties = {
  color: "#1d4ed8",
  fontWeight: 800,
  textDecoration: "none",
};
