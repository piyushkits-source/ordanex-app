import React, { useEffect, useState } from "react";
import { apiFetch, parseApiError } from "utils/api";
import { TradingPartner, UomRule } from "types/tradingPartner";
import UomRuleModal from "components/trading_partner/modals/UomRuleModal";

const API_BASE = "/trading-partners";

const defaultUomRule = (partnerId: string): UomRule => ({
  partner_id: partnerId,
  customer_code: "",
  supplier_code: "",
  ship_to_code: "",
  material_code: "",
  product_code: "",
  input_uom: "EA",
  output_uom: "EA",
  conversion_factor: "1",
  conversion_divider: "1",
  rounding_digits: 2,
  priority: 100,
  is_active: true,
  notes: "",
});

export default function UomSection({
  partner,
  onBanner,
}: {
  partner: TradingPartner;
  onBanner: (text: string) => void;
}) {
  const [rows, setRows] = useState<UomRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [form, setForm] = useState<UomRule>(defaultUomRule(partner.partner_id));
  const [advancedRule, setAdvancedRule] = useState({
    rule_name: "",
    customer_code: "",
    supplier_code: "",
    ship_to_code: "",
    material_code: "",
    product_code: "",
    match_field: "description",
    match_operator: "ends_with",
    match_value: "KG-PAIL, KG PAIL, KG-DR, KG DR, KG-KIT, KG KIT",
    description_regex: "(\\d+(?:\\.\\d+)?)\\s*(KG[- ](?:PAIL|DR|KIT))$",
    input_uom: "ANY",
    output_uom: "KGM",
    lb_output_uom: "PL",
    kg_output_uom: "KGM",
    lb_multiplier: "2.204",
    conversion_factor: "",
    conversion_divider: "",
    rounding_digits: "0",
    rounding_mode: "HALF_UP",
    priority: "10",
    notes: "",
    active: true,
  });
  const [previewSample, setPreviewSample] = useState({
    description: "MG-2401 SILICONE ADHESIVE, KG, 16KG-PAIL",
    quantity: "35.274",
    unit: "LB",
  });
  const [previewResult, setPreviewResult] = useState<any>(null);
  const [selectedPreset, setSelectedPreset] = useState("KG Package Conversion");

  useEffect(() => {
    setForm(defaultUomRule(partner.partner_id));
    void loadRows();
  }, [partner.partner_id]);

  async function loadRows() {
    try {
      setLoading(true);
      const res = await apiFetch(
        `${API_BASE}/${partner.partner_id}/uom-rules`,
        { method: "GET" }
      );
      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch (err: any) {
      onBanner(err?.message || "Failed to load UOM rules.");
    } finally {
      setLoading(false);
    }
  }

  async function saveRow() {
    try {
      const endpoint = form.uom_rule_id
        ? `${API_BASE}/uom-rules/${form.uom_rule_id}`
        : `${API_BASE}/uom-rules`;

      const method = form.uom_rule_id ? "PUT" : "POST";

      const payload = {
        ...form,
        partner_id: partner.partner_id,
        customer_code: nullable(form.customer_code),
        supplier_code: nullable(form.supplier_code),
        ship_to_code: nullable(form.ship_to_code),
        material_code: nullable(form.material_code),
        product_code: nullable(form.product_code),
        conversion_factor: nullable(form.conversion_factor),
        conversion_divider: nullable(form.conversion_divider),
        notes: nullable(form.notes),
      };

      const res = await apiFetch(endpoint, {
        method,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }

      onBanner(form.uom_rule_id ? "UOM rule updated successfully." : "UOM rule saved successfully.");
      setModalOpen(false);
      setForm(defaultUomRule(partner.partner_id));
      await loadRows();
    } catch (err: any) {
      onBanner(err?.message || "Unable to save UOM rule.");
    }
  }

  async function deleteRow(rule: UomRule) {
    try {
      if (!rule.uom_rule_id) return;
      if (!window.confirm("Delete this UOM rule?")) return;

      const res = await apiFetch(`${API_BASE}/uom-rules/${rule.uom_rule_id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }

      onBanner("UOM rule deleted successfully.");
      await loadRows();
    } catch (err: any) {
      onBanner(err?.message || "Unable to delete UOM rule.");
    }
  }

  async function downloadTemplate() {
    try {
      setBusy(true);

      const res = await apiFetch(`${API_BASE}/${partner.partner_id}/uom/template`, {
        method: "GET",
      });

      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "uom_template.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(url);
      onBanner("UOM template downloaded successfully.");
    } catch (err: any) {
      onBanner(err?.message || "Unable to download UOM template.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadWorkbook(file: File) {
    try {
      setBusy(true);

      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${API_BASE}/${partner.partner_id}/uom/upload`, {
        method: "POST",
        body: formData,
      });

      const contentType = res.headers.get("content-type") || "";
      const uploadStatus = res.headers.get("X-Upload-Status") || "";

      if (!res.ok) {
        throw new Error(await res.text());
      }

      if (
        uploadStatus === "validation_failed" ||
        contentType.includes("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      ) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = "uom_validation_errors.xlsx";
        document.body.appendChild(a);
        a.click();
        a.remove();

        window.URL.revokeObjectURL(url);
        onBanner("Validation failed. Error workbook downloaded.");
        return;
      }

      const data = await res.json();
      onBanner(`Upload successful. Rows processed: ${data.rows_processed ?? 0}`);
      setSelectedFile(null);
      await loadRows();
    } catch (err: any) {
      onBanner(err?.message || "Unable to upload UOM workbook.");
    } finally {
      setBusy(false);
    }
  }

  function loadKgPackageTemplate() {
    setAdvancedRule({
      rule_name: "KG Package Conversion",
      customer_code: "",
      supplier_code: "",
      ship_to_code: "",
      material_code: "",
      product_code: "",
      match_field: "description",
      match_operator: "ends_with",
      match_value: "KG-PAIL, KG PAIL, KG-DR, KG DR, KG-KIT, KG KIT",
      description_regex: "(\\d+(?:\\.\\d+)?)\\s*(KG[- ](?:PAIL|DR|KIT))$",
      input_uom: "ANY",
      output_uom: "KGM",
      lb_output_uom: "PL",
      kg_output_uom: "KGM",
      lb_multiplier: "2.204",
      conversion_factor: "1",
      conversion_divider: "1",
      rounding_digits: "0",
      rounding_mode: "HALF_UP",
      priority: "10",
      notes: "Built from the description suffix template.",
      active: true,
    });
  }

  function buildAdvancedRuleNotes() {
    const suffixes = advancedRule.match_value
      .split(",")
      .map((entry: string) => entry.trim())
      .filter(Boolean);

    return JSON.stringify(
      {
        rule_type: "DESCRIPTION_WEIGHT_CONVERSION",
        rule_name: advancedRule.rule_name,
        match_field: advancedRule.match_field,
        match_operator: advancedRule.match_operator,
        description_suffixes: suffixes,
        description_regex: advancedRule.description_regex,
        customer_code: advancedRule.customer_code,
        supplier_code: advancedRule.supplier_code,
        ship_to_code: advancedRule.ship_to_code,
        material_code: advancedRule.material_code,
        product_code: advancedRule.product_code,
        input_uom: advancedRule.input_uom,
        output_uom: advancedRule.output_uom,
        lb_output_uom: advancedRule.lb_output_uom,
        kg_output_uom: advancedRule.kg_output_uom,
        lb_multiplier: advancedRule.lb_multiplier,
        conversion_factor: advancedRule.conversion_factor,
        conversion_divider: advancedRule.conversion_divider,
        rounding_digits: advancedRule.rounding_digits,
        rounding_mode: advancedRule.rounding_mode,
        priority: advancedRule.priority,
        active: advancedRule.active,
        notes: advancedRule.notes,
      },
      null,
      2
    );
  }

  async function saveAdvancedRule() {
    try {
      setBusy(true);
      const notesJson = buildAdvancedRuleNotes();
      const payload = {
        client_id: partner.client_id,
        partner_id: partner.partner_id,
        sold_to: nullable(advancedRule.customer_code),
        ship_to: nullable(advancedRule.ship_to_code),
        material_code: nullable(advancedRule.material_code),
        product_code: nullable(advancedRule.product_code),
        input_uom: advancedRule.input_uom || "ANY",
        output_uom: advancedRule.output_uom || "KGM",
        conversion_factor: nullable(advancedRule.conversion_factor),
        conversion_divider: nullable(advancedRule.conversion_divider),
        rounding_digits: Number(advancedRule.rounding_digits || 0),
        rounding_mode: advancedRule.rounding_mode || "HALF_UP",
        priority: Number(advancedRule.priority || 100),
        is_active: Boolean(advancedRule.active),
        notes: notesJson,
      };

      const res = await apiFetch(`${API_BASE}/${partner.partner_id}/uom-rules`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }

      const savedRow = await res.json();
      if (savedRow && savedRow.uom_rule_id) {
        setRows((prev) => [
          savedRow,
          ...prev.filter((row) => row.uom_rule_id !== savedRow.uom_rule_id),
        ]);
      } else {
        await loadRows();
      }
      onBanner("Advanced UOM rule saved.");
    } catch (err: any) {
      onBanner(err?.message || "Unable to save advanced UOM rule.");
    } finally {
      setBusy(false);
    }
  }

  function loadKgPackageTemplate() {
    setAdvancedRule({
      rule_name: "KG Package Conversion",
      customer_code: "",
      supplier_code: "",
      ship_to_code: "",
      material_code: "",
      product_code: "",
      match_field: "description",
      match_operator: "ends_with",
      match_value: "KG-PAIL, KG PAIL, KG-DR, KG DR, KG-KIT, KG KIT",
      description_regex: "(\\d+(?:\\.\\d+)?)\\s*(KG[- ](?:PAIL|DR|KIT))$",
      input_uom: "ANY",
      output_uom: "KGM",
      lb_output_uom: "PL",
      kg_output_uom: "KGM",
      lb_multiplier: "2.204",
      conversion_factor: "1",
      conversion_divider: "1",
      rounding_digits: "0",
      rounding_mode: "HALF_UP",
      priority: "10",
      notes: "Built from the description suffix template.",
      active: true,
    });
  }

  function buildAdvancedRuleNotes() {
    const suffixes = advancedRule.match_value
      .split(",")
      .map((entry: string) => entry.trim())
      .filter(Boolean);

    return JSON.stringify(
      {
        rule_type: "DESCRIPTION_WEIGHT_CONVERSION",
        rule_name: advancedRule.rule_name,
        match_field: advancedRule.match_field,
        match_operator: advancedRule.match_operator,
        description_suffixes: suffixes,
        description_regex: advancedRule.description_regex,
        customer_code: advancedRule.customer_code,
        supplier_code: advancedRule.supplier_code,
        ship_to_code: advancedRule.ship_to_code,
        material_code: advancedRule.material_code,
        product_code: advancedRule.product_code,
        input_uom: advancedRule.input_uom,
        output_uom: advancedRule.output_uom,
        lb_output_uom: advancedRule.lb_output_uom,
        kg_output_uom: advancedRule.kg_output_uom,
        lb_multiplier: advancedRule.lb_multiplier,
        conversion_factor: advancedRule.conversion_factor,
        conversion_divider: advancedRule.conversion_divider,
        rounding_digits: advancedRule.rounding_digits,
        rounding_mode: advancedRule.rounding_mode,
        priority: advancedRule.priority,
        active: advancedRule.active,
        notes: advancedRule.notes,
      },
      null,
      2
    );
  }

  function loadRulePreset(preset: string) {
    const key = String(preset || "").trim().toLowerCase();
    if (key === "kg package conversion") {
      setSelectedPreset("KG Package Conversion");
      setAdvancedRule({
        rule_name: "KG Package Conversion",
        customer_code: "",
        supplier_code: "",
        ship_to_code: "",
        material_code: "",
        product_code: "",
        match_field: "description",
        match_operator: "ends_with",
        match_value: "KG-PAIL, KG PAIL, KG-DR, KG DR, KG-KIT, KG KIT",
        description_regex: "(\d+(?:\.\d+)?)\s*(KG[- ](?:PAIL|DR|KIT))$",
        input_uom: "ANY",
        output_uom: "KGM",
        lb_output_uom: "PL",
        kg_output_uom: "KGM",
        lb_multiplier: "2.204",
        conversion_factor: "1",
        conversion_divider: "1",
        rounding_digits: "0",
        rounding_mode: "HALF_UP",
        priority: "10",
        notes: "Built from the KG package conversion template.",
        active: true,
      });
      setPreviewSample({
        description: "MG-2401 SILICONE ADHESIVE, KG, 16KG-PAIL",
        quantity: "35.274",
        unit: "LB",
      });
      setPreviewResult(null);
      return;
    }

    if (key === "regex extract") {
      setSelectedPreset("Regex Extract");
      setAdvancedRule({
        rule_name: "Regex Extract Conversion",
        customer_code: "",
        supplier_code: "",
        ship_to_code: "",
        material_code: "",
        product_code: "",
        match_field: "description",
        match_operator: "regex_match",
        match_value: "KG-PAIL, KG PAIL, KG-DR, KG DR, KG-KIT, KG KIT",
        description_regex: "(\d+(?:\.\d+)?)\s*(KG[- ](?:PAIL|DR|KIT))$",
        input_uom: "ANY",
        output_uom: "KGM",
        lb_output_uom: "PL",
        kg_output_uom: "KGM",
        lb_multiplier: "2.204",
        conversion_factor: "1",
        conversion_divider: "1",
        rounding_digits: "0",
        rounding_mode: "HALF_UP",
        priority: "20",
        notes: "Regex capture-based conversion template.",
        active: true,
      });
      setPreviewSample({
        description: "Q7-4850 BIOMED GRADE LSR,KG,36.2KG-KIT",
        quantity: "7,200.000",
        unit: "LB",
      });
      setPreviewResult(null);
      return;
    }

    if (key === "suffix only") {
      setSelectedPreset("Suffix Only");
      setAdvancedRule({
        rule_name: "Suffix Only Conversion",
        customer_code: "",
        supplier_code: "",
        ship_to_code: "",
        material_code: "",
        product_code: "",
        match_field: "description",
        match_operator: "ends_with",
        match_value: "KG-PAIL, KG PAIL, KG-DR, KG DR, KG-KIT, KG KIT",
        description_regex: "",
        input_uom: "ANY",
        output_uom: "KGM",
        lb_output_uom: "PL",
        kg_output_uom: "KGM",
        lb_multiplier: "2.204",
        conversion_factor: "",
        conversion_divider: "",
        rounding_digits: "0",
        rounding_mode: "HALF_UP",
        priority: "30",
        notes: "Suffix-only starter template.",
        active: true,
      });
      setPreviewSample({
        description: "360 MED FL 1000 CS,KG,18KG-PAIL",
        quantity: "1,905.107",
        unit: "KG",
      });
      setPreviewResult(null);
      return;
    }

    if (key === "numeric divisor") {
      setSelectedPreset("Numeric Divisor");
      setAdvancedRule({
        rule_name: "Numeric Divisor Rule",
        customer_code: "",
        supplier_code: "",
        ship_to_code: "",
        material_code: "",
        product_code: "",
        match_field: "quantity",
        match_operator: "contains",
        match_value: "",
        description_regex: "",
        input_uom: "KG",
        output_uom: "KGM",
        lb_output_uom: "PL",
        kg_output_uom: "KGM",
        lb_multiplier: "2.204",
        conversion_factor: "1",
        conversion_divider: "1",
        rounding_digits: "0",
        rounding_mode: "HALF_UP",
        priority: "40",
        notes: "Numeric divisor starter template.",
        active: true,
      });
      setPreviewSample({
        description: "Example divisor scenario",
        quantity: "80.5",
        unit: "KG",
      });
      setPreviewResult(null);
      return;
    }

    setSelectedPreset("Role Filtered");
    setAdvancedRule({
      rule_name: "Role Filtered Rule",
      customer_code: "",
      supplier_code: "",
      ship_to_code: "",
      material_code: "",
      product_code: "",
      match_field: "description",
      match_operator: "contains",
      match_value: "",
      description_regex: "",
      input_uom: "ANY",
      output_uom: "EA",
      lb_output_uom: "PL",
      kg_output_uom: "KGM",
      lb_multiplier: "2.204",
      conversion_factor: "",
      conversion_divider: "",
      rounding_digits: "0",
      rounding_mode: "HALF_UP",
      priority: "50",
      notes: "Role-filtered starter template.",
      active: true,
    });
    setPreviewSample({
      description: "Role-filtered example",
      quantity: "1",
      unit: "EA",
    });
    setPreviewResult(null);
  }

  function roundPreviewValue(value: number, digits: number, mode: string) {
    const safeDigits = Number.isFinite(digits) ? Math.max(0, digits) : 0;
    const factor = Math.pow(10, safeDigits);
    const scaled = value * factor;
    let roundedScaled = Math.round(scaled);
    if (mode === "UP") {
      roundedScaled = Math.ceil(scaled);
    } else if (mode === "DOWN") {
      roundedScaled = Math.floor(scaled);
    }
    return roundedScaled / factor;
  }

  function runAdvancedPreview() {
    const description = String(previewSample.description || "").trim().toUpperCase();
    const unit = String(previewSample.unit || "").trim().toUpperCase();
    const quantity = Number(previewSample.quantity);
    const suffixes = advancedRule.match_value
      .split(",")
      .map((entry: string) => entry.trim().toUpperCase())
      .filter(Boolean);

    const matchedSuffix = suffixes.find((suffix: string) => description.endsWith(suffix)) || "";
    const regex = new RegExp(advancedRule.description_regex || "(\\d+(?:\\.\\d+)?)\\s*(KG[- ](?:PAIL|DR|KIT))$", "i");
    let extractedKg = NaN;

    if (matchedSuffix) {
      const match = description.match(regex);
      if (match) {
        extractedKg = Number(match[1] || match[0]);
      } else {
        const tail = description.split(",").pop() || "";
        const fallback = tail.match(/(\d+(?:\.\d+)?)\s*$/);
        extractedKg = fallback ? Number(fallback[1]) : NaN;
      }
    }

    const lbMultiplier = Number(advancedRule.lb_multiplier || 2.204) || 2.204;
    const kgMultiplier = 1;
    const roundingDigits = Number(advancedRule.rounding_digits || 0) || 0;
    const roundingMode = advancedRule.rounding_mode || "HALF_UP";

    if (!matchedSuffix || !Number.isFinite(quantity) || !Number.isFinite(extractedKg) || extractedKg === 0) {
      setPreviewResult({
        matched_suffix: matchedSuffix || null,
        extracted_kg: Number.isFinite(extractedKg) ? extractedKg : null,
        quantity_input: Number.isFinite(quantity) ? quantity : null,
        unit_input: unit || null,
        message: "Preview could not match the description suffix or extract the KG value.",
      });
      return;
    }

    let converted = quantity;
    let outputUom = advancedRule.output_uom || "KGM";
    let conversionMode = "default";

    if (unit === "LB") {
      converted = (quantity / extractedKg) * lbMultiplier;
      outputUom =
        advancedRule.lb_output_uom ||
        ({
          "KG-PAIL": "PL",
          "KG PAIL": "PL",
          "KG-DR": "DR",
          "KG DR": "DR",
          "KG-KIT": "KT",
          "KG KIT": "KT",
        } as Record<string, string>)[matchedSuffix] ||
        "PL";
      conversionMode = "LB x 2.204";
    } else if (unit === "KG") {
      converted = (quantity / extractedKg) * kgMultiplier;
      outputUom = advancedRule.kg_output_uom || "KGM";
      conversionMode = "KG divide only";
    } else {
      outputUom = unit || advancedRule.output_uom || "EA";
    }

    const rounded = roundPreviewValue(converted, roundingDigits, roundingMode);

    setPreviewResult({
      matched_suffix: matchedSuffix,
      extracted_kg: extractedKg,
      quantity_input: quantity,
      unit_input: unit,
      conversion_mode: conversionMode,
      conversion_result: converted,
      rounded_quantity: rounded,
      output_uom: outputUom,
      notes: `Rounding mode: ${roundingMode}; digits: ${roundingDigits}`,
    });
  }

  async function saveAdvancedRule() {
    try {
      setBusy(true);
      const notesJson = buildAdvancedRuleNotes();
      const payload = {
        client_id: partner.client_id,
        partner_id: partner.partner_id,
        sold_to: nullable(advancedRule.customer_code),
        ship_to: nullable(advancedRule.ship_to_code),
        material_code: nullable(advancedRule.material_code),
        product_code: nullable(advancedRule.product_code),
        input_uom: advancedRule.input_uom || "ANY",
        output_uom: advancedRule.output_uom || "KGM",
        conversion_factor: nullable(advancedRule.conversion_factor),
        conversion_divider: nullable(advancedRule.conversion_divider),
        rounding_digits: Number(advancedRule.rounding_digits || 0),
        rounding_mode: advancedRule.rounding_mode || "HALF_UP",
        priority: Number(advancedRule.priority || 100),
        is_active: Boolean(advancedRule.active),
        notes: notesJson,
      };

      const res = await apiFetch(`${API_BASE}/${partner.partner_id}/uom-rules`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }

      onBanner("Advanced UOM rule saved.");
      await loadRows();
    } catch (err: any) {
      onBanner(err?.message || "Unable to save advanced UOM rule.");
    } finally {
      setBusy(false);
    }
  }

  async function syncFromErp() {
    try {
      setBusy(true);
      const res = await apiFetch(`/client-config/sync/${partner.client_id}/UOM`, {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }
      const data = await res.json();
      onBanner(`UOM sync completed. Records synced: ${data.records_synced ?? 0}`);
      await loadRows();
    } catch (err: any) {
      onBanner(err?.message || "Unable to sync UOM from ERP.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={card}>
      <div style={title}>UOM Rules</div>

      <div style={toolbar}>
        <button
          type="button"
          style={secondaryButton}
          onClick={downloadTemplate}
          disabled={busy}
        >
          Download Template
        </button>

        <label style={fileLabel}>
          <input
            type="file"
            accept=".xlsx"
            style={{ display: "none" }}
            onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
          />
          Choose File
        </label>        <button
          type="button"
          style={secondaryButton}
          disabled={busy}
          onClick={() => void syncFromErp()}
        >
          Sync from ERP
        </button>



        <button
          type="button"
          style={secondaryButton}
          disabled={busy}
          onClick={() => {
            if (!selectedFile) {
              onBanner("Please select a file first.");
              return;
            }
            void uploadWorkbook(selectedFile);
          }}
        >
          Upload UOM
        </button>

        <button
          type="button"
          style={primaryButton}
          onClick={() => {
            setForm(defaultUomRule(partner.partner_id));
            setModalOpen(true);
          }}
        >
          Add UOM Rule
        </button>
      </div>

      <div style={fileInfo}>
        {selectedFile ? `Selected: ${selectedFile.name}` : "No file selected"}
      </div>

      <div style={card}>
        <div style={title}>Advanced Rule Builder</div>
        <div style={builderHint}>
          Configure description suffix rules, extraction logic, unit conversion, rounding, and output mapping from the GUI.
        </div>

        <div style={advancedActions}>
          <button type="button" style={secondaryButton} disabled={busy} onClick={() => loadRulePreset("KG Package Conversion")}>
            KG Package
          </button>
          <button type="button" style={secondaryButton} disabled={busy} onClick={() => loadRulePreset("Regex Extract")}>
            Regex Extract
          </button>
          <button type="button" style={secondaryButton} disabled={busy} onClick={() => loadRulePreset("Suffix Only")}>
            Suffix Only
          </button>
          <button type="button" style={secondaryButton} disabled={busy} onClick={() => loadRulePreset("Numeric Divisor")}>
            Numeric Divisor
          </button>
          <button type="button" style={secondaryButton} disabled={busy} onClick={() => loadRulePreset("Role Filtered")}>
            Role Filtered
          </button>
        </div>

        <div style={advancedGrid}>
          <label style={advancedField}>
            <span style={advancedLabel}>Rule Name</span>
            <input
              style={advancedInput}
              value={advancedRule.rule_name}
              onChange={(e) => setAdvancedRule({ ...advancedRule, rule_name: e.target.value })}
              placeholder="KG package conversion"
            />
          </label>

          <label style={advancedField}>
            <span style={advancedLabel}>Match Field</span>
            <select
              style={advancedInput}
              value={advancedRule.match_field}
              onChange={(e) => setAdvancedRule({ ...advancedRule, match_field: e.target.value })}
            >
              <option value="description">Description</option>
              <option value="material_description">Material Description</option>
              <option value="line_description">Line Description</option>
              <option value="item_description">Item Description</option>
              <option value="product_description">Product Description</option>
              <option value="material_code">Material Code</option>
              <option value="product_code">Product Code</option>
              <option value="uom">UOM</option>
              <option value="quantity">Quantity</option>
              <option value="custom">Custom Field</option>
            </select>
            <div style={fieldHelp}>
              Choose the source field the rule should inspect before matching.
            </div>
          </label>

          <label style={advancedField}>
            <span style={advancedLabel}>Match Operator</span>
            <select
              style={advancedInput}
              value={advancedRule.match_operator}
              onChange={(e) => setAdvancedRule({ ...advancedRule, match_operator: e.target.value })}
            >
              <option value="equals">Equals</option>
              <option value="contains">Contains</option>
              <option value="starts_with">Starts With</option>
              <option value="ends_with">Ends With</option>
              <option value="regex_match">Regex Match</option>
              <option value="in_list">In List</option>
              <option value="is_blank">Is Blank</option>
              <option value="is_not_blank">Is Not Blank</option>
            </select>
            <div style={fieldHelp}>
              Use `Ends With` for suffix scenarios and `Regex Match` for capture-group based scenarios.
            </div>
          </label>

          <label style={advancedField}>
            <span style={advancedLabel}>Suffix Values</span>
            <input
              style={advancedInput}
              value={advancedRule.match_value}
              onChange={(e) => setAdvancedRule({ ...advancedRule, match_value: e.target.value })}
              placeholder="KG-PAIL, KG PAIL, KG-DR, KG DR, KG-KIT, KG KIT"
            />
            <div style={fieldHelp}>
              Enter comma-separated suffix tokens. These are matched exactly so you can cover multiple packaging styles in one rule.
            </div>
          </label>

          <label style={advancedField}>
            <span style={advancedLabel}>Description Regex</span>
            <input
              style={advancedInput}
              value={advancedRule.description_regex}
              onChange={(e) => setAdvancedRule({ ...advancedRule, description_regex: e.target.value })}
              placeholder="(\d+(?:\.\d+)?)\s*(KG[- ](?:PAIL|DR|KIT))$"
            />
            <div style={fieldHelp}>
              Optional. Put the KG value in capture group 1. Leave this blank when suffix matching is enough.
            </div>
          </label>

          <label style={advancedField}>
            <span style={advancedLabel}>Input UOM</span>
            <input
              style={advancedInput}
              value={advancedRule.input_uom}
              onChange={(e) => setAdvancedRule({ ...advancedRule, input_uom: e.target.value })}
              placeholder="ANY"
            />
          </label>

          <label style={advancedField}>
            <span style={advancedLabel}>Output UOM</span>
            <input
              style={advancedInput}
              value={advancedRule.output_uom}
              onChange={(e) => setAdvancedRule({ ...advancedRule, output_uom: e.target.value })}
              placeholder="KGM"
            />
          </label>

          <label style={advancedField}>
            <span style={advancedLabel}>LB Output UOM</span>
            <input
              style={advancedInput}
              value={advancedRule.lb_output_uom}
              onChange={(e) => setAdvancedRule({ ...advancedRule, lb_output_uom: e.target.value })}
              placeholder="PL"
            />
          </label>

          <label style={advancedField}>
            <span style={advancedLabel}>KG Output UOM</span>
            <input
              style={advancedInput}
              value={advancedRule.kg_output_uom}
              onChange={(e) => setAdvancedRule({ ...advancedRule, kg_output_uom: e.target.value })}
              placeholder="KGM"
            />
          </label>

          <label style={advancedField}>
            <span style={advancedLabel}>LB Multiplier</span>
            <input
              style={advancedInput}
              value={advancedRule.lb_multiplier}
              onChange={(e) => setAdvancedRule({ ...advancedRule, lb_multiplier: e.target.value })}
              placeholder="2.204"
            />
          </label>

          <label style={advancedField}>
            <span style={advancedLabel}>Conversion Factor</span>
            <input
              style={advancedInput}
              value={advancedRule.conversion_factor}
              onChange={(e) => setAdvancedRule({ ...advancedRule, conversion_factor: e.target.value })}
              placeholder="1"
            />
          </label>

          <label style={advancedField}>
            <span style={advancedLabel}>Conversion Divider</span>
            <input
              style={advancedInput}
              value={advancedRule.conversion_divider}
              onChange={(e) => setAdvancedRule({ ...advancedRule, conversion_divider: e.target.value })}
              placeholder="1"
            />
          </label>

          <label style={advancedField}>
            <span style={advancedLabel}>Rounding Digits</span>
            <input
              style={advancedInput}
              value={advancedRule.rounding_digits}
              onChange={(e) => setAdvancedRule({ ...advancedRule, rounding_digits: e.target.value })}
              placeholder="0"
            />
          </label>

          <label style={advancedField}>
            <span style={advancedLabel}>Rounding Mode</span>
            <select
              style={advancedInput}
              value={advancedRule.rounding_mode}
              onChange={(e) => setAdvancedRule({ ...advancedRule, rounding_mode: e.target.value })}
            >
              <option value="HALF_UP">HALF_UP</option>
              <option value="UP">UP</option>
              <option value="DOWN">DOWN</option>
            </select>
          </label>

          <label style={advancedField}>
            <span style={advancedLabel}>Priority</span>
            <input
              style={advancedInput}
              value={advancedRule.priority}
              onChange={(e) => setAdvancedRule({ ...advancedRule, priority: e.target.value })}
              placeholder="10"
            />
          </label>

          <label style={advancedField}>
            <span style={advancedLabel}>Material Code</span>
            <input
              style={advancedInput}
              value={advancedRule.material_code}
              onChange={(e) => setAdvancedRule({ ...advancedRule, material_code: e.target.value })}
              placeholder="Optional"
            />
          </label>

          <label style={advancedField}>
            <span style={advancedLabel}>Customer Code</span>
            <input
              style={advancedInput}
              value={advancedRule.customer_code}
              onChange={(e) => setAdvancedRule({ ...advancedRule, customer_code: e.target.value })}
              placeholder="Optional"
            />
          </label>

          <label style={advancedField}>
            <span style={advancedLabel}>Supplier Code</span>
            <input
              style={advancedInput}
              value={advancedRule.supplier_code}
              onChange={(e) => setAdvancedRule({ ...advancedRule, supplier_code: e.target.value })}
              placeholder="Optional"
            />
          </label>

          <label style={advancedField}>
            <span style={advancedLabel}>Ship-To Code</span>
            <input
              style={advancedInput}
              value={advancedRule.ship_to_code}
              onChange={(e) => setAdvancedRule({ ...advancedRule, ship_to_code: e.target.value })}
              placeholder="Optional"
            />
          </label>
        </div>

        <label style={{ ...advancedField, marginTop: 12 }}>
          <span style={advancedLabel}>Notes</span>
          <textarea
            style={advancedTextarea}
            value={advancedRule.notes}
            onChange={(e) => setAdvancedRule({ ...advancedRule, notes: e.target.value })}
            placeholder="Business notes for this rule"
          />
        </label>

        <div style={advancedActions}>
          <button type="button" style={secondaryButton} disabled={busy} onClick={loadKgPackageTemplate}>
            Load KG Package Template
          </button>
          <button type="button" style={primaryButton} disabled={busy} onClick={() => void saveAdvancedRule()}>
            Save Advanced Rule
          </button>
        </div>
      </div>

      <div style={card}>
        <div style={title}>Preview & Test</div>
        <div style={builderHint}>
          Paste a sample line item and preview the converted quantity and UOM before saving the rule.
        </div>

        <div style={advancedGrid}>
          <label style={advancedField}>
            <span style={advancedLabel}>Sample Description</span>
            <textarea
              style={advancedTextarea}
              value={previewSample.description}
              onChange={(e) => setPreviewSample({ ...previewSample, description: e.target.value })}
              placeholder="MG-2401 SILICONE ADHESIVE, KG, 16KG-PAIL"
            />
          </label>

          <label style={advancedField}>
            <span style={advancedLabel}>Sample Quantity</span>
            <input
              style={advancedInput}
              value={previewSample.quantity}
              onChange={(e) => setPreviewSample({ ...previewSample, quantity: e.target.value })}
              placeholder="35.274"
            />
          </label>

          <label style={advancedField}>
            <span style={advancedLabel}>Sample Unit</span>
            <input
              style={advancedInput}
              value={previewSample.unit}
              onChange={(e) => setPreviewSample({ ...previewSample, unit: e.target.value })}
              placeholder="LB"
            />
          </label>
        </div>

        <div style={advancedActions}>
          <button
            type="button"
            style={secondaryButton}
            disabled={busy}
            onClick={() =>
              setPreviewSample({
                description: "MG-2401 SILICONE ADHESIVE, KG, 16KG-PAIL",
                quantity: "35.274",
                unit: "LB",
              })
            }
          >
            Load Example
          </button>
          <button type="button" style={primaryButton} disabled={busy} onClick={runAdvancedPreview}>
            Run Preview
          </button>
        </div>

        {previewResult && (
          <div style={previewResultBox}>
            <div><b>Matched Suffix:</b> {previewResult.matched_suffix || "No match"}</div>
            <div><b>Extracted KG Value:</b> {previewResult.extracted_kg ?? "—"}</div>
            <div><b>Input Quantity:</b> {previewResult.quantity_input ?? "—"} {previewResult.unit_input || ""}</div>
            <div><b>Conversion:</b> {previewResult.conversion_mode || previewResult.message || "—"}</div>
            <div><b>Converted Quantity:</b> {previewResult.conversion_result ?? "—"}</div>
            <div><b>Rounded Quantity:</b> {previewResult.rounded_quantity ?? "—"}</div>
            <div><b>Output UOM:</b> {previewResult.output_uom ?? "—"}</div>
            <div style={{ color: "#64748b", marginTop: 4 }}>{previewResult.notes || ""}</div>
            {previewResult.message && <div style={{ color: "#b45309", marginTop: 6 }}>{previewResult.message}</div>}
          </div>
        )}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Rule Summary</th>
              <th style={thStyle}>Customer</th>
              <th style={thStyle}>Supplier</th>
              <th style={thStyle}>Ship-To</th>
              <th style={thStyle}>Material</th>
              <th style={thStyle}>Product</th>
              <th style={thStyle}>Input</th>
              <th style={thStyle}>Output</th>
              <th style={thStyle}>Factor</th>
              <th style={thStyle}>Divider</th>
              <th style={thStyle}>Priority</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={13} style={tdEmptyStyle}>
                  Loading...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={13} style={tdEmptyStyle}>
                  No UOM rules configured.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const summary = getUomRuleSummary(row);
                return (
                <tr key={row.uom_rule_id}>
                  <td style={tdStyle}>{summary}</td>
                  <td style={tdStyle}>{row.customer_code || "-"}</td>
                  <td style={tdStyle}>{row.supplier_code || "-"}</td>
                  <td style={tdStyle}>{row.ship_to_code || "-"}</td>
                  <td style={tdStyle}>{row.material_code || "-"}</td>
                  <td style={tdStyle}>{row.product_code || "-"}</td>
                  <td style={tdStyle}>{row.input_uom}</td>
                  <td style={tdStyle}>{row.output_uom}</td>
                  <td style={tdStyle}>{row.conversion_factor || "-"}</td>
                  <td style={tdStyle}>{row.conversion_divider || "-"}</td>
                  <td style={tdStyle}>{row.priority}</td>
                  <td style={tdStyle}>{row.is_active ? "ACTIVE" : "INACTIVE"}</td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        style={miniButton}
                        onClick={() => {
                          setForm({ ...row, partner_id: partner.partner_id });
                          setModalOpen(true);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        style={dangerMiniButton}
                        onClick={() => void deleteRow(row)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <UomRuleModal
        open={modalOpen}
        value={form}
        onChange={setForm}
        onSave={saveRow}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}

function nullable(value: any) {
  const v = String(value || "").trim();
  return v === "" ? null : v;
}

function getUomRuleSummary(row: any) {
  const notes = parseRuleNotes(row?.notes);
  const ruleName = String(notes?.rule_name || row?.rule_name || "").trim();
  const matchField = String(notes?.match_field || "").trim();
  const matchOperator = String(notes?.match_operator || "").trim();
  const suffixes = Array.isArray(notes?.description_suffixes) ? notes.description_suffixes.filter(Boolean) : [];
  const suffixText = suffixes.length ? `Suffix: ${suffixes.join(", ")}` : "";
  const regexText = String(notes?.description_regex || "").trim();
  const parts = [ruleName, matchField && matchOperator ? `${matchField} ${matchOperator}` : "", suffixText, regexText ? `Regex: ${regexText}` : ""];
  return parts.filter(Boolean).join(" | ") || "Advanced rule";
}

function parseRuleNotes(notes: any) {
  if (!notes) return {};
  if (typeof notes === "object") return notes;
  if (typeof notes !== "string") return {};
  try {
    const parsed = JSON.parse(notes);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

const card: React.CSSProperties = {
  border: "1px solid #eef2f7",
  borderRadius: 12,
  background: "#fff",
  padding: 16,
  minWidth: 0,
};

const title: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 800,
  color: "#0f172a",
  marginBottom: 14,
};

const toolbar: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginBottom: 12,
  alignItems: "center",
};

const fileInfo: React.CSSProperties = {
  fontSize: 13,
  color: "#475569",
  marginBottom: 14,
};

const builderHint: React.CSSProperties = {
  fontSize: 13,
  color: "#475569",
  marginBottom: 12,
};

const advancedGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const advancedField: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const advancedLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#334155",
};

const fieldHelp: React.CSSProperties = {
  fontSize: 11,
  lineHeight: 1.45,
  color: "#64748b",
};

const advancedInput: React.CSSProperties = {
  border: "1px solid #dbe4ee",
  borderRadius: 8,
  padding: "9px 12px",
  fontSize: 13,
  color: "#0f172a",
  background: "#fff",
};

const advancedTextarea: React.CSSProperties = {
  border: "1px solid #dbe4ee",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 13,
  color: "#0f172a",
  minHeight: 88,
  width: "100%",
  background: "#fff",
};

const previewResultBox: React.CSSProperties = {
  marginTop: 12,
  border: "1px solid #dbe4ee",
  borderRadius: 10,
  background: "#f8fafc",
  padding: 12,
  fontSize: 13,
  color: "#0f172a",
  display: "grid",
  gap: 6,
};

const advancedActions: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
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

const secondaryButton: React.CSSProperties = {
  border: "1px solid #dbe4ee",
  background: "#fff",
  color: "#0f172a",
  borderRadius: 8,
  padding: "9px 14px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const fileLabel: React.CSSProperties = {
  border: "1px solid #dbe4ee",
  background: "#f8fafc",
  color: "#0f172a",
  borderRadius: 8,
  padding: "9px 14px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const miniButton: React.CSSProperties = {
  border: "1px solid #dbe4ee",
  background: "#fff",
  color: "#0f172a",
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const dangerMiniButton: React.CSSProperties = {
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#b91c1c",
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
  verticalAlign: "top",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 13,
  color: "#0f172a",
  borderBottom: "1px solid #eef2f7",
  verticalAlign: "top",
};

const tdEmptyStyle: React.CSSProperties = {
  padding: "16px 12px",
  fontSize: 13,
  color: "#64748b",
  borderBottom: "1px solid #eef2f7",
};