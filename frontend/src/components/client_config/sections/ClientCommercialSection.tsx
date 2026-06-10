import React, { useEffect, useMemo, useState } from "react";
import { apiFetch, parseApiError } from "../../../utils/api";

const API_BASE = "/client-config";

type Props = {
  client: { client_id: string; client_name: string } | null;
  environment: string;
  readOnly?: boolean;
  onBanner: (text: string, type?: "success" | "error" | "info") => void;
};

type PriorityRow = {
  priority_id?: string | null;
  sequence_no: number;
  priority_code: string;
  priority_label: string;
  source_system?: string | null;
  is_active: boolean;
};

type ChargeCodeRow = {
  charge_code_id?: string | null;
  charge_code: string;
  charge_type: string;
  description?: string | null;
  mode: string;
  default_value?: number | null;
  currency?: string | null;
  source_system?: string | null;
  is_active: boolean;
};

type ChargeRuleRow = {
  charge_rule_id?: string | null;
  rule_name: string;
  priority: number;
  country?: string | null;
  state?: string | null;
  postal_code?: string | null;
  buyer_group?: string | null;
  buyer_email?: string | null;
  sku?: string | null;
  category?: string | null;
  ship_to_code?: string | null;
  sold_to_code?: string | null;
  charge_code: string;
  override_mode: string;
  override_value?: number | null;
  source_system?: string | null;
  is_active: boolean;
};

type BuyerTermRow = {
  buyer_term_id?: string | null;
  buyer_email: string;
  buyer_name?: string | null;
  payment_terms?: string | null;
  discount_code?: string | null;
  credit_rules?: string | null;
  tax_exemption_code?: string | null;
  source_system?: string | null;
  is_active: boolean;
};

type ProductMapRow = {
  product_commercial_map_id?: string | null;
  sku: string;
  default_tax_code?: string | null;
  default_freight_code?: string | null;
  default_shipping_code?: string | null;
  default_octroi_code?: string | null;
  default_discount_code?: string | null;
  source_system?: string | null;
  is_active: boolean;
};

type CommercialForm = {
  source_mode: string;
  erp_sync_enabled: boolean;
  erp_sync_frequency: string;
  erp_last_sync_at: string;
  currency_mode: string;
  fallback_policy: string;
  checkout_priority: PriorityRow[];
  charge_codes: ChargeCodeRow[];
  jurisdiction_rules: ChargeRuleRow[];
  buyer_terms: BuyerTermRow[];
  product_mapping: ProductMapRow[];
};

const defaultForm: CommercialForm = {
  source_mode: "ORDANEX_MASTER",
  erp_sync_enabled: false,
  erp_sync_frequency: "DAILY",
  erp_last_sync_at: "",
  currency_mode: "CLIENT_DEFAULT",
  fallback_policy: "ZERO_FALLBACK",
  checkout_priority: [
    { sequence_no: 1, priority_code: "ERP_BUYER_CONTRACT", priority_label: "Buyer-specific ERP contract", source_system: "ERP", is_active: true },
    { sequence_no: 2, priority_code: "ERP_SHIP_TO_RULE", priority_label: "Ship-to jurisdiction ERP rule", source_system: "ERP", is_active: true },
    { sequence_no: 3, priority_code: "ERP_PRODUCT_MAPPING", priority_label: "Product ERP mapping", source_system: "ERP", is_active: true },
    { sequence_no: 4, priority_code: "ORDANEX_OVERRIDE", priority_label: "Ordanex storefront override", source_system: "ORDANEX", is_active: true },
    { sequence_no: 5, priority_code: "CLIENT_DEFAULT", priority_label: "Ordanex client default", source_system: "ORDANEX", is_active: true },
    { sequence_no: 6, priority_code: "ZERO_FALLBACK", priority_label: "Zero fallback", source_system: "SYSTEM", is_active: true },
  ],
  charge_codes: [],
  jurisdiction_rules: [],
  buyer_terms: [],
  product_mapping: [],
};

function numberValue(value: string) {
  const text = value.trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function boolLabel(value: boolean) {
  return value ? "YES" : "NO";
}

function cleanText(value?: string | null) {
  return String(value || "").trim();
}

export default function ClientCommercialSection({ client, environment, readOnly = false, onBanner }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [form, setForm] = useState<CommercialForm>(defaultForm);

  const envQuery = useMemo(() => new URLSearchParams({ environment }).toString(), [environment]);
  const isProduction = String(environment || "PROD").toUpperCase() === "PROD";

  useEffect(() => {
    if (!client?.client_id) return;
    void load();
  }, [client?.client_id, envQuery]);

  async function load() {
    if (!client?.client_id) return;
    try {
      setLoading(true);
      const res = await apiFetch(`${API_BASE}/client-commercial-settings/${client.client_id}?${envQuery}`);
      if (!res.ok) throw new Error(await parseApiError(res));
      const data = await res.json();
      setForm({
        source_mode: data?.source_mode || defaultForm.source_mode,
        erp_sync_enabled: Boolean(data?.erp_sync_enabled),
        erp_sync_frequency: data?.erp_sync_frequency || defaultForm.erp_sync_frequency,
        erp_last_sync_at: data?.erp_last_sync_at || "",
        currency_mode: data?.currency_mode || defaultForm.currency_mode,
        fallback_policy: data?.fallback_policy || defaultForm.fallback_policy,
        checkout_priority: Array.isArray(data?.checkout_priority) && data.checkout_priority.length ? data.checkout_priority : defaultForm.checkout_priority,
        charge_codes: Array.isArray(data?.charge_codes) ? data.charge_codes : [],
        jurisdiction_rules: Array.isArray(data?.jurisdiction_rules) ? data.jurisdiction_rules : [],
        buyer_terms: Array.isArray(data?.buyer_terms) ? data.buyer_terms : [],
        product_mapping: Array.isArray(data?.product_mapping) ? data.product_mapping : [],
      });
    } catch (err: any) {
      onBanner(err?.message || "Failed to load commercial settings.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!client?.client_id) return;
    try {
      setSaving(true);
      const payload = {
        source_mode: form.source_mode,
        erp_sync_enabled: form.erp_sync_enabled,
        erp_sync_frequency: form.erp_sync_frequency,
        erp_last_sync_at: cleanText(form.erp_last_sync_at) || null,
        currency_mode: form.currency_mode,
        fallback_policy: form.fallback_policy,
        checkout_priority: form.checkout_priority.map((row, index) => ({
          ...row,
          sequence_no: Number(row.sequence_no) || index + 1,
          priority_code: cleanText(row.priority_code),
          priority_label: cleanText(row.priority_label),
        })).filter((row) => row.priority_code && row.priority_label),
        charge_codes: form.charge_codes.map((row) => ({
          ...row,
          charge_code: cleanText(row.charge_code).toUpperCase(),
          charge_type: cleanText(row.charge_type).toUpperCase(),
          mode: cleanText(row.mode).toUpperCase() || "PERCENT",
          default_value: row.default_value ?? null,
          currency: cleanText(row.currency),
          source_system: cleanText(row.source_system),
        })).filter((row) => row.charge_code && row.charge_type),
        jurisdiction_rules: form.jurisdiction_rules.map((row) => ({
          ...row,
          rule_name: cleanText(row.rule_name),
          charge_code: cleanText(row.charge_code).toUpperCase(),
          override_mode: cleanText(row.override_mode).toUpperCase() || "DEFAULT",
          priority: Number(row.priority) || 100,
          source_system: cleanText(row.source_system),
        })).filter((row) => row.rule_name && row.charge_code),
        buyer_terms: form.buyer_terms.map((row) => ({
          ...row,
          buyer_email: cleanText(row.buyer_email).toLowerCase(),
          buyer_name: cleanText(row.buyer_name),
          payment_terms: cleanText(row.payment_terms),
          discount_code: cleanText(row.discount_code).toUpperCase(),
          credit_rules: cleanText(row.credit_rules),
          tax_exemption_code: cleanText(row.tax_exemption_code).toUpperCase(),
          source_system: cleanText(row.source_system),
        })).filter((row) => row.buyer_email),
        product_mapping: form.product_mapping.map((row) => ({
          ...row,
          sku: cleanText(row.sku).toUpperCase(),
          default_tax_code: cleanText(row.default_tax_code).toUpperCase(),
          default_freight_code: cleanText(row.default_freight_code).toUpperCase(),
          default_shipping_code: cleanText(row.default_shipping_code).toUpperCase(),
          default_octroi_code: cleanText(row.default_octroi_code).toUpperCase(),
          default_discount_code: cleanText(row.default_discount_code).toUpperCase(),
          source_system: cleanText(row.source_system),
        })).filter((row) => row.sku),
      };
      const res = await apiFetch(`${API_BASE}/client-commercial-settings/${client.client_id}?${envQuery}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      await load();
      onBanner("Commercial settings saved.", "success");
    } catch (err: any) {
      onBanner(err?.message || "Failed to save commercial settings.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (!client?.client_id) return;
    try {
      setPublishing(true);
      const res = await apiFetch(`${API_BASE}/client-commercial-settings/${client.client_id}/publish?from_environment=STAGING&to_environment=PROD`, { method: "POST" });
      if (!res.ok) throw new Error(await parseApiError(res));
      onBanner("Commercial settings published to Production.", "success");
    } catch (err: any) {
      onBanner(err?.message || "Failed to publish commercial settings.", "error");
    } finally {
      setPublishing(false);
    }
  }

  function addPriority() {
    setForm((current) => ({
      ...current,
      checkout_priority: [
        ...current.checkout_priority,
        { sequence_no: current.checkout_priority.length + 1, priority_code: "", priority_label: "", source_system: "ORDANEX", is_active: true },
      ],
    }));
  }

  function addChargeCode() {
    setForm((current) => ({
      ...current,
      charge_codes: [
        ...current.charge_codes,
        { charge_code: "", charge_type: "TAX", description: "", mode: "PERCENT", default_value: null, currency: "USD", source_system: "ORDANEX", is_active: true },
      ],
    }));
  }

  function addRule() {
    setForm((current) => ({
      ...current,
      jurisdiction_rules: [
        ...current.jurisdiction_rules,
        { rule_name: "", priority: 100, country: "", state: "", postal_code: "", buyer_group: "", buyer_email: "", sku: "", category: "", ship_to_code: "", sold_to_code: "", charge_code: "", override_mode: "DEFAULT", override_value: null, source_system: "ORDANEX", is_active: true },
      ],
    }));
  }

  function addBuyerTerm() {
    setForm((current) => ({
      ...current,
      buyer_terms: [
        ...current.buyer_terms,
        { buyer_email: "", buyer_name: "", payment_terms: "", discount_code: "", credit_rules: "", tax_exemption_code: "", source_system: "ORDANEX", is_active: true },
      ],
    }));
  }

  function addProductMap() {
    setForm((current) => ({
      ...current,
      product_mapping: [
        ...current.product_mapping,
        { sku: "", default_tax_code: "", default_freight_code: "", default_shipping_code: "", default_octroi_code: "", default_discount_code: "", source_system: "ORDANEX", is_active: true },
      ],
    }));
  }

  return (
    <div>
      <div style={headerRow}>
        <div>
          <div style={title}>Commercial Rules</div>
          <div style={subtitle}>Manage source ownership, ERP sync behavior, charge codes, jurisdiction rules, buyer terms, and SKU-level commercial mapping as normalized client records.</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!isProduction ? (
            <>
              <button type="button" onClick={publish} disabled={publishing || saving || loading} style={button}>
                {publishing ? "Publishing..." : "Publish to production"}
              </button>
              <button type="button" onClick={save} disabled={saving || loading} style={buttonPrimary}>
                {saving ? "Saving..." : "Save commercial settings"}
              </button>
            </>
          ) : (
            <button type="button" disabled style={buttonPrimary}>Production is read-only</button>
          )}
        </div>
      </div>

      <div style={callout}>
        <strong>Recommended model:</strong> use <code>ERP_MASTER</code> or <code>HYBRID</code> for ERP-connected clients, and <code>ORDANEX_MASTER</code> for storefront-only or non-ERP suppliers.
      </div>

      {readOnly ? <div style={readOnlyBanner}>Production is read-only for commercial governance. Prepare updates in Staging, then publish them to Production.</div> : null}

      <fieldset style={fieldsetStyle} disabled={readOnly || loading}>
        <div style={grid2}>
          {field("Commercial Source Model", <select value={form.source_mode} onChange={(e) => setForm((current) => ({ ...current, source_mode: e.target.value }))} style={inputStyle}><option value="ERP_MASTER">ERP_MASTER</option><option value="ORDANEX_MASTER">ORDANEX_MASTER</option><option value="HYBRID">HYBRID</option></select>)}
          {field("ERP Sync Enabled", <select value={boolLabel(form.erp_sync_enabled)} onChange={(e) => setForm((current) => ({ ...current, erp_sync_enabled: e.target.value === "YES" }))} style={inputStyle}><option value="YES">YES</option><option value="NO">NO</option></select>)}
          {field("ERP Sync Frequency", <select value={form.erp_sync_frequency} onChange={(e) => setForm((current) => ({ ...current, erp_sync_frequency: e.target.value }))} style={inputStyle}><option value="MANUAL">MANUAL</option><option value="HOURLY">HOURLY</option><option value="DAILY">DAILY</option><option value="WEEKLY">WEEKLY</option></select>)}
          {field("ERP Last Sync At", <input value={form.erp_last_sync_at} onChange={(e) => setForm((current) => ({ ...current, erp_last_sync_at: e.target.value }))} style={inputStyle} placeholder="ISO timestamp or leave blank" />)}
          {field("Currency Mode", <select value={form.currency_mode} onChange={(e) => setForm((current) => ({ ...current, currency_mode: e.target.value }))} style={inputStyle}><option value="CLIENT_DEFAULT">CLIENT_DEFAULT</option><option value="ERP_DEFAULT">ERP_DEFAULT</option><option value="BUYER_CONTEXT">BUYER_CONTEXT</option></select>)}
          {field("Fallback Policy", <select value={form.fallback_policy} onChange={(e) => setForm((current) => ({ ...current, fallback_policy: e.target.value }))} style={inputStyle}><option value="ZERO_FALLBACK">ZERO_FALLBACK</option><option value="CLIENT_DEFAULTS">CLIENT_DEFAULTS</option><option value="STORE_FRONT_OVERLAY">STORE_FRONT_OVERLAY</option></select>)}
        </div>

        <SectionCard title="Checkout Priority / Fallback" helper="Define the precedence used during order pricing and charge resolution.">
          <Toolbar onAdd={addPriority} addLabel="Add priority" />
          <TableWrap>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <HeaderCell>Seq</HeaderCell>
                  <HeaderCell>Code</HeaderCell>
                  <HeaderCell>Label</HeaderCell>
                  <HeaderCell>Source</HeaderCell>
                  <HeaderCell>Active</HeaderCell>
                  <HeaderCell />
                </tr>
              </thead>
              <tbody>
                {form.checkout_priority.map((row, index) => (
                  <tr key={row.priority_id || `priority-${index}`}>
                    <Cell><input value={String(row.sequence_no)} onChange={(e) => setForm((current) => ({ ...current, checkout_priority: current.checkout_priority.map((entry, i) => i === index ? { ...entry, sequence_no: Number(e.target.value) || index + 1 } : entry) }))} style={cellInput} /></Cell>
                    <Cell><input value={row.priority_code} onChange={(e) => setForm((current) => ({ ...current, checkout_priority: current.checkout_priority.map((entry, i) => i === index ? { ...entry, priority_code: e.target.value.toUpperCase() } : entry) }))} style={cellInput} /></Cell>
                    <Cell><input value={row.priority_label} onChange={(e) => setForm((current) => ({ ...current, checkout_priority: current.checkout_priority.map((entry, i) => i === index ? { ...entry, priority_label: e.target.value } : entry) }))} style={cellInput} /></Cell>
                    <Cell><input value={row.source_system || ""} onChange={(e) => setForm((current) => ({ ...current, checkout_priority: current.checkout_priority.map((entry, i) => i === index ? { ...entry, source_system: e.target.value } : entry) }))} style={cellInput} /></Cell>
                    <Cell><input type="checkbox" checked={row.is_active} onChange={(e) => setForm((current) => ({ ...current, checkout_priority: current.checkout_priority.map((entry, i) => i === index ? { ...entry, is_active: e.target.checked } : entry) }))} /></Cell>
                    <Cell><RemoveButton onClick={() => setForm((current) => ({ ...current, checkout_priority: current.checkout_priority.filter((_, i) => i !== index) }))} /></Cell>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </SectionCard>

        <SectionCard title="Charge Codes" helper="Store reusable charge definitions for tax, freight, octroi, shipping, and discount handling.">
          <Toolbar onAdd={addChargeCode} addLabel="Add charge code" />
          <TableWrap>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <HeaderCell>Code</HeaderCell>
                  <HeaderCell>Type</HeaderCell>
                  <HeaderCell>Mode</HeaderCell>
                  <HeaderCell>Default</HeaderCell>
                  <HeaderCell>Currency</HeaderCell>
                  <HeaderCell>Description</HeaderCell>
                  <HeaderCell>Source</HeaderCell>
                  <HeaderCell>Active</HeaderCell>
                  <HeaderCell />
                </tr>
              </thead>
              <tbody>
                {form.charge_codes.map((row, index) => (
                  <tr key={row.charge_code_id || `charge-${index}`}>
                    <Cell><input value={row.charge_code} onChange={(e) => updateChargeCode(index, { charge_code: e.target.value.toUpperCase() })} style={cellInput} /></Cell>
                    <Cell><select value={row.charge_type} onChange={(e) => updateChargeCode(index, { charge_type: e.target.value })} style={cellInput}><option value="TAX">TAX</option><option value="FREIGHT">FREIGHT</option><option value="OCTROI">OCTROI</option><option value="SHIPPING">SHIPPING</option><option value="DISCOUNT">DISCOUNT</option></select></Cell>
                    <Cell><select value={row.mode} onChange={(e) => updateChargeCode(index, { mode: e.target.value })} style={cellInput}><option value="PERCENT">PERCENT</option><option value="AMOUNT">AMOUNT</option></select></Cell>
                    <Cell><input value={row.default_value ?? ""} onChange={(e) => updateChargeCode(index, { default_value: numberValue(e.target.value) })} style={cellInput} /></Cell>
                    <Cell><input value={row.currency || ""} onChange={(e) => updateChargeCode(index, { currency: e.target.value.toUpperCase() })} style={cellInput} /></Cell>
                    <Cell><input value={row.description || ""} onChange={(e) => updateChargeCode(index, { description: e.target.value })} style={cellInput} /></Cell>
                    <Cell><input value={row.source_system || ""} onChange={(e) => updateChargeCode(index, { source_system: e.target.value })} style={cellInput} /></Cell>
                    <Cell><input type="checkbox" checked={row.is_active} onChange={(e) => updateChargeCode(index, { is_active: e.target.checked })} /></Cell>
                    <Cell><RemoveButton onClick={() => setForm((current) => ({ ...current, charge_codes: current.charge_codes.filter((_, i) => i !== index) }))} /></Cell>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </SectionCard>

        <SectionCard title="Jurisdiction Rules" helper="Target charge overrides by buyer, geography, SKU, category, sold-to, and ship-to.">
          <Toolbar onAdd={addRule} addLabel="Add rule" />
          <TableWrap>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <HeaderCell>Rule</HeaderCell>
                  <HeaderCell>Priority</HeaderCell>
                  <HeaderCell>Charge</HeaderCell>
                  <HeaderCell>Mode</HeaderCell>
                  <HeaderCell>Value</HeaderCell>
                  <HeaderCell>Buyer</HeaderCell>
                  <HeaderCell>SKU</HeaderCell>
                  <HeaderCell>Category</HeaderCell>
                  <HeaderCell>Ship-To</HeaderCell>
                  <HeaderCell>Sold-To</HeaderCell>
                  <HeaderCell>Country</HeaderCell>
                  <HeaderCell>State</HeaderCell>
                  <HeaderCell>Postal</HeaderCell>
                  <HeaderCell>Source</HeaderCell>
                  <HeaderCell>Active</HeaderCell>
                  <HeaderCell />
                </tr>
              </thead>
              <tbody>
                {form.jurisdiction_rules.map((row, index) => (
                  <tr key={row.charge_rule_id || `rule-${index}`}>
                    <Cell><input value={row.rule_name} onChange={(e) => updateRule(index, { rule_name: e.target.value })} style={cellInput} /></Cell>
                    <Cell><input value={String(row.priority)} onChange={(e) => updateRule(index, { priority: Number(e.target.value) || 100 })} style={cellInput} /></Cell>
                    <Cell><input value={row.charge_code} onChange={(e) => updateRule(index, { charge_code: e.target.value.toUpperCase() })} style={cellInput} /></Cell>
                    <Cell><select value={row.override_mode} onChange={(e) => updateRule(index, { override_mode: e.target.value })} style={cellInput}><option value="DEFAULT">DEFAULT</option><option value="OVERRIDE">OVERRIDE</option></select></Cell>
                    <Cell><input value={row.override_value ?? ""} onChange={(e) => updateRule(index, { override_value: numberValue(e.target.value) })} style={cellInput} /></Cell>
                    <Cell><input value={row.buyer_email || ""} onChange={(e) => updateRule(index, { buyer_email: e.target.value.toLowerCase() })} style={cellInput} /></Cell>
                    <Cell><input value={row.sku || ""} onChange={(e) => updateRule(index, { sku: e.target.value.toUpperCase() })} style={cellInput} /></Cell>
                    <Cell><input value={row.category || ""} onChange={(e) => updateRule(index, { category: e.target.value })} style={cellInput} /></Cell>
                    <Cell><input value={row.ship_to_code || ""} onChange={(e) => updateRule(index, { ship_to_code: e.target.value })} style={cellInput} /></Cell>
                    <Cell><input value={row.sold_to_code || ""} onChange={(e) => updateRule(index, { sold_to_code: e.target.value })} style={cellInput} /></Cell>
                    <Cell><input value={row.country || ""} onChange={(e) => updateRule(index, { country: e.target.value })} style={cellInput} /></Cell>
                    <Cell><input value={row.state || ""} onChange={(e) => updateRule(index, { state: e.target.value })} style={cellInput} /></Cell>
                    <Cell><input value={row.postal_code || ""} onChange={(e) => updateRule(index, { postal_code: e.target.value })} style={cellInput} /></Cell>
                    <Cell><input value={row.source_system || ""} onChange={(e) => updateRule(index, { source_system: e.target.value })} style={cellInput} /></Cell>
                    <Cell><input type="checkbox" checked={row.is_active} onChange={(e) => updateRule(index, { is_active: e.target.checked })} /></Cell>
                    <Cell><RemoveButton onClick={() => setForm((current) => ({ ...current, jurisdiction_rules: current.jurisdiction_rules.filter((_, i) => i !== index) }))} /></Cell>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </SectionCard>

        <SectionCard title="Buyer Commercial Terms" helper="Manage buyer-level payment terms, discount programs, and tax exemptions.">
          <Toolbar onAdd={addBuyerTerm} addLabel="Add buyer term" />
          <TableWrap>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <HeaderCell>Buyer Email</HeaderCell>
                  <HeaderCell>Buyer Name</HeaderCell>
                  <HeaderCell>Payment Terms</HeaderCell>
                  <HeaderCell>Discount Code</HeaderCell>
                  <HeaderCell>Tax Exemption</HeaderCell>
                  <HeaderCell>Credit Rules</HeaderCell>
                  <HeaderCell>Source</HeaderCell>
                  <HeaderCell>Active</HeaderCell>
                  <HeaderCell />
                </tr>
              </thead>
              <tbody>
                {form.buyer_terms.map((row, index) => (
                  <tr key={row.buyer_term_id || `buyer-${index}`}>
                    <Cell><input value={row.buyer_email} onChange={(e) => updateBuyerTerm(index, { buyer_email: e.target.value.toLowerCase() })} style={cellInput} /></Cell>
                    <Cell><input value={row.buyer_name || ""} onChange={(e) => updateBuyerTerm(index, { buyer_name: e.target.value })} style={cellInput} /></Cell>
                    <Cell><input value={row.payment_terms || ""} onChange={(e) => updateBuyerTerm(index, { payment_terms: e.target.value })} style={cellInput} /></Cell>
                    <Cell><input value={row.discount_code || ""} onChange={(e) => updateBuyerTerm(index, { discount_code: e.target.value.toUpperCase() })} style={cellInput} /></Cell>
                    <Cell><input value={row.tax_exemption_code || ""} onChange={(e) => updateBuyerTerm(index, { tax_exemption_code: e.target.value.toUpperCase() })} style={cellInput} /></Cell>
                    <Cell><input value={row.credit_rules || ""} onChange={(e) => updateBuyerTerm(index, { credit_rules: e.target.value })} style={cellInput} /></Cell>
                    <Cell><input value={row.source_system || ""} onChange={(e) => updateBuyerTerm(index, { source_system: e.target.value })} style={cellInput} /></Cell>
                    <Cell><input type="checkbox" checked={row.is_active} onChange={(e) => updateBuyerTerm(index, { is_active: e.target.checked })} /></Cell>
                    <Cell><RemoveButton onClick={() => setForm((current) => ({ ...current, buyer_terms: current.buyer_terms.filter((_, i) => i !== index) }))} /></Cell>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </SectionCard>

        <SectionCard title="Product Commercial Mapping" helper="Assign default charge-code references per SKU for checkout and order audit snapshots.">
          <Toolbar onAdd={addProductMap} addLabel="Add SKU mapping" />
          <TableWrap>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <HeaderCell>SKU</HeaderCell>
                  <HeaderCell>Tax</HeaderCell>
                  <HeaderCell>Freight</HeaderCell>
                  <HeaderCell>Shipping</HeaderCell>
                  <HeaderCell>Octroi</HeaderCell>
                  <HeaderCell>Discount</HeaderCell>
                  <HeaderCell>Source</HeaderCell>
                  <HeaderCell>Active</HeaderCell>
                  <HeaderCell />
                </tr>
              </thead>
              <tbody>
                {form.product_mapping.map((row, index) => (
                  <tr key={row.product_commercial_map_id || `product-${index}`}>
                    <Cell><input value={row.sku} onChange={(e) => updateProductMap(index, { sku: e.target.value.toUpperCase() })} style={cellInput} /></Cell>
                    <Cell><input value={row.default_tax_code || ""} onChange={(e) => updateProductMap(index, { default_tax_code: e.target.value.toUpperCase() })} style={cellInput} /></Cell>
                    <Cell><input value={row.default_freight_code || ""} onChange={(e) => updateProductMap(index, { default_freight_code: e.target.value.toUpperCase() })} style={cellInput} /></Cell>
                    <Cell><input value={row.default_shipping_code || ""} onChange={(e) => updateProductMap(index, { default_shipping_code: e.target.value.toUpperCase() })} style={cellInput} /></Cell>
                    <Cell><input value={row.default_octroi_code || ""} onChange={(e) => updateProductMap(index, { default_octroi_code: e.target.value.toUpperCase() })} style={cellInput} /></Cell>
                    <Cell><input value={row.default_discount_code || ""} onChange={(e) => updateProductMap(index, { default_discount_code: e.target.value.toUpperCase() })} style={cellInput} /></Cell>
                    <Cell><input value={row.source_system || ""} onChange={(e) => updateProductMap(index, { source_system: e.target.value })} style={cellInput} /></Cell>
                    <Cell><input type="checkbox" checked={row.is_active} onChange={(e) => updateProductMap(index, { is_active: e.target.checked })} /></Cell>
                    <Cell><RemoveButton onClick={() => setForm((current) => ({ ...current, product_mapping: current.product_mapping.filter((_, i) => i !== index) }))} /></Cell>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </SectionCard>
      </fieldset>
    </div>
  );

  function updateChargeCode(index: number, patch: Partial<ChargeCodeRow>) {
    setForm((current) => ({
      ...current,
      charge_codes: current.charge_codes.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    }));
  }

  function updateRule(index: number, patch: Partial<ChargeRuleRow>) {
    setForm((current) => ({
      ...current,
      jurisdiction_rules: current.jurisdiction_rules.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    }));
  }

  function updateBuyerTerm(index: number, patch: Partial<BuyerTermRow>) {
    setForm((current) => ({
      ...current,
      buyer_terms: current.buyer_terms.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    }));
  }

  function updateProductMap(index: number, patch: Partial<ProductMapRow>) {
    setForm((current) => ({
      ...current,
      product_mapping: current.product_mapping.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    }));
  }
}

function SectionCard({ title, helper, children }: { title: string; helper: string; children: React.ReactNode }) {
  return (
    <div style={card}>
      <div style={cardTitle}>{title}</div>
      <div style={cardHelper}>{helper}</div>
      {children}
    </div>
  );
}

function Toolbar({ onAdd, addLabel }: { onAdd: () => void; addLabel: string }) {
  return (
    <div style={toolbar}>
      <button type="button" onClick={onAdd} style={buttonSecondary}>{addLabel}</button>
    </div>
  );
}

function TableWrap({ children }: { children: React.ReactNode }) {
  return <div style={tableWrap}>{children}</div>;
}

function HeaderCell({ children }: { children: React.ReactNode }) {
  return <th style={headerCell}>{children}</th>;
}

function Cell({ children }: { children: React.ReactNode }) {
  return <td style={cell}>{children}</td>;
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={removeButton}>
      Remove
    </button>
  );
}

function field(label: string, child: React.ReactNode) {
  return <div><div style={labelStyle}>{label}</div>{child}</div>;
}

const headerRow: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16, flexWrap: "wrap" };
const title: React.CSSProperties = { fontSize: 18, fontWeight: 800, color: "#0f172a" };
const subtitle: React.CSSProperties = { fontSize: 12, color: "#64748b", marginTop: 4, lineHeight: 1.6, maxWidth: 840 };
const callout: React.CSSProperties = { marginBottom: 14, border: "1px solid #dbeafe", background: "#eff6ff", color: "#1d4ed8", borderRadius: 10, padding: "12px 14px", fontSize: 12, lineHeight: 1.7 };
const readOnlyBanner: React.CSSProperties = { marginBottom: 14, border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: 10, padding: "10px 12px", fontSize: 13, fontWeight: 600 };
const fieldsetStyle: React.CSSProperties = { border: 0, padding: 0, margin: 0, minInlineSize: 0, display: "grid", gap: 14 };
const grid2: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14 };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 6 };
const inputStyle: React.CSSProperties = { width: "100%", minHeight: 40, padding: "8px 10px", borderRadius: 10, border: "1px solid #dbe4ee", background: "#fff", fontSize: 13, color: "#0f172a", outline: "none", boxSizing: "border-box" };
const cellInput: React.CSSProperties = { width: "100%", minHeight: 34, padding: "6px 8px", borderRadius: 8, border: "1px solid #dbe4ee", background: "#fff", fontSize: 12, color: "#0f172a", boxSizing: "border-box" };
const card: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 14, background: "#fff", padding: 16 };
const cardTitle: React.CSSProperties = { fontSize: 14, fontWeight: 800, color: "#0f172a" };
const cardHelper: React.CSSProperties = { fontSize: 12, color: "#64748b", marginTop: 4, marginBottom: 10, lineHeight: 1.6 };
const toolbar: React.CSSProperties = { display: "flex", justifyContent: "flex-end", marginBottom: 10 };
const tableWrap: React.CSSProperties = { overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: 12 };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: 980 };
const headerCell: React.CSSProperties = { textAlign: "left", fontSize: 11, fontWeight: 800, letterSpacing: 0.2, color: "#475569", background: "#f8fafc", padding: "10px 8px", borderBottom: "1px solid #e5e7eb", verticalAlign: "top" };
const cell: React.CSSProperties = { padding: 8, borderBottom: "1px solid #f1f5f9", verticalAlign: "top", background: "#fff" };
const button: React.CSSProperties = { border: "1px solid #cbd5e1", background: "#fff", color: "#0f172a", borderRadius: 10, padding: "10px 14px", cursor: "pointer", fontWeight: 700, fontSize: 12 };
const buttonPrimary: React.CSSProperties = { border: "1px solid #0b5fff", background: "#0b5fff", color: "#fff", borderRadius: 10, padding: "10px 14px", cursor: "pointer", fontWeight: 700, fontSize: 12 };
const buttonSecondary: React.CSSProperties = { border: "1px solid #dbe4ee", background: "#fff", color: "#0f172a", borderRadius: 10, padding: "8px 12px", cursor: "pointer", fontWeight: 700, fontSize: 12 };
const removeButton: React.CSSProperties = { border: "1px solid #fecaca", background: "#fff", color: "#b91c1c", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontWeight: 700, fontSize: 11 };
