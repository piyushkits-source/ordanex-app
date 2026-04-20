import { FaSearch, FaCalendarAlt, FaExchangeAlt, FaFilter } from "react-icons/fa";
import { topBlueSection, whiteInput, whiteSelect } from "../common/monitorStyles";
import type { DirectionType, EnvironmentType, StatusFilter } from "../../types/monitoring";

interface Props {
  search: string;
  onSearch: (value: string) => void;
  fromDate: string;
  toDate: string;
  onFromDate: (value: string) => void;
  onToDate: (value: string) => void;
  environment: EnvironmentType;
  onEnvironment: (value: EnvironmentType) => void;
  direction: DirectionType;
  onDirection: (value: DirectionType) => void;
  status: StatusFilter;
  onStatus: (value: StatusFilter) => void;
}

export default function MonitorFiltersSection(props: Props) {
  return (
    <div style={{ ...topBlueSection, padding: 18, display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1.45fr 0.78fr 0.78fr", gap: 12 }}>
        <Field label="Search" icon={<FaSearch />}>
          <input value={props.search} onChange={(e) => props.onSearch(e.target.value)} placeholder="Search sender, receiver, PO number, or advanced field search" style={{ ...whiteInput, paddingLeft: 40 }} />
        </Field>
        <Field label="From" icon={<FaCalendarAlt />}>
          <input type="date" value={props.fromDate} onChange={(e) => props.onFromDate(e.target.value)} style={{ ...whiteInput, paddingLeft: 40 }} />
        </Field>
        <Field label="To" icon={<FaCalendarAlt />}>
          <input type="date" value={props.toDate} onChange={(e) => props.onToDate(e.target.value)} style={{ ...whiteInput, paddingLeft: 40 }} />
        </Field>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <Field label="Environment" icon={<FaFilter />}>
          <select value={props.environment} onChange={(e) => props.onEnvironment(e.target.value as EnvironmentType)} style={whiteSelect}>
            <option value="PROD">Production</option>
            <option value="STAGING">Staging</option>
          </select>
        </Field>
        <Field label="Message Direction" icon={<FaExchangeAlt />}>
          <select value={props.direction} onChange={(e) => props.onDirection(e.target.value as DirectionType)} style={whiteSelect}>
            <option value="ALL">All</option>
            <option value="INBOUND">Inbound</option>
            <option value="OUTBOUND">Outbound</option>
          </select>
        </Field>
        <Field label="Status" icon={<FaFilter />}>
          <select value={props.status} onChange={(e) => props.onStatus(e.target.value as StatusFilter)} style={whiteSelect}>
            <option value="ALL">All</option>
            <option value="PROCESSED">Processed</option>
            <option value="PENDING">Pending</option>
            <option value="FAILED">Failed</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </Field>
      </div>
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 6, minWidth: 0 }}>
      <span style={{ fontSize: 12, color: "#dbeafe", fontWeight: 700 }}>{label}</span>
      <div style={{ position: "relative", minWidth: 0 }}>
        <div style={{ position: "absolute", left: 12, top: 11, color: "#64748b", zIndex: 1 }}>{icon}</div>
        {children}
      </div>
    </label>
  );
}
