import type { ChangeEvent } from "react";
import { FaMagnifyingGlass, FaCalendarDays, FaArrowRightArrowLeft, FaFilter } from "react-icons/fa6";
import { glassCard, softInput, subtleLabel } from "../common/PremiumStyles";
import type { DirectionType, EnvironmentType, StatusType } from "../../types/messageMonitor";

interface Props {
  environment: EnvironmentType;
  direction: DirectionType;
  status: StatusType;
  search: string;
  fromDateTime: string;
  toDateTime: string;
  onEnvironmentChange: (value: EnvironmentType) => void;
  onDirectionChange: (value: DirectionType) => void;
  onStatusChange: (value: StatusType) => void;
  onSearchChange: (value: string) => void;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}

export default function PremiumToolbar(props: Props) {
  return (
    <div style={{ ...glassCard, padding: 18, display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.8fr 0.8fr", gap: 14 }}>
        <LabeledInput
          icon={<FaMagnifyingGlass />}
          label="Search"
          placeholder="Search sender, receiver, PO number, or advanced field data"
          value={props.search}
          onChange={(e) => props.onSearchChange(e.target.value)}
        />
        <LabeledInput
          icon={<FaCalendarDays />}
          label="From"
          type="datetime-local"
          value={props.fromDateTime}
          onChange={(e) => props.onFromChange(e.target.value)}
        />
        <LabeledInput
          icon={<FaCalendarDays />}
          label="To"
          type="datetime-local"
          value={props.toDateTime}
          onChange={(e) => props.onToChange(e.target.value)}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        <LabeledSelect
          icon={<FaFilter />}
          label="Environment"
          value={props.environment}
          onChange={(e) => props.onEnvironmentChange(e.target.value as EnvironmentType)}
          options={[
            { value: "STAGING", label: "Staging" },
            { value: "PRODUCTION", label: "Production" },
          ]}
        />

        <LabeledSelect
          icon={<FaArrowRightArrowLeft />}
          label="Message Direction"
          value={props.direction}
          onChange={(e) => props.onDirectionChange(e.target.value as DirectionType)}
          options={[
            { value: "ALL", label: "All" },
            { value: "INBOUND", label: "Inbound" },
            { value: "OUTBOUND", label: "Outbound" },
          ]}
        />

        <LabeledSelect
          icon={<FaFilter />}
          label="Status"
          value={props.status}
          onChange={(e) => props.onStatusChange(e.target.value as StatusType)}
          options={[
            { value: "ALL", label: "All" },
            { value: "SUCCESSFUL", label: "Successful" },
            { value: "ERROR", label: "Error" },
            { value: "IN_PROGRESS", label: "In-Progress" },
            { value: "PENDING", label: "Pending" },
            { value: "ARCHIVED", label: "Archive" },
          ]}
        />
      </div>
    </div>
  );
}

function LabeledInput(props: {
  icon: React.ReactNode;
  label: string;
  placeholder?: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  type?: string;
}) {
  return (
    <label style={{ display: "grid", gap: 8 }}>
      <span style={subtleLabel}>{props.label}</span>
      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", left: 12, top: 12, color: "#64748b" }}>{props.icon}</div>
        <input
          type={props.type ?? "text"}
          value={props.value}
          placeholder={props.placeholder}
          onChange={props.onChange}
          style={{ ...softInput, paddingLeft: 40 }}
        />
      </div>
    </label>
  );
}

function LabeledSelect(props: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label style={{ display: "grid", gap: 8 }}>
      <span style={subtleLabel}>{props.label}</span>
      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", left: 12, top: 12, color: "#64748b" }}>{props.icon}</div>
        <select value={props.value} onChange={props.onChange} style={{ ...softInput, paddingLeft: 40 }}>
          {props.options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>
    </label>
  );
}