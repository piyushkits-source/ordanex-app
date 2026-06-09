import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { FaExchangeAlt, FaSearch } from "react-icons/fa";

import PageHeader from "components/common/PageHeader";
import { apiFetch, parseApiError } from "utils/api";
import { useAppScope } from "context/AppScopeContext";
import { TradingPartner } from "types/tradingPartner";

import PartnerMasterSection from "components/trading_partner/sections/PartnerMasterSection";
import ProfileSection from "components/trading_partner/sections/ProfileSection";
import ConnectionSection from "components/trading_partner/sections/ConnectionSection";
import UomSection from "components/trading_partner/sections/UomSection";
import UomRulesSection from "components/trading_partner/sections/UomRulesSection";
import BusinessRulesSection from "components/trading_partner/sections/BusinessRulesSection";
import MappingSection from "components/trading_partner/sections/MappingSection";
import MappingProfilesSection from "components/trading_partner/sections/MappingProfilesSection";
import NotificationSection from "components/trading_partner/sections/NotificationSection";
import BulkUploadSection from "components/trading_partner/sections/BulkUploadSection";
import AIOnboardingSection from "components/trading_partner/sections/AIOnboardingSection";
import AddressMasterSection from "components/trading_partner/sections/AddressMasterSection";
import AuditSection from "components/trading_partner/sections/AuditSection";
import MessageFlowsSection from "components/trading_partner/sections/MessageFlowsSection";
import TradingPartnerSectionMenu from "components/trading_partner/TradingPartnerSectionMenu";
import ParserProfilesSection from "components/trading_partner/sections/ParserProfilesSection";
import PromotionSection from "components/trading_partner/sections/PromotionSection";

const API_BASE = "/trading-partners";

type SectionKey =
  | "master"
  | "profile"
  | "connections"
  | "flows"
  | "address"
  | "uom"
  | "uom-rules"
  | "business-rules"
  | "mapping"
  | "mapping-profiles"
  | "parser-profiles" 
  | "notifications"
  | "bulk"
  | "ai"
  | "audit"
  | "promotion";

const DEFAULT_SECTION: SectionKey = "profile";

function getActiveSection(pathname: string): SectionKey {
  const parts = pathname.split("/").filter(Boolean);
  const last = parts[parts.length - 1] as SectionKey | undefined;

  const allowed: SectionKey[] = [
    "master",
    "profile",
    "connections",
    "flows",
    "address",
    "uom",
    "uom-rules",
    "business-rules",
    "mapping",
    "mapping-profiles",
    "parser-profiles",
    "notifications",
    "bulk",
    "ai",
    "promotion",
    "audit",
  ];

  return last && allowed.includes(last) ? last : DEFAULT_SECTION;
}

export default function TradingPartnerWorkspacePage() {
  const { scope, setClientScope, setEnvironmentScope, setVerticalScope } = useAppScope();
  const isProductionSelected = String(scope.environment || "PROD").toUpperCase() === "PROD";
  const navigate = useNavigate();
  const location = useLocation();
  const { partnerId = "" } = useParams();

  const [partners, setPartners] = useState<TradingPartner[]>([]);
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState("");
  const [partnerSearch, setPartnerSearch] = useState("");
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferSaving, setTransferSaving] = useState(false);
  const [clients, setClients] = useState<Array<{ client_id: string; client_name: string }>>([]);
  const [targetVerticals, setTargetVerticals] = useState<Array<{ vertical_id: string; vertical_name: string; vertical_code: string }>>([]);
  const [transferForm, setTransferForm] = useState({
    targetClientId: "",
    targetVerticalId: "",
    targetPartnerCode: "",
    targetPartnerName: "",
  });

  const activeSection = getActiveSection(location.pathname);

  const selectedPartner = useMemo(
    () => partners.find((p) => String(p.partner_id) === String(partnerId)) || null,
    [partners, partnerId]
  );

  const filteredPartners = useMemo(() => {
    const query = partnerSearch.trim().toLowerCase();
    if (!query) return partners;
    return partners.filter((partner) =>
      [partner.partner_name, partner.partner_code, partner.partner_type, partner.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [partnerSearch, partners]);

  useEffect(() => {
    if (scope.clientId && scope.verticalId) {
      void loadPartners();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.clientId, scope.verticalId]);

  useEffect(() => {
    if (partnerId && partners.length > 0 && !selectedPartner) {
      navigate(`/trading-partners/${partners[0].partner_id}/${DEFAULT_SECTION}`, {
        replace: true,
      });
    }
  }, [partnerId, partners, selectedPartner, navigate]);

  async function loadPartners() {
    try {
      setLoading(true);
      setBanner("");

      const res = await apiFetch(
        `${API_BASE}?client_id=${encodeURIComponent(scope.clientId)}&vertical_id=${encodeURIComponent(scope.verticalId)}`,
        { method: "GET" }
      );

      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }

      const rows = await res.json();
      const partnerRows: TradingPartner[] = Array.isArray(rows) ? rows : [];
      setPartners(partnerRows);

      if (partnerRows.length === 0) return;

      if (!partnerId) {
        navigate(`/trading-partners/${partnerRows[0].partner_id}/${DEFAULT_SECTION}`, {
          replace: true,
        });
      }
    } catch (err: any) {
      setBanner(err?.message || "Failed to load trading partners.");
    } finally {
      setLoading(false);
    }
  }

  function openPartner(targetPartnerId: string, section: SectionKey = DEFAULT_SECTION) {
    navigate(`/trading-partners/${targetPartnerId}/${section}`);
  }

  async function loadClientOptions() {
    try {
      const res = await apiFetch(`/client-config/clients`, { method: "GET" });
      if (!res.ok) throw new Error(await parseApiError(res));
      const data = await res.json();
      setClients(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setBanner(err?.message || "Failed to load client options.");
    }
  }

  async function loadVerticalOptions(clientId: string) {
    if (!clientId) {
      setTargetVerticals([]);
      return;
    }
    try {
      const res = await apiFetch(`/client-config/verticals/${encodeURIComponent(clientId)}`, { method: "GET" });
      if (!res.ok) throw new Error(await parseApiError(res));
      const data = await res.json();
      setTargetVerticals(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setBanner(err?.message || "Failed to load target business verticals.");
    }
  }

  async function openTransferDialog() {
    if (!selectedPartner) return;
    if (!clients.length) {
      await loadClientOptions();
    }
    const initialClientId = scope.clientId || selectedPartner.client_id;
    const initialVerticalId = scope.verticalId || selectedPartner.vertical_id || "";
    setTransferForm({
      targetClientId: initialClientId,
      targetVerticalId: initialVerticalId ? String(initialVerticalId) : "",
      targetPartnerCode: selectedPartner.partner_code,
      targetPartnerName: selectedPartner.partner_name,
    });
    await loadVerticalOptions(initialClientId);
    setTransferOpen(true);
  }

  async function submitTransfer() {
    if (!selectedPartner) return;
    if (!transferForm.targetClientId) {
      setBanner("Please choose a target client for the transfer.");
      return;
    }
    try {
      setTransferSaving(true);
      const res = await apiFetch(`/trading-partners/${selectedPartner.partner_id}/transfer`, {
        method: "POST",
        body: JSON.stringify({
          target_client_id: transferForm.targetClientId,
          target_vertical_id: transferForm.targetVerticalId || null,
          target_partner_code: transferForm.targetPartnerCode.trim() || null,
          target_partner_name: transferForm.targetPartnerName.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      const data = await res.json();
      const created = data?.partner;
      const targetClient = clients.find((row) => row.client_id === transferForm.targetClientId);
      const targetVertical = targetVerticals.find((row) => row.vertical_id === transferForm.targetVerticalId);
      setBanner("Trading partner setup transferred successfully.");
      setTransferOpen(false);

      if (created?.partner_id) {
        setClientScope({
          clientId: transferForm.targetClientId,
          clientName: targetClient?.client_name || transferForm.targetClientId,
        });
        setVerticalScope({
          verticalId: transferForm.targetVerticalId || "",
          verticalName: targetVertical?.vertical_name || "",
        });
        navigate(`/trading-partners/${created.partner_id}/${DEFAULT_SECTION}`);
      } else {
        await loadPartners();
      }
    } catch (err: any) {
      setBanner(err?.message || "Unable to transfer trading partner setup.");
    } finally {
      setTransferSaving(false);
    }
  }

  function renderSection() {
    if (!selectedPartner) {
      return <div style={emptyPanel}>Select a trading partner to continue.</div>;
    }

    switch (activeSection) {
      case "master":
        return (
          <PartnerMasterSection
            clientId={scope.clientId}
            verticalId={scope.verticalId}
            partner={selectedPartner}
            onSaved={loadPartners}
            onBanner={setBanner}
          />
        );

      case "profile":
        return <ProfileSection partner={selectedPartner} onBanner={setBanner} />;

      case "connections":
        return <ConnectionSection partner={selectedPartner} onBanner={setBanner} />;

      case "flows":
        return <MessageFlowsSection partner={selectedPartner} onBanner={setBanner} />;

      case "address":
        return <AddressMasterSection partner={selectedPartner} onBanner={setBanner} />;

      case "uom":
        return <UomSection partner={selectedPartner} onBanner={setBanner} />;

      case "uom-rules":
        return <UomRulesSection partner={selectedPartner} onBanner={setBanner} />;

      case "business-rules":
        return <BusinessRulesSection partner={selectedPartner} onBanner={setBanner} />;

      case "mapping":
        return <MappingSection partner={selectedPartner} onBanner={setBanner} />;

      case "mapping-profiles":
        return <MappingProfilesSection partner={selectedPartner} onBanner={setBanner} />;

      case "parser-profiles":
        return <ParserProfilesSection partner={selectedPartner} onBanner={setBanner} />;

      case "notifications":
        return <NotificationSection partner={selectedPartner} onBanner={setBanner} />;

      case "bulk":
        return <BulkUploadSection partner={selectedPartner} onBanner={setBanner} />;

      case "ai":
        return <AIOnboardingSection partner={selectedPartner} onBanner={setBanner} />;

      case "audit":
        return <AuditSection partner={selectedPartner} onBanner={setBanner} />;

      case "promotion":
        return <PromotionSection partner={selectedPartner} onBanner={setBanner} />;

      default:
        return <ProfileSection partner={selectedPartner} onBanner={setBanner} />;
    }
  }

  if (!scope.clientId || !scope.verticalId) {
    return (
      <div style={{ paddingBottom: 24 }}>
        <PageHeader
          title="Trading Partner Workspace"
          subtitle="Select a client and business vertical in Client Configuration before working here."
        />
        <div style={emptyPanel}>Please select client and vertical first.</div>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 24 }}>
      <PageHeader
        title="Trading Partner Workspace"
        subtitle="Manage partner master, onboarding, connections, message flows, address master, UOM, rules, mapping, notifications, audit, and AI onboarding."
      />

      {banner ? <div style={bannerStyle}>{banner}</div> : null}

      <div style={contextBar}>
        <div style={contextChip}>Client: {scope.clientName || scope.clientId}</div>
        <div style={contextChip}>Vertical: {scope.verticalName || scope.verticalId}</div>
        <div style={contextChip}>{isProductionSelected ? "Environment: Production" : "Environment: Staging"}</div>
        {selectedPartner ? (
          <div style={contextChipMuted}>
            Partner: {selectedPartner.partner_name} ({selectedPartner.partner_code})
          </div>
        ) : null}
        {selectedPartner && !isProductionSelected ? (
          <button type="button" onClick={() => void openTransferDialog()} style={transferButton}>
            <FaExchangeAlt size={12} />
            Transfer Setup
          </button>
        ) : null}
        <select
          value={scope.environment || "PROD"}
          onChange={(e) => setEnvironmentScope(e.target.value)}
          style={envSelect}
        >
          <option value="PROD">Production</option>
          <option value="STAGING">Staging</option>
        </select>
      </div>

      {isProductionSelected ? (
        <div style={productionBanner}>
          Production is read-only for trading partner configuration. Switch the active environment to Staging to create, edit, or update partner setup.
        </div>
      ) : null}

      <div style={layout}>
        <div style={leftPanel}>
          <div style={panelTitle}>Trading Partners</div>
          <label style={searchWrap}>
            <FaSearch size={12} color="#94a3b8" />
            <input
              value={partnerSearch}
              onChange={(e) => setPartnerSearch(e.target.value)}
              placeholder="Search partner by name, code, type, or status"
              style={searchInput}
            />
          </label>

          {loading ? (
            <div style={emptyText}>Loading...</div>
          ) : partners.length === 0 ? (
            <div style={emptyText}>No trading partners found.</div>
          ) : filteredPartners.length === 0 ? (
            <div style={emptyText}>No trading partners match the current search.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {filteredPartners.map((p) => {
                const active = String(p.partner_id) === String(partnerId);
                return (
                  <button
                    key={p.partner_id}
                    type="button"
                    onClick={() => openPartner(String(p.partner_id), activeSection)}
                    style={{
                      ...partnerCard,
                      border: active ? "1.5px solid #0b5fff" : "1px solid #e5e7eb",
                      background: active ? "#eff6ff" : "#fff",
                    }}
                  >
                    <div style={partnerName}>{p.partner_name}</div>
                    <div style={partnerMeta}>
                      {p.partner_code} • {p.partner_type} • {p.status || "ACTIVE"}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div style={workspace}>
          <TradingPartnerSectionMenu
            activeSection={activeSection}
            disabled={!selectedPartner}
            onSelect={(section) => {
              if (!selectedPartner) return;
              navigate(`/trading-partners/${selectedPartner.partner_id}/${section}`);
            }}
          />

          <div style={contentArea}>{renderSection()}</div>
        </div>
      </div>

      {transferOpen ? (
        <div style={modalBackdrop}>
          <div style={modalCard}>
            <div style={modalHeader}>
              <div>
                <div style={panelTitle}>Transfer Trading Partner Setup</div>
                <div style={modalHint}>
                  Clone this trading partner and all major setup into another client or business vertical for M&amp;A and divestiture scenarios.
                </div>
              </div>
              <button type="button" onClick={() => setTransferOpen(false)} style={closeButton}>
                Close
              </button>
            </div>

            <div style={modalGrid}>
              {field("Target Client", (
                <select
                  value={transferForm.targetClientId}
                  onChange={async (e) => {
                    const nextClientId = e.target.value;
                    setTransferForm((prev) => ({ ...prev, targetClientId: nextClientId, targetVerticalId: "" }));
                    await loadVerticalOptions(nextClientId);
                  }}
                  style={modalInput}
                >
                  <option value="">Select client</option>
                  {clients.map((client) => (
                    <option key={client.client_id} value={client.client_id}>
                      {client.client_name} ({client.client_id})
                    </option>
                  ))}
                </select>
              ))}
              {field("Target Vertical (Optional)", (
                <select
                  value={transferForm.targetVerticalId}
                  onChange={(e) => setTransferForm((prev) => ({ ...prev, targetVerticalId: e.target.value }))}
                  style={modalInput}
                >
                  <option value="">No vertical override</option>
                  {targetVerticals.map((vertical) => (
                    <option key={vertical.vertical_id} value={vertical.vertical_id}>
                      {vertical.vertical_name} ({vertical.vertical_code})
                    </option>
                  ))}
                </select>
              ))}
              {field("Transferred Partner Code", (
                <input
                  value={transferForm.targetPartnerCode}
                  onChange={(e) => setTransferForm((prev) => ({ ...prev, targetPartnerCode: e.target.value }))}
                  style={modalInput}
                />
              ))}
              {field("Transferred Partner Name", (
                <input
                  value={transferForm.targetPartnerName}
                  onChange={(e) => setTransferForm((prev) => ({ ...prev, targetPartnerName: e.target.value }))}
                  style={modalInput}
                />
              ))}
            </div>

            <div style={modalActionRow}>
              <button type="button" style={primaryActionButton} onClick={() => void submitTransfer()} disabled={transferSaving}>
                {transferSaving ? "Transferring..." : "Transfer Setup"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function field(label: string, control: React.ReactNode) {
  return (
    <label style={{ display: "grid", gap: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>{label}</span>
      {control}
    </label>
  );
}

const layout: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "280px minmax(0, 1fr)",
  gap: 16,
  alignItems: "start",
};

const leftPanel: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  background: "#fff",
  padding: 14,
  minWidth: 0,
};

const workspace: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  background: "#fff",
  padding: 16,
  minWidth: 0,
  overflow: "hidden",
};

const contentArea: React.CSSProperties = {
  marginTop: 16,
  minWidth: 0,
  overflowX: "auto",
};

const panelTitle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 800,
  color: "#0f172a",
  marginBottom: 12,
};

const partnerCard: React.CSSProperties = {
  textAlign: "left",
  borderRadius: 12,
  padding: 12,
  cursor: "pointer",
  width: "100%",
  background: "#fff",
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

const emptyPanel: React.CSSProperties = {
  color: "#64748b",
  fontSize: 14,
  padding: 20,
};

const emptyText: React.CSSProperties = {
  color: "#64748b",
  fontSize: 13,
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
const productionBanner: React.CSSProperties = { marginBottom: 14, border: "1px solid #fecaca", borderRadius: 10, padding: "10px 12px", fontSize: 13, fontWeight: 600, color: "#b91c1c", background: "#fef2f2" };

const contextBar: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  marginBottom: 14,
  flexWrap: "wrap",
};

const contextChip: React.CSSProperties = {
  border: "1px solid #bfdbfe",
  background: "#eff6ff",
  color: "#1d4ed8",
  borderRadius: 999,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 700,
};

const contextChipMuted: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  background: "#fff",
  color: "#475569",
  borderRadius: 999,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 700,
};
const envSelect: React.CSSProperties = { minHeight: 34, borderRadius: 999, border: "1px solid #dbe4ee", background: "#fff", color: "#0f172a", padding: "6px 12px", fontSize: 12, fontWeight: 700 };
const transferButton: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, minHeight: 34, borderRadius: 999, border: "1px solid #c7d2fe", background: "#eef2ff", color: "#4338ca", padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" };
const searchWrap: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, minHeight: 40, padding: "0 12px", border: "1px solid #dbe4ee", borderRadius: 12, background: "#fff", marginBottom: 12 };
const searchInput: React.CSSProperties = { flex: 1, minWidth: 0, border: 0, outline: "none", fontSize: 13, color: "#0f172a", background: "transparent" };
const modalBackdrop: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(15,23,42,0.38)", display: "grid", placeItems: "center", zIndex: 50, padding: 20 };
const modalCard: React.CSSProperties = { width: "min(720px, 100%)", borderRadius: 18, background: "#fff", border: "1px solid #dbe4ee", boxShadow: "0 24px 60px rgba(15,23,42,0.18)", padding: 20 };
const modalHeader: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 16 };
const modalHint: React.CSSProperties = { fontSize: 13, color: "#64748b", lineHeight: 1.6, marginTop: 4 };
const closeButton: React.CSSProperties = { border: "1px solid #dbe4ee", borderRadius: 999, background: "#fff", color: "#334155", padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" };
const modalGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 };
const modalInput: React.CSSProperties = { width: "100%", minHeight: 42, borderRadius: 12, border: "1px solid #dbe4ee", background: "#fff", color: "#0f172a", padding: "10px 12px", fontSize: 13 };
const modalActionRow: React.CSSProperties = { display: "flex", justifyContent: "flex-end", marginTop: 18 };
const primaryActionButton: React.CSSProperties = { border: "1px solid #0b5fff", borderRadius: 12, background: "#0b5fff", color: "#fff", padding: "10px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" };
