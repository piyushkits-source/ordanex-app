import React, { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/common/PageHeader";
import { apiFetch, parseApiError } from "../utils/api";

const API_BASE = "/trading-partners";

type TradingPartner = {
  partner_id: string;
  client_id: string;
  vertical_id: string;
  partner_code: string;
  partner_name: string;
  partner_type: string;
  status: string;
  notes?: string | null;
};

type PartnerProfile = {
  onboarding_profile_id?: string;
  partner_id: string;

  duplicate_check_enabled: boolean;
  duplicate_check_scope: string;

  split_rule: string;
  split_po_number_strategy: string;
  split_po_separator: string;

  delivery_date_source: string;
  delivery_date_offset_type: string;
  delivery_date_offset_days: number;

  po_date_source: string;
};

type TradingPartnerPageProps = {
  clientId: string;
  verticalId: string;
};

type TabKey = "PROFILE" | "CONNECTION" | "UOM" | "MAPPING" | "NOTIFICATION";

const defaultProfile = (partnerId: string): PartnerProfile => ({
  partner_id: partnerId,
  duplicate_check_enabled: true,
  duplicate_check_scope: "PO_NUMBER",
  split_rule: "NONE",
  split_po_number_strategy: "SAME_PO_NUMBER",
  split_po_separator: "-",
  delivery_date_source: "PO_DELIVERY_DATE",
  delivery_date_offset_type: "NONE",
  delivery_date_offset_days: 0,
  po_date_source: "PO_DATE",
});

export default function TradingPartnerPage({
  clientId,
  verticalId,
}: TradingPartnerPageProps) {
  const [partners, setPartners] = useState<TradingPartner[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("PROFILE");
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<string>("");

  const selectedPartner = useMemo(
    () => partners.find((p) => p.partner_id === selectedPartnerId) || null,
    [partners, selectedPartnerId]
  );

  useEffect(() => {
    if (clientId && verticalId) {
      loadPartners();
    }
  }, [clientId, verticalId]);

  async function loadPartners() {
    try {
      setLoading(true);
      setBanner("");

      const res = await apiFetch(
        `${API_BASE}?client_id=${encodeURIComponent(clientId)}&vertical_id=${encodeURIComponent(verticalId)}`,
        { method: "GET" }
      );

      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }

      const data = await res.json();
      const rows = Array.isArray(data) ? data : [];
      setPartners(rows);

      if (rows.length > 0 && !selectedPartnerId) {
        setSelectedPartnerId(rows[0].partner_id);
      } else if (
        selectedPartnerId &&
        !rows.some((x) => x.partner_id === selectedPartnerId)
      ) {
        setSelectedPartnerId(rows.length > 0 ? rows[0].partner_id : "");
      }
    } catch (err: any) {
      setBanner(err?.message || "Failed to load trading partners.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ paddingBottom: 24 }}>
      <PageHeader
        title="Trading Partners"
        subtitle="Manage partner-specific onboarding profile, connection setup, UOM, mapping, and notifications."
      />

      {banner ? <div style={bannerStyle}>{banner}</div> : null}

      <div style={pageLayout}>
        {/* LEFT PANEL */}
        <div style={leftPanel}>
          <div style={sectionTitle}>Partner List</div>

          <div style={{ display: "grid", gap: 8 }}>
            {loading ? (
              <div style={emptyText}>Loading partners...</div>
            ) : partners.length === 0 ? (
              <div style={emptyText}>No trading partners found.</div>
            ) : (
              partners.map((partner) => {
                const isActive = selectedPartnerId === partner.partner_id;

                return (
                  <button
                    key={partner.partner_id}
                    type="button"
                    onClick={() => {
                      setSelectedPartnerId(partner.partner_id);
                      setActiveTab("PROFILE");
                    }}
                    style={{
                      ...partnerItem,
                      border: isActive
                        ? "1.5px solid #2563eb"
                        : "1px solid #e5e7eb",
                      background: isActive ? "#eff6ff" : "#fff",
                    }}
                  >
                    <div style={partnerName}>{partner.partner_name}</div>
                    <div style={partnerMeta}>
                      {partner.partner_code} • {partner.partner_type} •{" "}
                      {partner.status}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div style={rightPanel}>
          {!selectedPartner ? (
            <div style={emptyPanel}>
              Select a trading partner to continue.
            </div>
          ) : (
            <>
              <div style={headerBlock}>
                <div style={headerTitle}>{selectedPartner.partner_name}</div>
                <div style={headerSubTitle}>
                  {selectedPartner.partner_code} • {selectedPartner.partner_type}{" "}
                  • {selectedPartner.status}
                </div>
              </div>

              <div style={tabBar}>
                {tabs.map((tab) => {
                  const isActive = activeTab === tab.key;

                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveTab(tab.key)}
                      style={{
                        ...tabButton,
                        color: isActive ? "#2563eb" : "#64748b",
                        borderBottom: isActive
                          ? "2px solid #2563eb"
                          : "2px solid transparent",
                      }}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <div style={{ marginTop: 16 }}>
                {activeTab === "PROFILE" && (
                  <ProfileTab
                    partner={selectedPartner}
                    onBanner={setBanner}
                  />
                )}

                {activeTab === "CONNECTION" && (
                  <PlaceholderTab
                    title="Partner Connection"
                    text="This tab will manage partner-side Email, SFTP, AS2, and API connectivity."
                  />
                )}

                {activeTab === "UOM" && (
                  <PlaceholderTab
                    title="UOM Rules"
                    text="This tab will manage customer / supplier / ship-to / material / product-level UOM conversions."
                  />
                )}

                {activeTab === "MAPPING" && (
                  <PlaceholderTab
                    title="Field Mapping"
                    text="This tab will manage no-code source-to-target partner mappings."
                  />
                )}

                {activeTab === "NOTIFICATION" && (
                  <PlaceholderTab
                    title="Notifications"
                    text="This tab will manage success, pending, and failed alert recipients and content."
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ProfileTab({
  partner,
  onBanner,
}: {
  partner: TradingPartner;
  onBanner: (text: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<PartnerProfile>(defaultProfile(partner.partner_id));

  useEffect(() => {
    loadProfile();
  }, [partner.partner_id]);

  async function loadProfile() {
    try {
      setLoading(true);
      onBanner("");

      const res = await apiFetch(
        `${API_BASE}/${encodeURIComponent(partner.partner_id)}/profile`,
        { method: "GET" }
      );

      if (res.status === 404) {
        setProfile(defaultProfile(partner.partner_id));
        return;
      }

      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }

      const data = await res.json();

      if (data) {
        setProfile({
          partner_id: partner.partner_id,
          duplicate_check_enabled:
            data.duplicate_check_enabled ?? true,
          duplicate_check_scope:
            data.duplicate_check_scope || "PO_NUMBER",
          split_rule: data.split_rule || "NONE",
          split_po_number_strategy:
            data.split_po_number_strategy || "SAME_PO_NUMBER",
          split_po_separator: data.split_po_separator || "-",
          delivery_date_source:
            data.delivery_date_source || "PO_DELIVERY_DATE",
          delivery_date_offset_type:
            data.delivery_date_offset_type || "NONE",
          delivery_date_offset_days:
            Number(data.delivery_date_offset_days || 0),
          po_date_source: data.po_date_source || "PO_DATE",
          onboarding_profile_id: data.onboarding_profile_id,
        });
      } else {
        setProfile(defaultProfile(partner.partner_id));
      }
    } catch (err: any) {
      onBanner(err?.message || "Failed to load partner profile.");
    } finally {
      setLoading(false);
    }
  }

  async function saveProfile() {
    try {
      setLoading(true);
      onBanner("");

      const payload = {
        ...profile,
        partner_id: partner.partner_id,
      };

      const res = await apiFetch(`${API_BASE}/profile`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }

      onBanner("Trading partner profile saved successfully.");
      await loadProfile();
    } catch (err: any) {
      onBanner(err?.message || "Unable to save trading partner profile.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={card}>
      <div style={sectionTitle}>Onboarding Profile</div>

      <div style={grid3}>
        {field(
          "Duplicate PO Check",
          <select
            value={profile.duplicate_check_enabled ? "YES" : "NO"}
            onChange={(e) =>
              setProfile({
                ...profile,
                duplicate_check_enabled: e.target.value === "YES",
              })
            }
            style={inputStyle}
          >
            <option value="YES">Enable</option>
            <option value="NO">Disable</option>
          </select>
        )}

        {field(
          "Duplicate Check Scope",
          <select
            value={profile.duplicate_check_scope}
            onChange={(e) =>
              setProfile({
                ...profile,
                duplicate_check_scope: e.target.value,
              })
            }
            style={inputStyle}
          >
            <option value="PO_NUMBER">PO Number</option>
            <option value="PO_NUMBER_AND_DATE">PO Number + Date</option>
            <option value="PO_NUMBER_AND_PARTNER">PO Number + Partner</option>
          </select>
        )}

        {field(
          "Split Rule",
          <select
            value={profile.split_rule}
            onChange={(e) =>
              setProfile({
                ...profile,
                split_rule: e.target.value,
              })
            }
            style={inputStyle}
          >
            <option value="NONE">No Split</option>
            <option value="LINE_ITEM">1 Order per Line</option>
            <option value="DELIVERY_DATE">1 Order per Delivery Date</option>
            <option value="QUANTITY_LOAD">1 Order per Quantity Load</option>
            <option value="DELIVERY_LOCATION">
              1 Order per Delivery Location
            </option>
          </select>
        )}

        {field(
          "Split PO Number Strategy",
          <select
            value={profile.split_po_number_strategy}
            onChange={(e) =>
              setProfile({
                ...profile,
                split_po_number_strategy: e.target.value,
              })
            }
            style={inputStyle}
          >
            <option value="SAME_PO_NUMBER">Same PO Number</option>
            <option value="PO_PLUS_LINE_NUMBER">PO + Line Number</option>
            <option value="PO_PLUS_SEQUENCE">PO + Sequence</option>
          </select>
        )}

        {field(
          "Split PO Separator",
          <input
            value={profile.split_po_separator}
            onChange={(e) =>
              setProfile({
                ...profile,
                split_po_separator: e.target.value,
              })
            }
            style={inputStyle}
          />
        )}

        {field(
          "Delivery Date Source",
          <select
            value={profile.delivery_date_source}
            onChange={(e) =>
              setProfile({
                ...profile,
                delivery_date_source: e.target.value,
              })
            }
            style={inputStyle}
          >
            <option value="PO_DATE">Same as PO Date</option>
            <option value="PO_DELIVERY_DATE">Delivery Date on PO</option>
            <option value="RECEIVED_DATE">Received Date</option>
          </select>
        )}

        {field(
          "Delivery Date Offset Type",
          <select
            value={profile.delivery_date_offset_type}
            onChange={(e) =>
              setProfile({
                ...profile,
                delivery_date_offset_type: e.target.value,
              })
            }
            style={inputStyle}
          >
            <option value="NONE">No Offset</option>
            <option value="CALENDAR_DAYS">Calendar Days</option>
            <option value="BUSINESS_DAYS">Business Days</option>
          </select>
        )}

        {field(
          "Delivery Date Offset Days",
          <input
            type="number"
            value={profile.delivery_date_offset_days}
            onChange={(e) =>
              setProfile({
                ...profile,
                delivery_date_offset_days: Number(e.target.value || 0),
              })
            }
            style={inputStyle}
          />
        )}

        {field(
          "PO Date Source",
          <select
            value={profile.po_date_source}
            onChange={(e) =>
              setProfile({
                ...profile,
                po_date_source: e.target.value,
              })
            }
            style={inputStyle}
          >
            <option value="PO_DATE">PO Date from Document</option>
            <option value="RECEIVED_DATE">Use Receipt Date</option>
          </select>
        )}
      </div>

      <div style={buttonRow}>
        <button
          type="button"
          style={primaryButton}
          onClick={saveProfile}
          disabled={loading}
        >
          {loading ? "Saving..." : "Save Profile"}
        </button>
      </div>
    </div>
  );
}

function PlaceholderTab({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div style={card}>
      <div style={sectionTitle}>{title}</div>
      <div style={placeholderText}>{text}</div>
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

const tabs: { key: TabKey; label: string }[] = [
  { key: "PROFILE", label: "Profile" },
  { key: "CONNECTION", label: "Connection" },
  { key: "UOM", label: "UOM" },
  { key: "MAPPING", label: "Mapping" },
  { key: "NOTIFICATION", label: "Notification" },
];

const pageLayout: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "300px 1fr",
  gap: 16,
  alignItems: "start",
};

const leftPanel: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  background: "#fff",
  padding: 14,
};

const rightPanel: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  background: "#fff",
  padding: 16,
  minHeight: 420,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 800,
  color: "#0f172a",
  marginBottom: 14,
};

const partnerItem: React.CSSProperties = {
  width: "100%",
  textAlign: "left",
  borderRadius: 10,
  padding: 12,
  cursor: "pointer",
};

const partnerName: React.CSSProperties = {
  fontWeight: 700,
  color: "#0f172a",
};

const partnerMeta: React.CSSProperties = {
  fontSize: 12,
  color: "#64748b",
  marginTop: 4,
};

const headerBlock: React.CSSProperties = {
  marginBottom: 16,
};

const headerTitle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  color: "#0f172a",
};

const headerSubTitle: React.CSSProperties = {
  fontSize: 12,
  color: "#64748b",
  marginTop: 4,
};

const tabBar: React.CSSProperties = {
  display: "flex",
  gap: 20,
  borderBottom: "1px solid #e5e7eb",
  paddingBottom: 8,
  flexWrap: "wrap",
};

const tabButton: React.CSSProperties = {
  background: "none",
  borderTop: "none",
  borderLeft: "none",
  borderRight: "none",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 13,
  padding: "8px 0",
};

const card: React.CSSProperties = {
  border: "1px solid #eef2f7",
  borderRadius: 12,
  background: "#fff",
  padding: 16,
};

const grid3: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
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
  minHeight: 38,
  padding: "8px 10px",
  borderRadius: 8,
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
};

const primaryButton: React.CSSProperties = {
  border: "1px solid #0b5fff",
  background: "#0b5fff",
  color: "#fff",
  borderRadius: 8,
  padding: "9px 14px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const bannerStyle: React.CSSProperties = {
  marginBottom: 14,
  border: "1px solid #bfdbfe",
  background: "#eff6ff",
  color: "#1d4ed8",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 13,
  fontWeight: 600,
};

const placeholderText: React.CSSProperties = {
  color: "#64748b",
  fontSize: 13,
  lineHeight: 1.6,
};

const emptyText: React.CSSProperties = {
  color: "#64748b",
  fontSize: 13,
};

const emptyPanel: React.CSSProperties = {
  color: "#64748b",
  fontSize: 14,
  padding: 20,
};