import React, { useEffect, useMemo, useState } from "react";
import { apiFetch, parseApiError } from "utils/api";
import { getAuth } from "utils/auth";
import { TradingPartner } from "types/tradingPartner";
import { useAppScope } from "context/AppScopeContext";

const API_BASE = "/trading-partners-agentic";

type ProjectRow = {
  project_id: string;
  client_id: string;
  partner_id: string;
  message_family: string;
  message_standard: string;
  message_version?: string | null;
  direction: string;
  profile_name: string;
  status: string;
  current_stage: string;
  objective?: string | null;
  approval_status: string;
  conversation_summary?: string | null;
  recommended_actions: string[];
  requirements_json: Record<string, any>;
  test_plan_json: Record<string, any>;
  test_results_json: Record<string, any>;
  progress_steps: Array<{ stage: string; status: string }>;
  discovery_json: Record<string, any>;
  extraction_profile_json: Record<string, any>;
  address_match_profile_json: Record<string, any>;
  mapping_profile_json: Record<string, any>;
  rule_profile_json: Record<string, any>;
  created_at?: string;
  updated_at?: string;
};

const STAGES = [
  "DISCOVER",
  "COLLECT_REQUIREMENTS",
  "ANALYZE_SAMPLE_MESSAGES",
  "DRAFT_CONFIGURATION",
  "VALIDATE_CONFIGURATION",
  "TEST_CONNECTIVITY",
  "TEST_MESSAGE_PROCESSING",
  "REVIEW_AND_APPROVE",
  "ACTIVATE",
];

const BUSINESS_WIZARD_STEPS = [
  "Partner Basics",
  "Field Rules",
  "Message Control",
  "Target Output",
  "Samples",
  "Review",
] as const;

export default function AIOnboardingSection({
  partner,
  onBanner,
}: {
  partner: TradingPartner;
  onBanner: (text: string) => void;
}) {
  const { scope } = useAppScope();
  const auth = getAuth();
  const isPremiumSubscription = String(auth?.subscription_type || "").toUpperCase() === "PREMIUM" || String(auth?.subscription_type || "").toUpperCase() === "ENTERPRISE";
  const isStagingSampleUploadEnabled = String(scope.environment || "PROD").toUpperCase() === "STAGING";
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [uploadingSample, setUploadingSample] = useState(false);
  const [uploadingArtifactType, setUploadingArtifactType] = useState<string | null>(null);
  const [scenarioLabel, setScenarioLabel] = useState("");
  const [wizardStep, setWizardStep] = useState<(typeof BUSINESS_WIZARD_STEPS)[number]>("Partner Basics");
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [form, setForm] = useState({
    client_id: partner.client_id,
    partner_id: partner.partner_id,
    profile_name: `${partner.partner_name} Default`,
    message_family: "PURCHASE_ORDER",
    message_standard: "PAPER_PO",
    message_version: "",
    direction: "INBOUND",
    sample_reference: "",
    target_message_family: "ORDERS",
    invoice_profile_type: "",
    extraction_mode: "HYBRID_AI_OCR",
  });

  const selectedProject = useMemo(
    () => rows.find((row) => row.project_id === selectedProjectId) || null,
    [rows, selectedProjectId]
  );

  useEffect(() => {
    loadRows();
  }, [partner.partner_id]);

  useEffect(() => {
    setForm({
      client_id: partner.client_id,
      partner_id: partner.partner_id,
      profile_name: `${partner.partner_name} Default`,
      message_family: "PURCHASE_ORDER",
      message_standard: "PAPER_PO",
      message_version: "",
      direction: "INBOUND",
      sample_reference: "",
      target_message_family: "ORDERS",
      invoice_profile_type: "",
      extraction_mode: "HYBRID_AI_OCR",
    });
  }, [partner.client_id, partner.partner_id, partner.partner_name]);

  async function loadRows(nextProjectId?: string | null) {
    try {
      setLoading(true);
      const res = await apiFetch(`${API_BASE}/projects?partner_id=${partner.partner_id}`, { method: "GET" });
      if (!res.ok) throw new Error(await parseApiError(res));
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setRows(list);
      const pickId = nextProjectId ?? selectedProjectId ?? list[0]?.project_id ?? null;
      setSelectedProjectId(pickId);
      if (pickId) {
        await loadProject(pickId);
      }
    } catch (err: any) {
      onBanner(err?.message || "Failed to load agentic onboarding projects.");
    } finally {
      setLoading(false);
    }
  }

  async function loadProject(projectId: string) {
    try {
      setDetailLoading(true);
      const res = await apiFetch(`${API_BASE}/projects/${projectId}`, { method: "GET" });
      if (!res.ok) throw new Error(await parseApiError(res));
      const data = await res.json();
      setRows((prev) => prev.map((row) => (row.project_id === projectId ? data : row)));
      setSelectedProjectId(projectId);
    } catch (err: any) {
      onBanner(err?.message || "Failed to load project details.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function createProject(projectForm = form, bannerText = "Agentic onboarding project created.") {
    try {
      const res = await apiFetch(`${API_BASE}/projects`, {
        method: "POST",
        body: JSON.stringify(projectForm),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      const created = await res.json();
      onBanner(bannerText);
      await loadRows(created.project_id);
    } catch (err: any) {
      onBanner(err?.message || "Unable to create agentic onboarding project.");
    }
  }

  async function startPremiumQuickLaunch() {
    if (!isPremiumSubscription) {
      onBanner("Premium quick launch is available on PREMIUM and ENTERPRISE plans.");
      return;
    }

    await createProject(
      {
        ...form,
        profile_name: form.profile_name.trim() || `${partner.partner_name} Quick Start`,
        sample_reference: form.sample_reference || "PREMIUM_QUICK_START",
      },
      "Premium quick launch created without requiring partner samples."
    );
  }

  async function runDiscovery() {
    try {
      const res = await apiFetch(`${API_BASE}/discover`, { method: "POST", body: JSON.stringify(form) });
      if (!res.ok) throw new Error(await parseApiError(res));
      const data = await res.json();
      onBanner(`Discovery completed. Suggested standard: ${data.message_standard}, version: ${data.message_version || "-"}.`);
    } catch (err: any) {
      onBanner(err?.message || "Discovery failed.");
    }
  }

  async function saveProjectPatch(patch: Record<string, any>) {
    if (!selectedProjectId) return;
    try {
      const res = await apiFetch(`${API_BASE}/projects/${selectedProjectId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      const updated = await res.json();
      setRows((prev) => prev.map((row) => (row.project_id === selectedProjectId ? updated : row)));
      onBanner("Agentic onboarding project updated.");
    } catch (err: any) {
      onBanner(err?.message || "Unable to update project.");
    }
  }

  async function advanceStage(targetStage?: string, approvalStatus?: string) {
    if (!selectedProjectId) return;
    try {
      const res = await apiFetch(`${API_BASE}/projects/${selectedProjectId}/advance`, {
        method: "POST",
        body: JSON.stringify({
          target_stage: targetStage,
          approval_status: approvalStatus,
        }),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      const updated = await res.json();
      setRows((prev) => prev.map((row) => (row.project_id === selectedProjectId ? updated : row)));
      onBanner(`Project moved to ${updated.current_stage}.`);
    } catch (err: any) {
      onBanner(err?.message || "Unable to advance project.");
    }
  }

  async function uploadSampleFile(file: File) {
    if (!selectedProjectId) {
      onBanner("Create or select an onboarding project before uploading a sample.");
      return;
    }

    try {
      setUploadingSample(true);
      const formData = new FormData();
      formData.append("file", file);

      const res = await apiFetch(`${API_BASE}/projects/${selectedProjectId}/sample-upload`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      const updated = await res.json();
      setRows((prev) => prev.map((row) => (row.project_id === selectedProjectId ? updated : row)));
      onBanner(`Sample '${file.name}' uploaded to the onboarding project.`);
    } catch (err: any) {
      onBanner(err?.message || "Unable to upload onboarding sample.");
    } finally {
      setUploadingSample(false);
    }
  }

  async function uploadArtifactFile(file: File, artifactType: "mapping_spec" | "edi_guideline" | "paper_po_sample") {
    if (!selectedProjectId) {
      onBanner("Create or select an onboarding project before uploading onboarding artifacts.");
      return;
    }

    try {
      setUploadingArtifactType(artifactType);
      const formData = new FormData();
      formData.append("file", file);
      formData.append("artifact_type", artifactType);
      if (scenarioLabel.trim()) {
        formData.append("scenario_label", scenarioLabel.trim());
      }

      const res = await apiFetch(`${API_BASE}/projects/${selectedProjectId}/artifact-upload`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      const updated = await res.json();
      setRows((prev) => prev.map((row) => (row.project_id === selectedProjectId ? updated : row)));
      onBanner(
        artifactType === "paper_po_sample"
          ? `Scenario sample '${file.name}' uploaded and analyzed.`
          : `Artifact '${file.name}' uploaded for map generation.`
      );
    } catch (err: any) {
      onBanner(err?.message || "Unable to upload onboarding artifact.");
    } finally {
      setUploadingArtifactType(null);
    }
  }

  async function downloadTemplate(templateKind: "mapping-spec" | "edi-guideline") {
    try {
      const res = await apiFetch(`${API_BASE}/templates/${templateKind}`, { method: "GET" });
      if (!res.ok) throw new Error(await parseApiError(res));
      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/i);
      const filename =
        match?.[1] ||
        (templateKind === "mapping-spec"
          ? "ordanex_mapping_spec_template.md"
          : "ordanex_edi_guideline_template.md");
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      onBanner(`Downloaded ${templateKind === "mapping-spec" ? "mapping specification" : "EDI guideline"} template.`);
    } catch (err: any) {
      onBanner(err?.message || "Unable to download onboarding template.");
    }
  }

  const projectArtifacts = useMemo(
    () => (selectedProject?.requirements_json?.artifacts as Array<Record<string, any>> | undefined) || [],
    [selectedProject]
  );
  const scenarioCoverageSummary = useMemo(
    () => (selectedProject?.requirements_json?.scenario_coverage_summary as Record<string, any> | undefined) || null,
    [selectedProject]
  );
  const businessQuestionnaire = useMemo(
    () => (selectedProject?.requirements_json?.business_questionnaire as Record<string, any> | undefined) || {},
    [selectedProject]
  );
  const businessFieldRules = useMemo(
    () => (selectedProject?.requirements_json?.business_field_rules as Array<Record<string, any>> | undefined) || [],
    [selectedProject]
  );
  const businessTargetOutput = useMemo(
    () => (selectedProject?.requirements_json?.business_target_output as Record<string, any> | undefined) || {},
    [selectedProject]
  );
  const businessTestScenarios = useMemo(
    () => (selectedProject?.requirements_json?.business_test_scenarios as Array<Record<string, any>> | undefined) || [],
    [selectedProject]
  );
  const ediInterfaceSummary = useMemo(
    () => (selectedProject?.requirements_json?.edi_interface_summary as Record<string, any> | undefined) || {},
    [selectedProject]
  );
  const ediBusinessChecklist = useMemo(
    () => (selectedProject?.requirements_json?.edi_business_checklist as Array<Record<string, any>> | undefined) || [],
    [selectedProject]
  );
  const ediTargetOutput = useMemo(
    () => (selectedProject?.requirements_json?.edi_target_output as Record<string, any> | undefined) || {},
    [selectedProject]
  );
  const messageControl = useMemo(
    () => (selectedProject?.requirements_json?.message_control as Record<string, any> | undefined) || {},
    [selectedProject]
  );
  const hasBusinessWorkbookData = useMemo(
    () =>
      Boolean(
        Object.keys(businessQuestionnaire).length ||
        businessFieldRules.length ||
        Object.keys(messageControl).length ||
        Object.keys(businessTargetOutput).length ||
        businessTestScenarios.length ||
        Object.keys(ediInterfaceSummary).length ||
        ediBusinessChecklist.length ||
        Object.keys(ediTargetOutput).length
      ),
    [
      businessQuestionnaire,
      businessFieldRules,
      messageControl,
      businessTargetOutput,
      businessTestScenarios,
      ediInterfaceSummary,
      ediBusinessChecklist,
      ediTargetOutput,
    ]
  );

  function renderKeyValueSummary(summary: Record<string, any>) {
    const entries = Object.entries(summary || {}).filter(([, value]) => String(value ?? "").trim());
    if (!entries.length) {
      return <div style={emptyHint}>No business questionnaire data captured yet.</div>;
    }
    return (
      <div style={summaryList}>
        {entries.map(([label, value]) => (
          <div key={label} style={summaryListRow}>
            <div style={summaryLabel}>{label}</div>
            <div style={summaryValue}>{String(value)}</div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <div style={title}>Agentic AI Onboarding</div>
      <div style={subTitle}>
        Guided onboarding workflow for partner requirement capture, discovery, configuration drafting, testing, approval, and activation.
      </div>
      <div style={invoiceHint}>
        Orders, order changes, order responses, ASN, and AP / AR invoices are supported across PDF, IDOC, XML, API, X12, EDIFACT, and AI-assisted onboarding flows.
      </div>
      {selectedProject?.current_stage === "COLLECT_REQUIREMENTS" ? (
        <div style={collectRequirementsBanner}>
          Collect Requirements is the working stage for uploading mapping specifications, EDI guidelines, and representative invoice or order samples. Uploads are enabled when the active environment is set to Staging.
        </div>
      ) : null}

      <div style={grid}>
        {field("Profile Name", <input value={form.profile_name} onChange={(e) => setForm({ ...form, profile_name: e.target.value })} style={input} />)}
        {field("Direction", <select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })} style={input}><option>INBOUND</option><option>OUTBOUND</option><option>BOTH</option></select>)}
        {field("Message Family", <select value={form.message_family} onChange={(e) => setForm({ ...form, message_family: e.target.value })} style={input}><option>PURCHASE_ORDER</option><option>ORDERS</option><option>ORDER_RESPONSE</option><option>ORDRSP</option><option>ORDER_CHANGE</option><option>ORDCHG</option><option>ASN</option><option>DESADV</option><option>INVOICE</option><option>INVOIC</option><option>AP_INVOICE</option><option>AR_INVOICE</option></select>)}
        {field("Message Standard", <select value={form.message_standard} onChange={(e) => setForm({ ...form, message_standard: e.target.value })} style={input}><option>PAPER_PO</option><option>PDF</option><option>EDIFACT</option><option>X12</option><option>IDOC</option><option>XML</option><option>JSON</option><option>CSV</option><option>API</option><option>EMAIL_BODY</option></select>)}
        {field("Message Version", <input placeholder="e.g. D96A, D01B, 4010" value={form.message_version} onChange={(e) => setForm({ ...form, message_version: e.target.value })} style={input} />)}
        {field("Target Message Family", <select value={form.target_message_family} onChange={(e) => setForm({ ...form, target_message_family: e.target.value })} style={input}><option>ORDERS</option><option>ORDRSP</option><option>ORDCHG</option><option>DESADV</option><option>INVOIC</option><option>AP_INVOICE</option><option>AR_INVOICE</option></select>)}
        {field("Invoice Profile Type", <select value={form.invoice_profile_type || ""} onChange={(e) => setForm({ ...form, invoice_profile_type: e.target.value })} style={input}><option value="">Select invoice profile</option><option>AP_INVOICE</option><option>AR_INVOICE</option><option>INVOICE</option></select>)}
        {field("Extraction Mode", <select value={form.extraction_mode} onChange={(e) => setForm({ ...form, extraction_mode: e.target.value })} style={input}><option>HYBRID_AI_OCR</option><option>EDI_PARSER</option><option>XML_MAP</option><option>JSON_MAP</option><option>CSV_MAP</option></select>)}
        {field("Sample Reference", <input placeholder="sample file / email ref / message id" value={form.sample_reference} onChange={(e) => setForm({ ...form, sample_reference: e.target.value })} style={input} />)}
      </div>

      <div style={artifactIntroCard}>
        <div style={detailTitle}>User-Friendly Intake Flow</div>
        <div style={subTitle}>
          Upload a mapping specification or EDI guideline as source context, then upload one or more representative invoice or order samples for different scenarios.
          The onboarding project uses those inputs to analyze the message shape and generate a first-pass draft map.
        </div>
        {isPremiumSubscription ? (
          <div style={premiumQuickStartCard}>
            <div style={detailTitle}>Premium Quick Start</div>
            <div style={subTitle}>
              Skip partner sample collection and launch a baseline workspace for Orders, Order Responses, ASN, Invoice, AP Invoice, or AR Invoice flows.
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" style={primaryButton} onClick={() => void startPremiumQuickLaunch()}>
                Start Quick Launch
              </button>
              <button type="button" style={secondaryButton} onClick={() => setWizardStep("Target Output")}>
                Review Target Output
              </button>
            </div>
          </div>
        ) : null}
        <div style={artifactGrid}>
          <div style={artifactCard}>
            <div style={artifactCardTitle}>1. Business Onboarding Questionnaire</div>
            <div style={artifactCardText}>Download a guided workbook for non-technical users. It asks business questions about the partner, document fields, target ERP, validation rules, and test scenarios for PO, AP invoice, and AR invoice flows without requiring mapping jargon.</div>
            <div style={artifactActionRow}>
              <button type="button" style={secondaryButton} onClick={() => void downloadTemplate("mapping-spec")}>
                Download Workbook
              </button>
            </div>
            {isStagingSampleUploadEnabled ? (
              <label style={{ ...secondaryButton, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                {uploadingArtifactType === "mapping_spec" ? "Uploading..." : "Upload Filled Workbook / Spec"}
                <input
                  type="file"
                  accept=".pdf,.txt,.xml,.json,.csv,.xlsx,.xls"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      void uploadArtifactFile(file, "mapping_spec");
                    }
                    e.currentTarget.value = "";
                  }}
                  disabled={Boolean(uploadingArtifactType)}
                />
              </label>
            ) : null}
          </div>

          <div style={artifactCard}>
            <div style={artifactCardTitle}>2. EDI / Interface Checklist</div>
            <div style={artifactCardText}>Download a business-friendly interface checklist for X12, EDIFACT, XML, or API onboarding. It captures connection method, required business fields, transaction ID logic, and target expectations in plain language.</div>
            <div style={artifactActionRow}>
              <button type="button" style={secondaryButton} onClick={() => void downloadTemplate("edi-guideline")}>
                Download Workbook
              </button>
            </div>
            {isStagingSampleUploadEnabled ? (
              <label style={{ ...secondaryButton, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                {uploadingArtifactType === "edi_guideline" ? "Uploading..." : "Upload Filled Checklist / Guideline"}
                <input
                  type="file"
                  accept=".pdf,.txt,.xml,.json,.csv,.xlsx,.xls"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      void uploadArtifactFile(file, "edi_guideline");
                    }
                    e.currentTarget.value = "";
                  }}
                  disabled={Boolean(uploadingArtifactType)}
                />
              </label>
            ) : null}
          </div>

          <div style={artifactCard}>
            <div style={artifactCardTitle}>3. Invoice / Document Scenario Samples</div>
            <div style={artifactCardText}>Upload representative business samples for invoices, orders, acknowledgements, and edge scenarios. The latest uploaded sample is analyzed automatically and used to draft extraction and mapping setup.</div>
            <input
              placeholder="Scenario label (optional): e.g. Standard, Split delivery, Rush order, Invoice copy"
              value={scenarioLabel}
              onChange={(e) => setScenarioLabel(e.target.value)}
              style={{ ...input, marginBottom: 10 }}
            />
            {isStagingSampleUploadEnabled ? (
              <label style={{ ...primaryButton, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                {uploadingArtifactType === "paper_po_sample" ? "Uploading & Analyzing..." : "Upload Scenario Sample"}
                <input
                  type="file"
                  accept=".pdf,.xlsx,.xls,.csv,.xml,.json,.txt"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      void uploadArtifactFile(file, "paper_po_sample");
                    }
                    e.currentTarget.value = "";
                  }}
                  disabled={Boolean(uploadingArtifactType)}
                />
              </label>
            ) : null}
          </div>
        </div>

        {projectArtifacts.length ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ ...labelStyle, marginBottom: 8 }}>Uploaded Artifacts</div>
            <div style={artifactList}>
              {projectArtifacts.map((artifact, idx) => (
                <div key={`${artifact.file_id || artifact.file_name}-${idx}`} style={artifactPill}>
                  <strong>{artifact.file_name || "Artifact"}</strong>
                  <span style={{ color: "#64748b" }}>
                    {String(artifact.artifact_type || "").replaceAll("_", " ")}
                    {artifact.scenario_label ? ` • ${artifact.scenario_label}` : ""}
                    {artifact.scenario_category ? ` • ${String(artifact.scenario_category).replaceAll("_", " ")}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {scenarioCoverageSummary ? (
          <div style={{ marginTop: 14, border: "1px solid #dbe4ee", borderRadius: 12, background: "#fff", padding: 12 }}>
            <div style={detailTitle}>Scenario Coverage</div>
            <div style={scenarioSummaryGrid}>
              <div style={scenarioStatCard}>
                <div style={scenarioStatLabel}>Status</div>
                <div style={scenarioStatValue}>{scenarioCoverageSummary.status || "MISSING"}</div>
              </div>
              <div style={scenarioStatCard}>
                <div style={scenarioStatLabel}>Samples</div>
                <div style={scenarioStatValue}>{scenarioCoverageSummary.sample_count || 0}</div>
              </div>
              <div style={scenarioStatCard}>
                <div style={scenarioStatLabel}>Happy Path</div>
                <div style={scenarioStatValue}>{scenarioCoverageSummary.categories?.happy_path || 0}</div>
              </div>
              <div style={scenarioStatCard}>
                <div style={scenarioStatLabel}>Edge Cases</div>
                <div style={scenarioStatValue}>{scenarioCoverageSummary.categories?.edge_case || 0}</div>
              </div>
              <div style={scenarioStatCard}>
                <div style={scenarioStatLabel}>Exceptions</div>
                <div style={scenarioStatValue}>{scenarioCoverageSummary.categories?.exception || 0}</div>
              </div>
            </div>
            {Array.isArray(scenarioCoverageSummary.scenario_labels) && scenarioCoverageSummary.scenario_labels.length ? (
              <div style={{ marginTop: 10 }}>
                <div style={{ ...labelStyle, marginBottom: 6 }}>Scenario Labels</div>
                <div style={artifactList}>
                  {scenarioCoverageSummary.scenario_labels.map((label: string, idx: number) => (
                    <div key={`${label}-${idx}`} style={artifactPill}>{label}</div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        {!isStagingSampleUploadEnabled ? (
          <div style={{ marginTop: 12, fontSize: 12, color: "#b91c1c", fontWeight: 700 }}>
            Upload controls are hidden because the active environment is Production. Switch to Staging to upload onboarding artifacts.
          </div>
        ) : null}
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" style={primaryButton} onClick={() => void createProject()}>Create Onboarding Project</button>
        {isPremiumSubscription ? (
          <button type="button" style={secondaryButton} onClick={() => void startPremiumQuickLaunch()}>
            Premium Quick Launch
          </button>
        ) : null}
        <button type="button" style={secondaryButton} onClick={runDiscovery}>Run Discovery</button>
        {isStagingSampleUploadEnabled ? (
          <label style={{ ...secondaryButton, display: "inline-flex", alignItems: "center" }}>
            {uploadingSample ? "Uploading Sample..." : "Upload Sample (Staging)"}
            <input
              type="file"
              accept=".pdf,.xlsx,.xls,.csv,.xml,.json,.txt"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  void uploadSampleFile(file);
                }
                e.currentTarget.value = "";
              }}
              disabled={uploadingSample}
            />
          </label>
        ) : null}
      </div>

      <div style={layout}>
        <div style={leftPane}>
          <div style={panelTitle}>Projects</div>
          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Profile</th>
                  <th style={th}>Stage</th>
                  <th style={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={3} style={tdEmpty}>Loading...</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={3} style={tdEmpty}>No agentic onboarding projects configured.</td></tr>
                ) : rows.map((row) => (
                  <tr
                    key={row.project_id}
                    onClick={() => loadProject(row.project_id)}
                    style={{
                      cursor: "pointer",
                      background: selectedProjectId === row.project_id ? "#eff6ff" : "transparent",
                    }}
                  >
                    <td style={td}>{row.profile_name}</td>
                    <td style={td}>{row.current_stage}</td>
                    <td style={td}>{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={rightPane}>
          <div style={panelTitle}>Workflow</div>
          {!selectedProject ? (
            <div style={emptyState}>Select a project to review stage progress, requirements, drafts, and approval state.</div>
          ) : (
            <>
              <div style={summaryCard}>
                <div style={summaryRow}><strong>Profile</strong><span>{selectedProject.profile_name}</span></div>
                <div style={summaryRow}><strong>Current Stage</strong><span>{detailLoading ? "Loading..." : selectedProject.current_stage}</span></div>
                <div style={summaryRow}><strong>Approval</strong><span>{selectedProject.approval_status}</span></div>
                <div style={summaryRow}><strong>Objective</strong><span>{selectedProject.objective || "-"}</span></div>
              </div>

              <div style={{ ...wideDetailCard, marginBottom: 12 }}>
                <div style={detailTitle}>Message Control Snapshot</div>
                {Object.keys(messageControl).length ? (
                  <div style={messageControlHero}>
                    <div style={messageControlHeroBadge}>Configured</div>
                    <div style={messageControlHeroText}>
                      <strong>Horizon:</strong> {String(messageControl.horizon_mode || messageControl.horizon?.mode || "-")} {String(messageControl.horizon_value || messageControl.horizon?.value || "").trim() ? `(${String(messageControl.horizon_value || messageControl.horizon?.value)})` : ""}
                    </div>
                    <div style={messageControlHeroText}>
                      <strong>Firm vs Forecast:</strong> {String(messageControl.no_indicator_policy || messageControl.indicator_policy || "Use Horizon")}
                    </div>
                    <div style={messageControlHeroText}>
                      <strong>Compare Fields:</strong> {Array.isArray(messageControl.compare_fields) && messageControl.compare_fields.length ? messageControl.compare_fields.join(", ") : String(messageControl.compare_fields || messageControl.line_compare_fields || "material, delivery_date, quantity")}
                    </div>
                    <div style={messageControlHeroText}>
                      <strong>Forecast Action:</strong> {String(messageControl.forecast_action || "EMAIL_ONLY")}
                    </div>
                  </div>
                ) : (
                  <div style={emptyHint}>
                    No message control settings captured yet. Use the wizard tab below to define firm / forecast / horizon behavior.
                  </div>
                )}
              </div>

              <div style={stageRail}>
                {selectedProject.progress_steps.map((step) => (
                  <div
                    key={step.stage}
                    style={{
                      ...stageChip,
                      background:
                        step.status === "DONE"
                          ? "#dcfce7"
                          : step.status === "CURRENT"
                            ? "#dbeafe"
                            : "#f8fafc",
                      borderColor:
                        step.status === "DONE"
                          ? "#86efac"
                          : step.status === "CURRENT"
                            ? "#93c5fd"
                            : "#e5e7eb",
                    }}
                  >
                    <div style={{ fontWeight: 800 }}>{step.stage}</div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>{step.status}</div>
                  </div>
                ))}
              </div>

              <div style={wizardRail}>
                {BUSINESS_WIZARD_STEPS.map((step) => (
                  <button
                    key={step}
                    type="button"
                    style={{
                      ...wizardChip(wizardStep === step),
                    }}
                    onClick={() => setWizardStep(step)}
                  >
                    {step}
                  </button>
                ))}
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                <button type="button" style={primaryButton} onClick={() => advanceStage()}>
                  Advance Stage
                </button>
                <button type="button" style={secondaryButton} onClick={() => advanceStage(selectedProject.current_stage)}>
                  Run Current Stage
                </button>
                <select
                  value={selectedProject.current_stage}
                  onChange={(e) => advanceStage(e.target.value)}
                  style={input}
                >
                  {STAGES.map((stage) => (
                    <option key={stage} value={stage}>{stage}</option>
                  ))}
                </select>
                <button type="button" style={secondaryButton} onClick={() => advanceStage(undefined, "APPROVED")}>
                  Mark Approved
                </button>
              </div>

              <div style={detailGrid}>
                {wizardStep === "Partner Basics" ? (
                  <div style={wideDetailCard}>
                    <div style={detailTitle}>Partner Basics</div>
                    {Object.keys(businessQuestionnaire).length ? (
                      renderKeyValueSummary(businessQuestionnaire)
                    ) : Object.keys(ediInterfaceSummary).length ? (
                      renderKeyValueSummary(ediInterfaceSummary)
                    ) : (
                      <div style={emptyHint}>
                        Download and upload the business onboarding workbook or EDI checklist to auto-fill this section.
                      </div>
                    )}
                  </div>
                ) : null}

                {wizardStep === "Field Rules" ? (
                  <div style={wideDetailCard}>
                    <div style={detailTitle}>Field Rules</div>
                    {businessFieldRules.length ? (
                      <div style={artifactList}>
                        {businessFieldRules.map((rule, idx) => (
                          <div key={`${rule.business_field}-${idx}`} style={artifactPill}>
                            <strong>{String(rule.business_field || "Field")}</strong>
                            <span style={{ color: "#64748b" }}>{String(rule.required_level || "OPTIONAL")}</span>
                          </div>
                        ))}
                      </div>
                    ) : ediBusinessChecklist.length ? (
                      <div style={summaryList}>
                        {ediBusinessChecklist.map((item, idx) => (
                          <div key={`${item.question}-${idx}`} style={summaryListRow}>
                            <div style={summaryLabel}>{String(item.question || "Question")}</div>
                            <div style={summaryValue}>{String(item.answer || "-")}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={emptyHint}>No business field rules have been captured yet.</div>
                    )}
                  </div>
                ) : null}

                {wizardStep === "Message Control" ? (
                  <div style={wideDetailCard}>
                    <div style={detailTitle}>Message Control</div>
                    {renderKeyValueSummary(messageControl)}
                  </div>
                ) : null}

                {wizardStep === "Target Output" ? (
                  <div style={wideDetailCard}>
                    <div style={detailTitle}>Target Output</div>
                    {Object.keys(businessTargetOutput).length ? (
                      renderKeyValueSummary(businessTargetOutput)
                    ) : Object.keys(ediTargetOutput).length ? (
                      renderKeyValueSummary(ediTargetOutput)
                    ) : (
                      <div style={emptyHint}>No target output expectations captured yet.</div>
                    )}
                  </div>
                ) : null}

                {wizardStep === "Samples" ? (
                  <div style={wideDetailCard}>
                    <div style={detailTitle}>Samples and Coverage</div>
                    {projectArtifacts.length ? (
                      <div style={artifactList}>
                        {projectArtifacts.map((artifact, idx) => (
                          <div key={`${artifact.file_id || artifact.file_name}-${idx}`} style={artifactPill}>
                            <strong>{artifact.file_name || "Artifact"}</strong>
                            <span style={{ color: "#64748b" }}>
                              {String(artifact.artifact_type || "").replaceAll("_", " ")}
                              {artifact.scenario_label ? ` • ${artifact.scenario_label}` : ""}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={emptyHint}>No artifacts or samples uploaded yet.</div>
                    )}
                    {businessTestScenarios.length ? (
                      <>
                        <div style={miniSectionTitle}>Test Scenarios</div>
                        <div style={summaryList}>
                          {businessTestScenarios.map((scenario, idx) => (
                            <div key={`${scenario.scenario}-${idx}`} style={summaryListRow}>
                              <div style={summaryLabel}>{String(scenario.scenario || "Scenario")}</div>
                              <div style={summaryValue}>{String(scenario.expected_outcome || "-")}</div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : null}
                    {scenarioCoverageSummary ? (
                      <>
                        <div style={miniSectionTitle}>Coverage Summary</div>
                        <div style={scenarioSummaryGrid}>
                          <div style={scenarioStatCard}>
                            <div style={scenarioStatLabel}>Status</div>
                            <div style={scenarioStatValue}>{scenarioCoverageSummary.status || "MISSING"}</div>
                          </div>
                          <div style={scenarioStatCard}>
                            <div style={scenarioStatLabel}>Samples</div>
                            <div style={scenarioStatValue}>{scenarioCoverageSummary.sample_count || 0}</div>
                          </div>
                          <div style={scenarioStatCard}>
                            <div style={scenarioStatLabel}>Happy Path</div>
                            <div style={scenarioStatValue}>{scenarioCoverageSummary.categories?.happy_path || 0}</div>
                          </div>
                          <div style={scenarioStatCard}>
                            <div style={scenarioStatLabel}>Edge Cases</div>
                            <div style={scenarioStatValue}>{scenarioCoverageSummary.categories?.edge_case || 0}</div>
                          </div>
                          <div style={scenarioStatCard}>
                            <div style={scenarioStatLabel}>Exceptions</div>
                            <div style={scenarioStatValue}>{scenarioCoverageSummary.categories?.exception || 0}</div>
                          </div>
                        </div>
                      </>
                    ) : null}
                  </div>
                ) : null}

                {wizardStep === "Review" ? (
                  <div style={wideDetailCard}>
                    <div style={detailTitle}>Review Before Activation</div>
                    <div style={summaryList}>
                      <div style={summaryListRow}>
                        <div style={summaryLabel}>Questionnaire</div>
                        <div style={summaryValue}>{hasBusinessWorkbookData ? "Captured" : "Missing"}</div>
                      </div>
                      <div style={summaryListRow}>
                        <div style={summaryLabel}>Source Artifacts</div>
                        <div style={summaryValue}>{projectArtifacts.length} uploaded</div>
                      </div>
                      <div style={summaryListRow}>
                        <div style={summaryLabel}>Current Stage</div>
                        <div style={summaryValue}>{selectedProject.current_stage}</div>
                      </div>
                      <div style={summaryListRow}>
                        <div style={summaryLabel}>Approval</div>
                        <div style={summaryValue}>{selectedProject.approval_status}</div>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div style={detailCard}>
                  <div style={detailTitle}>Conversation Summary</div>
                  <textarea
                    value={selectedProject.conversation_summary || ""}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((row) =>
                          row.project_id === selectedProject.project_id
                            ? { ...row, conversation_summary: e.target.value }
                            : row
                        )
                      )
                    }
                    style={textArea}
                  />
                  <button
                    type="button"
                    style={secondaryButton}
                    onClick={() => saveProjectPatch({ conversation_summary: selectedProject.conversation_summary })}
                  >
                    Save Summary
                  </button>
                </div>

                <div style={detailCard}>
                  <div style={detailTitle}>Recommended Actions</div>
                  <ul style={{ margin: 0, paddingLeft: 18, color: "#475569", lineHeight: 1.7 }}>
                    {(selectedProject.recommended_actions || []).map((action, idx) => (
                      <li key={`${action}-${idx}`}>{action}</li>
                    ))}
                  </ul>
                </div>

                <div style={detailCard}>
                  <div style={detailTitle}>Sample Analysis</div>
                  <pre style={jsonBlock}>
{JSON.stringify(selectedProject.discovery_json?.sample_analysis_json || {}, null, 2)}
                  </pre>
                </div>

                <div style={wideDetailCard}>
                  <div style={detailTitle}>Technical Details</div>
                  <button
                    type="button"
                    style={secondaryButton}
                    onClick={() => setShowTechnicalDetails((prev) => !prev)}
                  >
                    {showTechnicalDetails ? "Hide Technical Details" : "Show Technical Details"}
                  </button>
                  {showTechnicalDetails ? (
                    <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                      <pre style={jsonBlock}>
{JSON.stringify(
  {
    extraction_profile_json: selectedProject.extraction_profile_json,
    address_match_profile_json: selectedProject.address_match_profile_json,
    mapping_profile_json: selectedProject.mapping_profile_json,
    rule_profile_json: selectedProject.rule_profile_json,
  },
  null,
  2
)}
                      </pre>
                      <pre style={jsonBlock}>{JSON.stringify(selectedProject.test_plan_json || {}, null, 2)}</pre>
                      <pre style={jsonBlock}>{JSON.stringify(selectedProject.test_results_json || {}, null, 2)}</pre>
                    </div>
                  ) : (
                    <div style={emptyHint}>Technical draft configuration, test plan, and test results are hidden by default for business users.</div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function field(label: string, child: React.ReactNode) {
  return <div><div style={labelStyle}>{label}</div>{child}</div>;
}

const title: React.CSSProperties = { fontSize: 16, fontWeight: 800, color: "#0f172a", marginBottom: 8 };
const subTitle: React.CSSProperties = { fontSize: 13, color: "#64748b", marginBottom: 14 };
const collectRequirementsBanner: React.CSSProperties = { marginBottom: 14, border: "1px solid #bfdbfe", borderRadius: 10, padding: "10px 12px", fontSize: 13, fontWeight: 600, color: "#1d4ed8", background: "#eff6ff" };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 };
const layout: React.CSSProperties = { display: "grid", gridTemplateColumns: "0.9fr 1.6fr", gap: 16, marginTop: 18 };
const artifactIntroCard: React.CSSProperties = { marginTop: 16, border: "1px solid #dbe4ee", borderRadius: 14, background: "linear-gradient(180deg, #f8fbff 0%, #ffffff 100%)", padding: 14 };
const artifactGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 };
const artifactCard: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 12, display: "grid", gap: 10 };
const artifactCardTitle: React.CSSProperties = { fontSize: 13, fontWeight: 800, color: "#0f172a" };
const artifactCardText: React.CSSProperties = { fontSize: 12, color: "#64748b", lineHeight: 1.6 };
const artifactActionRow: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" };
const artifactList: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap" };
const artifactPill: React.CSSProperties = { display: "grid", gap: 4, border: "1px solid #dbe4ee", borderRadius: 999, padding: "8px 12px", background: "#fff", fontSize: 12, color: "#334155" };
const scenarioSummaryGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10 };
const scenarioStatCard: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 10, background: "#f8fafc", padding: 10 };
const scenarioStatLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.3 };
const scenarioStatValue: React.CSSProperties = { fontSize: 18, fontWeight: 800, color: "#0f172a" };
const leftPane: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 14 };
const rightPane: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 14 };
const panelTitle: React.CSSProperties = { fontSize: 15, fontWeight: 800, color: "#0f172a", marginBottom: 12 };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 6 };
const input: React.CSSProperties = { width: "100%", minHeight: 38, padding: "8px 10px", borderRadius: 8, border: "1px solid #dbe4ee", boxSizing: "border-box" };
const primaryButton: React.CSSProperties = { border: "1px solid #0b5fff", background: "#0b5fff", color: "#fff", borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" };
const secondaryButton: React.CSSProperties = { border: "1px solid #dbe4ee", background: "#fff", color: "#0f172a", borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" };
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const th: React.CSSProperties = { textAlign: "left", padding: "10px 12px", fontSize: 12, fontWeight: 800, color: "#334155", borderBottom: "1px solid #e5e7eb", background: "#f8fafc" };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: 13, color: "#0f172a", borderBottom: "1px solid #eef2f7" };
const tdEmpty: React.CSSProperties = { padding: "16px 12px", fontSize: 13, color: "#64748b", borderBottom: "1px solid #eef2f7" };
const emptyState: React.CSSProperties = { color: "#64748b", fontSize: 13, lineHeight: 1.6 };
const summaryCard: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#f8fafc", display: "grid", gap: 8, marginBottom: 12 };
const invoiceHint: React.CSSProperties = { marginTop: 10, padding: "10px 12px", borderRadius: 12, background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1e3a8a", fontSize: 12, fontWeight: 600 };
const premiumQuickStartCard: React.CSSProperties = { marginTop: 14, padding: 14, borderRadius: 14, border: "1px solid #c7d2fe", background: "linear-gradient(180deg, #eef2ff 0%, #f8fbff 100%)" };

const messageControlHero: React.CSSProperties = { display: "grid", gap: 8, padding: 12, borderRadius: 12, background: "linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%)", border: "1px solid #bfdbfe" };

const messageControlHeroBadge: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: "fit-content", padding: "4px 10px", borderRadius: 999, background: "#dbeafe", color: "#1d4ed8", fontWeight: 800, fontSize: 12 };

const messageControlHeroText: React.CSSProperties = { fontSize: 13, color: "#0f172a", lineHeight: 1.45 };

const summaryRow: React.CSSProperties = { display: "grid", gridTemplateColumns: "150px 1fr", gap: 10, fontSize: 13, color: "#334155" };
const stageRail: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginBottom: 14 };
const stageChip: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 12, padding: "10px 12px" };
const wizardRail: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 };
const wizardChip = (active: boolean): React.CSSProperties => ({
  border: `1px solid ${active ? "#93c5fd" : "#dbe4ee"}`,
  background: active ? "#eff6ff" : "#fff",
  color: active ? "#1d4ed8" : "#334155",
  borderRadius: 999,
  padding: "8px 12px",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
});
const detailGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 };
const detailCard: React.CSSProperties = { border: "1px solid #eef2f7", borderRadius: 12, padding: 12, background: "#fff" };
const wideDetailCard: React.CSSProperties = { ...detailCard, gridColumn: "1 / -1" };
const detailTitle: React.CSSProperties = { fontSize: 13, fontWeight: 800, color: "#0f172a", marginBottom: 10 };
const miniSectionTitle: React.CSSProperties = { fontSize: 12, fontWeight: 800, color: "#334155", margin: "10px 0 8px" };
const textArea: React.CSSProperties = { width: "100%", minHeight: 160, borderRadius: 10, border: "1px solid #dbe4ee", padding: 10, boxSizing: "border-box", fontFamily: "inherit", fontSize: 13, marginBottom: 10 };
const jsonBlock: React.CSSProperties = { margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12, color: "#334155", background: "#f8fafc", borderRadius: 8, padding: 10, maxHeight: 260, overflow: "auto" };
const summaryList: React.CSSProperties = { display: "grid", gap: 8 };
const summaryListRow: React.CSSProperties = { display: "grid", gap: 4, border: "1px solid #eef2f7", borderRadius: 10, padding: "10px 12px", background: "#f8fafc" };
const summaryLabel: React.CSSProperties = { fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.3 };
const summaryValue: React.CSSProperties = { fontSize: 13, color: "#0f172a", lineHeight: 1.5 };
const emptyHint: React.CSSProperties = { fontSize: 12, color: "#64748b", lineHeight: 1.6 };
