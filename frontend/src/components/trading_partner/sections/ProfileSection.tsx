import React, { useEffect, useState } from "react";
import { apiFetch, parseApiError } from "utils/api";
import { PartnerProfile, TradingPartner } from "types/tradingPartner";

const API_BASE = "/trading-partners";

const defaultProfile = (partner: TradingPartner): PartnerProfile => ({
  client_id: partner.client_id,
  partner_id: partner.partner_id,
  profile_name: "Default Profile",
  profile_status: "ACTIVE",
  duplicate_check_enabled: true,
  duplicate_check_scope: "PO_NUMBER",
  split_rule: "NONE",
  split_po_number_strategy: "SAME_PO_NUMBER",
  split_po_separator: "-",
  delivery_date_source: "PO_DELIVERY_DATE",
  delivery_date_offset_type: "NONE",
  delivery_date_offset_days: 0,
  po_date_source: "PO_DATE",
  max_split_quantity: undefined,
  max_split_uom: "",
  split_quantity_basis: "ORDER_QTY",
  split_rounding_mode: "UP",
  split_po_prefix: "",
  split_po_suffix: "",
  split_po_format: "",
});

export default function ProfileSection({ partner, onBanner }: { partner: TradingPartner; onBanner: (text: string) => void; }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<PartnerProfile>(defaultProfile(partner));

  useEffect(() => {
    if (partner?.partner_id) {
      setProfile(defaultProfile(partner));
      loadProfile();
    }
  }, [partner.partner_id]);

  async function loadProfile() {
    if (!partner?.partner_id) return;
    try {
      setLoading(true);
      const res = await apiFetch(`${API_BASE}/${partner.partner_id}/profile`, { method: "GET" });
      if (res.status === 404) {
        setProfile(defaultProfile(partner));
        return;
      }
      if (!res.ok) throw new Error(await parseApiError(res));
      const data = await res.json();
      setProfile({ ...defaultProfile(partner), ...data });
    } catch (err: any) {
      onBanner(err?.message || "Failed to load onboarding profile.");
    } finally {
      setLoading(false);
    }
  }

  async function saveProfile() {
    try {
      setSaving(true);
      const payload = {
        client_id: partner.client_id,
        partner_id: partner.partner_id,
        profile_name: profile.profile_name || "Default Profile",
        profile_status: profile.profile_status || "ACTIVE",
        duplicate_check_enabled: profile.duplicate_check_enabled,
        duplicate_check_scope: profile.duplicate_check_scope,
        split_rule: profile.split_rule,
        split_po_number_strategy: profile.split_po_number_strategy,
        split_po_separator: profile.split_po_separator,
        delivery_date_source: profile.delivery_date_source,
        delivery_date_offset_type: profile.delivery_date_offset_type,
        delivery_date_offset_days: Number(profile.delivery_date_offset_days || 0),
        po_date_source: profile.po_date_source,
        max_split_quantity: profile.max_split_quantity,
        max_split_uom: profile.max_split_uom,
        split_quantity_basis: profile.split_quantity_basis,
        split_rounding_mode: profile.split_rounding_mode,
        split_po_prefix: profile.split_po_prefix,
        split_po_suffix: profile.split_po_suffix,
        split_po_format: profile.split_po_format,
      };
      const res = await apiFetch(`${API_BASE}/${partner.partner_id}/profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      const data = await res.json();
      setProfile({ ...defaultProfile(partner), ...data });
      onBanner("Onboarding profile saved successfully.");
    } catch (err: any) {
      onBanner(err?.message || "Unable to save onboarding profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={card}>
      <div style={title}>Onboarding Profile</div>
      {loading ? <div style={infoText}>Loading profile...</div> : null}
      <div style={grid}>
        {field("Duplicate PO Check", <select value={profile.duplicate_check_enabled ? "YES" : "NO"} onChange={(e) => setProfile({ ...profile, duplicate_check_enabled: e.target.value === "YES" })} style={input}><option value="YES">Enable</option><option value="NO">Disable</option></select>)}
        {field("Duplicate Check Scope", <select value={profile.duplicate_check_scope} onChange={(e) => setProfile({ ...profile, duplicate_check_scope: e.target.value })} style={input}><option value="PO_NUMBER">PO Number</option><option value="PO_NUMBER_AND_DATE">PO Number + Date</option><option value="PO_NUMBER_AND_PARTNER">PO Number + Partner</option><option value="PO_NUMBER_AND_LINE">PO Number + Line Number</option><option value="PO_NUMBER_AND_LINE_AND_PARTNER">PO Number + Line Number + Partner</option><option value="PO_NUMBER_AND_SHIPTO">PO Number + Ship-To</option></select>)}
        {field("Split Rule", <select value={profile.split_rule} onChange={(e) => setProfile({ ...profile, split_rule: e.target.value })} style={input}><option value="NONE">No Split</option><option value="LINE_ITEM">1 Order per Line</option><option value="DELIVERY_DATE">1 Order per Delivery Date</option><option value="QUANTITY_LOAD">1 Order per Quantity Load</option><option value="DELIVERY_LOCATION">1 Order per Delivery Location</option></select>)}
        {field("Split PO Number Strategy", <select value={profile.split_po_number_strategy} onChange={(e) => setProfile({ ...profile, split_po_number_strategy: e.target.value })} style={input}><option value="SAME_PO_NUMBER">Same PO Number</option><option value="PO_PLUS_LINE_NUMBER">PO + Line Number</option><option value="PO_PLUS_SEQUENCE">PO + Sequence</option><option value="PO_PLUS_DELIVERY_DATE">PO + Delivery Date</option><option value="PO_PLUS_SHIPTO">PO + Ship-To</option><option value="CUSTOM_FORMAT">Custom Format</option></select>)}
        {field("Split PO Separator", <input value={profile.split_po_separator || ""} onChange={(e) => setProfile({ ...profile, split_po_separator: e.target.value })} style={input} />)}
        {field("Delivery Date Source", <select value={profile.delivery_date_source} onChange={(e) => setProfile({ ...profile, delivery_date_source: e.target.value })} style={input}><option value="PO_DATE">Same as PO Date</option><option value="PO_DELIVERY_DATE">Delivery Date on PO</option><option value="RECEIVED_DATE">Received Date</option></select>)}
        {field("Delivery Date Offset Type", <select value={profile.delivery_date_offset_type} onChange={(e) => setProfile({ ...profile, delivery_date_offset_type: e.target.value })} style={input}><option value="NONE">No Offset</option><option value="CALENDAR_DAYS">Calendar Days</option><option value="BUSINESS_DAYS">Business Days</option></select>)}
        {field("Delivery Date Offset Days", <input type="number" value={profile.delivery_date_offset_days ?? 0} onChange={(e) => setProfile({ ...profile, delivery_date_offset_days: Number(e.target.value || 0) })} style={input} />)}
        {field("PO Date Source", <select value={profile.po_date_source} onChange={(e) => setProfile({ ...profile, po_date_source: e.target.value })} style={input}><option value="PO_DATE">PO Date from Document</option><option value="RECEIVED_DATE">Use Receipt Date</option></select>)}
        {profile.split_rule === "QUANTITY_LOAD" && <>{field("Maximum Split Quantity", <input type="number" value={profile.max_split_quantity ?? ""} onChange={(e) => setProfile({ ...profile, max_split_quantity: e.target.value === "" ? undefined : Number(e.target.value) })} style={input} />)}{field("Split Quantity UOM", <input value={profile.max_split_uom || ""} onChange={(e) => setProfile({ ...profile, max_split_uom: e.target.value })} style={input} />)}{field("Split Quantity Basis", <select value={profile.split_quantity_basis || "ORDER_QTY"} onChange={(e) => setProfile({ ...profile, split_quantity_basis: e.target.value })} style={input}><option value="ORDER_QTY">Order Quantity</option><option value="DELIVERY_QTY">Delivery Quantity</option></select>)}{field("Split Rounding Mode", <select value={profile.split_rounding_mode || "UP"} onChange={(e) => setProfile({ ...profile, split_rounding_mode: e.target.value })} style={input}><option value="UP">Round Up</option><option value="DOWN">Round Down</option><option value="EXACT">Exact Only</option></select>)}</>}
        {profile.split_po_number_strategy === "CUSTOM_FORMAT" && <>{field("PO Prefix", <input value={profile.split_po_prefix || ""} onChange={(e) => setProfile({ ...profile, split_po_prefix: e.target.value })} style={input} />)}{field("PO Suffix", <input value={profile.split_po_suffix || ""} onChange={(e) => setProfile({ ...profile, split_po_suffix: e.target.value })} style={input} />)}{field("PO Format Pattern", <input value={profile.split_po_format || ""} onChange={(e) => setProfile({ ...profile, split_po_format: e.target.value })} placeholder="{po}-{seq}" style={input} />)}</>}
      </div>
      <div style={buttonRow}><button type="button" style={primaryButton} onClick={saveProfile} disabled={saving}>{saving ? "Saving..." : "Save Profile"}</button></div>
    </div>
  );
}

function field(label: string, child: React.ReactNode) { return <div><div style={labelStyle}>{label}</div>{child}</div>; }
const card: React.CSSProperties = { border: "1px solid #eef2f7", borderRadius: 12, background: "#fff", padding: 16 };
const title: React.CSSProperties = { fontSize: 15, fontWeight: 800, color: "#0f172a", marginBottom: 14 };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 6 };
const input: React.CSSProperties = { width: "100%", minHeight: 38, padding: "8px 10px", borderRadius: 8, border: "1px solid #dbe4ee", background: "#fff", fontSize: 13, color: "#0f172a", outline: "none", boxSizing: "border-box" };
const buttonRow: React.CSSProperties = { display: "flex", gap: 10, marginTop: 14 };
const primaryButton: React.CSSProperties = { border: "1px solid #0b5fff", background: "#0b5fff", color: "#fff", borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" };
const infoText: React.CSSProperties = { color: "#64748b", fontSize: 13, marginBottom: 12 };
