import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, parseApiError } from "../../../utils/api";

const CLIENT_CONFIG_API_BASE = "/client-config";
const TRADING_PARTNER_API_BASE = "/trading-partners";

type ClientRow = {
  client_id: string;
  client_name: string;
};

type VerticalRow = {
  vertical_id: string;
  client_id: string;
  vertical_code: string;
  vertical_name: string;
  status?: string;
  default_erp_name?: string | null;
  notes?: string | null;
};

type TradingPartnerRow = {
  partner_id: string;
  client_id: string;
  vertical_id: string;
  partner_code: string;
  partner_name: string;
  partner_type: string;
  status?: string;
};

type Props = {
  client: ClientRow;
  onBanner: (text: string, type?: "success" | "error" | "info") => void;
  onSelectVertical?: (vertical: VerticalRow) => void;
  selectedVerticalId?: string;
};

export default function BusinessVerticalSection({
  client,
  onBanner,
  onSelectVertical,
  selectedVerticalId,
}: Props) {
  const navigate = useNavigate();

  const [rows, setRows] = useState<VerticalRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [openingTradingPartner, setOpeningTradingPartner] = useState(false);
  const [form, setForm] = useState({
    vertical_code: "",
    vertical_name: "",
    status: "ACTIVE",
    default_erp_name: "",
    notes: "",
  });

  const selectedVertical = useMemo(
    () => rows.find((row) => row.vertical_id === selectedVerticalId) || null,
    [rows, selectedVerticalId]
  );

  useEffect(() => {
    void loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.client_id]);

  async function loadRows() {
    try {
      setLoading(true);
      const res = await apiFetch(
        `${CLIENT_CONFIG_API_BASE}/verticals/${encodeURIComponent(client.client_id)}`,
        { method: "GET" }
      );
      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch (err: any) {
      onBanner(err?.message || "Failed to load business verticals.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function saveRow() {
    try {
      if (!form.vertical_code.trim()) {
        throw new Error("Vertical Code is required.");
      }
      if (!form.vertical_name.trim()) {
        throw new Error("Vertical Name is required.");
      }

      const payload = {
        client_id: client.client_id,
        vertical_code: form.vertical_code.trim().toUpperCase(),
        vertical_name: form.vertical_name.trim(),
        status: form.status,
        default_erp_name: form.default_erp_name.trim(),
        notes: form.notes.trim(),
      };

      const res = await apiFetch(`${CLIENT_CONFIG_API_BASE}/verticals`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }

      const saved = await res.json();

      onBanner("Business vertical created successfully.", "success");
      setForm({
        vertical_code: "",
        vertical_name: "",
        status: "ACTIVE",
        default_erp_name: "",
        notes: "",
      });

      await loadRows();

      if (saved?.vertical_id) {
        onSelectVertical?.(saved);
      }
    } catch (err: any) {
      onBanner(err?.message || "Unable to save business vertical.", "error");
    }
  }

  function handleSelect(row: VerticalRow) {
    onSelectVertical?.(row);
    onBanner(`Selected vertical: ${row.vertical_name}`, "info");
  }

  async function openTradingPartner() {
    try {
      if (!client?.client_id) {
        onBanner("Client is not available.", "error");
        return;
      }

      if (!selectedVertical?.vertical_id) {
        onBanner("Please select a business vertical first.", "error");
        return;
      }

      setOpeningTradingPartner(true);

      const existingRes = await apiFetch(
        `${TRADING_PARTNER_API_BASE}?client_id=${encodeURIComponent(client.client_id)}&vertical_id=${encodeURIComponent(selectedVertical.vertical_id)}`,
        { method: "GET" }
      );

      if (!existingRes.ok) {
        throw new Error(await parseApiError(existingRes));
      }

      const existingRows = await existingRes.json();
      const partners: TradingPartnerRow[] = Array.isArray(existingRows) ? existingRows : [];

      if (partners.length > 0) {
        onBanner(`Opening trading partner workspace for ${partners[0].partner_name}.`, "success");
        navigate(`/trading-partners/${partners[0].partner_id}/profile`);
        return;
      }

      const autoPartnerCode = `${selectedVertical.vertical_code || "VERT"}_TP_001`;
      const autoPartnerName = `${selectedVertical.vertical_name} Default Partner`;

      const createRes = await apiFetch(`${TRADING_PARTNER_API_BASE}`, {
        method: "POST",
        body: JSON.stringify({
          client_id: client.client_id,
          vertical_id: selectedVertical.vertical_id,
          partner_code: autoPartnerCode,
          partner_name: autoPartnerName,
          partner_type: "CUSTOMER",
          status: "ACTIVE",
          connection_method: "EMAIL",
          email: "",
          edi_id: "",
          sftp_path: "",
          as2_id: "",
          api_reference: "",
          notes: `Auto-created from Client Configuration for vertical ${selectedVertical.vertical_name}.`,
        }),
      });

      if (!createRes.ok) {
        throw new Error(await parseApiError(createRes));
      }

      const newPartner: TradingPartnerRow = await createRes.json();

      onBanner(
        `Starter trading partner '${newPartner.partner_name}' created and opened successfully.`,
        "success"
      );

      navigate(`/trading-partners/${newPartner.partner_id}/profile`);
    } catch (err: any) {
      onBanner(err?.message || "Failed to open Trading Partner workspace.", "error");
    } finally {
      setOpeningTradingPartner(false);
    }
  }

  return (
    <div>
      <div style={headerRow}>
        <div>
          <div style={title}>Business Verticals</div>
          <div style={subtitle}>
            Create and activate business entities under the selected client. Trading partners,
            connections, and ERP rules can be scoped by vertical.
          </div>
        </div>

        {selectedVertical ? (
          <button
            type="button"
            style={{
              ...secondaryButton,
              opacity: openingTradingPartner ? 0.7 : 1,
              cursor: openingTradingPartner ? "wait" : "pointer",
            }}
            onClick={openTradingPartner}
            disabled={openingTradingPartner}
          >
            {openingTradingPartner ? "Opening..." : "Open Trading Partners"}
          </button>
        ) : null}
      </div>

      <div style={cardGrid}>
        <div style={entryCard}>
          <div style={cardTitle}>Create Business Vertical</div>

          <div style={grid2}>
            {field(
              "Vertical Code",
              <input
                value={form.vertical_code}
                onChange={(e) =>
                  setForm({ ...form, vertical_code: e.target.value.toUpperCase() })
                }
                style={inputStyle}
                placeholder="e.g. INDUSTRIAL"
              />
            )}

            {field(
              "Vertical Name",
              <input
                value={form.vertical_name}
                onChange={(e) => setForm({ ...form, vertical_name: e.target.value })}
                style={inputStyle}
                placeholder="Display name"
              />
            )}

            {field(
              "Status",
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                style={inputStyle}
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
              </select>
            )}

            {field(
              "Default ERP",
              <input
                value={form.default_erp_name}
                onChange={(e) => setForm({ ...form, default_erp_name: e.target.value })}
                style={inputStyle}
                placeholder="SAP / D365 / Oracle"
              />
            )}
          </div>

          <div style={{ marginTop: 14 }}>
            {field(
              "Notes",
              <input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                style={inputStyle}
                placeholder="Optional description or scope notes"
              />
            )}
          </div>

          <div style={buttonRow}>
            <button type="button" style={primaryButton} onClick={saveRow}>
              Add Business Vertical
            </button>
          </div>
        </div>

        <div style={listCard}>
          <div style={cardTitle}>Configured Verticals</div>

          <div style={{ overflowX: "auto", marginTop: 8 }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Code</th>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Default ERP</th>
                  <th style={thStyle}>Action</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} style={tdEmptyStyle}>
                      Loading...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={tdEmptyStyle}>
                      No business verticals configured.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const active = selectedVerticalId === row.vertical_id;

                    return (
                      <tr key={row.vertical_id} style={{ background: active ? "#eff6ff" : "#fff" }}>
                        <td style={tdStyle}>{row.vertical_code}</td>
                        <td style={tdStyle}>{row.vertical_name}</td>
                        <td style={tdStyle}>{row.status || "ACTIVE"}</td>
                        <td style={tdStyle}>{row.default_erp_name || "-"}</td>
                        <td style={tdStyle}>
                          <button
                            type="button"
                            onClick={() => handleSelect(row)}
                            style={{
                              ...miniButton,
                              background: active ? "#0b5fff" : "#fff",
                              color: active ? "#fff" : "#0f172a",
                              border: active ? "1px solid #0b5fff" : "1px solid #dbe4ee",
                            }}
                          >
                            {active ? "Selected" : "Select"}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedVertical ? (
        <div style={selectionInfo}>
          Active Vertical:{" "}
          <strong>
            {selectedVertical.vertical_name} ({selectedVertical.vertical_code})
          </strong>
        </div>
      ) : null}
    </div>
  );
}

function field(label: string, children: React.ReactNode) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      {children}
    </div>
  );
}

const headerRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  marginBottom: 16,
  flexWrap: "wrap",
};

const title: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  color: "#0f172a",
};

const subtitle: React.CSSProperties = {
  fontSize: 12,
  color: "#64748b",
  marginTop: 4,
  maxWidth: 760,
};

const cardGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1.2fr",
  gap: 16,
  alignItems: "start",
};

const entryCard: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  background: "#fff",
  padding: 16,
};

const listCard: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  background: "linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)",
  padding: 16,
};

const cardTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  color: "#334155",
};

const grid2: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 14,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#475569",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 40,
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid #dbe4ee",
  background: "#fff",
  fontSize: 13,
  color: "#0f172a",
  outline: "none",
  boxSizing: "border-box",
};

const buttonRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  marginTop: 14,
  flexWrap: "wrap",
};

const primaryButton: React.CSSProperties = {
  border: "1px solid #0b5fff",
  background: "#0b5fff",
  color: "#fff",
  borderRadius: 10,
  padding: "9px 14px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButton: React.CSSProperties = {
  border: "1px solid #dbe4ee",
  background: "#fff",
  color: "#0f172a",
  borderRadius: 10,
  padding: "9px 14px",
  fontSize: 13,
  fontWeight: 700,
};

const miniButton: React.CSSProperties = {
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  marginTop: 12,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  fontSize: 12,
  fontWeight: 800,
  color: "#334155",
  borderBottom: "1px solid #e5e7eb",
  background: "#f8fafc",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 13,
  color: "#0f172a",
  borderBottom: "1px solid #eef2f7",
};

const tdEmptyStyle: React.CSSProperties = {
  padding: "16px 12px",
  fontSize: 13,
  color: "#64748b",
  borderBottom: "1px solid #eef2f7",
};

const selectionInfo: React.CSSProperties = {
  marginTop: 14,
  padding: "10px 12px",
  border: "1px solid #dbe4ee",
  borderRadius: 10,
  background: "#f8fafc",
  fontSize: 13,
  color: "#334155",
};