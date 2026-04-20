import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { PurchaseOrder } from "../types/po";
import { archivePurchaseOrder, processPurchaseOrder, reprocessPurchaseOrder, updatePurchaseOrder } from "../api/purchaseOrdersApi";
import StatusBadge from "./StatusBadge";

interface Props {
  po: PurchaseOrder | null;
  environment: "STAGING" | "PROD";
}

const archiveReasons = [
  { value: "NOT_A_VALID_PO", label: "Not a valid PO" },
  { value: "PO_ALREADY_MANUALLY_ENTERED", label: "PO already manually entered" },
  { value: "PO_REQUIRE_CHANGES_AT_CUSTOMER_END", label: "PO require changes at Customer end" },
] as const;

export default function PoDetailPanel({ po, environment }: Props) {
  const queryClient = useQueryClient();
  const [archiveReason, setArchiveReason] = useState<string>("NOT_A_VALID_PO");
  const [archiveComment, setArchiveComment] = useState("");
  const [editDraft, setEditDraft] = useState<PurchaseOrder | null>(po);

  const canEdit = useMemo(() => po?.status === "ERROR" || po?.status === "PENDING", [po]);
  const canProcess = environment === "STAGING";

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["monitoring", environment] });
    if (po?.po_id) {
      await queryClient.invalidateQueries({ queryKey: ["po", po.po_id] });
    }
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!po || !editDraft) return null;
      return updatePurchaseOrder(po.po_id, {
        po_number: editDraft.po_number,
        supplier_name: editDraft.supplier_name,
        currency: editDraft.currency,
        sold_to: editDraft.sold_to,
        ship_to: editDraft.ship_to,
      });
    },
    onSuccess: refresh,
  });

  const processMutation = useMutation({
    mutationFn: async () => {
      if (!po) return null;
      return processPurchaseOrder(po.po_id);
    },
    onSuccess: refresh,
  });

  const reprocessMutation = useMutation({
    mutationFn: async () => {
      if (!po) return null;
      return reprocessPurchaseOrder(po.po_id);
    },
    onSuccess: refresh,
  });

  const archiveMutation = useMutation({
    mutationFn: async () => {
      if (!po) return null;
      return archivePurchaseOrder(po.po_id, {
        archive_reason: archiveReason as "NOT_A_VALID_PO" | "PO_ALREADY_MANUALLY_ENTERED" | "PO_REQUIRE_CHANGES_AT_CUSTOMER_END",
        archive_comment: archiveComment || undefined,
      });
    },
    onSuccess: refresh,
  });

  if (!po) {
    return (
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 18 }}>
        Select a PO to view details.
      </div>
    );
  }

  const setField = (field: keyof PurchaseOrder, value: string) => {
    setEditDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{po.po_number || po.po_id}</div>
          <div style={{ color: "#6b7280", marginTop: 4 }}>
            {environment} environment · Edit only for ERROR / PENDING
          </div>
        </div>
        <StatusBadge value={po.status} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        {[
          ["PO Number", editDraft?.po_number || "", "po_number"],
          ["Supplier", editDraft?.supplier_name || "", "supplier_name"],
          ["Currency", editDraft?.currency || "", "currency"],
          ["Sold To", editDraft?.sold_to || "", "sold_to"],
          ["Ship To", editDraft?.ship_to || "", "ship_to"],
        ].map(([label, value, key]) => (
          <label key={key as string} style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, color: "#374151", fontWeight: 600 }}>{label}</span>
            <input
              value={value}
              onChange={(e) => setField(key as keyof PurchaseOrder, e.target.value)}
              disabled={!canEdit}
              style={{
                width: "100%",
                border: "1px solid #d1d5db",
                borderRadius: 10,
                padding: "10px 12px",
                background: canEdit ? "#fff" : "#f9fafb",
              }}
            />
          </label>
        ))}
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: "#374151", fontWeight: 700, marginBottom: 8 }}>Validation / Error Reason</div>
        <div style={{ padding: 12, borderRadius: 10, background: "#f9fafb", border: "1px solid #e5e7eb", color: "#374151" }}>
          {po.po_validation_reason || "No validation reason available."}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 22 }}>
        <button
          onClick={() => updateMutation.mutate()}
          disabled={!canEdit || updateMutation.isPending}
          style={primaryButton(!canEdit)}
        >
          Save Edits
        </button>
        <button
          onClick={() => processMutation.mutate()}
          disabled={!canProcess || processMutation.isPending}
          style={secondaryButton(!canProcess)}
        >
          Process
        </button>
        <button
          onClick={() => reprocessMutation.mutate()}
          disabled={!canProcess || reprocessMutation.isPending}
          style={secondaryButton(!canProcess)}
        >
          Reprocess
        </button>
      </div>

      <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 18 }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>Archive Failed PO</div>
        <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>
          Archive action is intended for failed or exception POs with a valid reason.
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <select
            value={archiveReason}
            onChange={(e) => setArchiveReason(e.target.value)}
            style={inputStyle}
          >
            {archiveReasons.map((reason) => (
              <option key={reason.value} value={reason.value}>
                {reason.label}
              </option>
            ))}
          </select>

          <textarea
            rows={3}
            placeholder="Optional comment"
            value={archiveComment}
            onChange={(e) => setArchiveComment(e.target.value)}
            style={{ ...inputStyle, resize: "vertical" }}
          />

          <button
            onClick={() => archiveMutation.mutate()}
            disabled={archiveMutation.isPending}
            style={{ ...secondaryButton(false), background: "#1f2937", color: "#fff", borderColor: "#1f2937" }}
          >
            Archive PO
          </button>
        </div>
      </div>

      {po.xml_payload ? (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Transformed XML</div>
          <pre
            style={{
              maxHeight: 240,
              overflow: "auto",
              background: "#111827",
              color: "#f9fafb",
              borderRadius: 12,
              padding: 14,
              fontSize: 12,
            }}
          >
            {po.xml_payload}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #d1d5db",
  borderRadius: 10,
  padding: "10px 12px",
  background: "#fff",
};

function primaryButton(disabled: boolean): React.CSSProperties {
  return {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid #111827",
    background: disabled ? "#9ca3af" : "#111827",
    color: "#fff",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 700,
  };
}

function secondaryButton(disabled: boolean): React.CSSProperties {
  return {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid #d1d5db",
    background: disabled ? "#f3f4f6" : "#fff",
    color: "#111827",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 700,
  };
}