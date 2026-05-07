import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

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
  const { scope, setEnvironmentScope } = useAppScope();
  const isProductionSelected = String(scope.environment || "PROD").toUpperCase() === "PROD";
  const navigate = useNavigate();
  const location = useLocation();
  const { partnerId = "" } = useParams();

  const [partners, setPartners] = useState<TradingPartner[]>([]);
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState("");

  const activeSection = getActiveSection(location.pathname);

  const selectedPartner = useMemo(
    () => partners.find((p) => String(p.partner_id) === String(partnerId)) || null,
    [partners, partnerId]
  );

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

          {loading ? (
            <div style={emptyText}>Loading...</div>
          ) : partners.length === 0 ? (
            <div style={emptyText}>No trading partners found.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {partners.map((p) => {
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
    </div>
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
