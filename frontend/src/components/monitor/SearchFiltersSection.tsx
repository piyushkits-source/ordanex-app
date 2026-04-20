import { FaCalendarAlt, FaExchangeAlt, FaFilter, FaSearch } from "react-icons/fa";
import { softInput, selectInput } from "../common/styles";
import type { DirectionType, EnvironmentType, StatusType } from "../../types/messageMonitor";

interface Props {
  search: string;
  onSearch: (v: string) => void;
  fromDateTime: string;
  toDateTime: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  environment: EnvironmentType;
  onEnvironment: (v: EnvironmentType) => void;
  direction: DirectionType;
  onDirection: (v: DirectionType) => void;
  status: StatusType;
  onStatus: (v: StatusType) => void;
}

export default function SearchFiltersSection(props: Props) {
  return (
    <div style={{ background: "#0f7cc0", padding: 18, display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1.45fr 0.78fr 0.78fr", gap: 12 }}>
        <Field icon={<FaSearch />} white label="Search">
          <input
            value={props.search}
            onChange={(e) => props.onSearch(e.target.value)}
            placeholder="Search Sender, Receiver, PO number, or advanced field search"
            style={{ ...softInput, paddingLeft: 40 }}
          />
        </Field>
        <Field icon={<FaCalendarAlt />} white label="From">
          <input
            type="datetime-local"
            value={props.fromDateTime}
            onChange={(e) => props.onFrom(e.target.value)}
            style={{ ...softInput, paddingLeft: 40 }}
          />
        </Field>
        <Field icon={<FaCalendarAlt />} white label="To">
          <input
            type="datetime-local"
            value={props.toDateTime}
            onChange={(e) => props.onTo(e.target.value)}
            style={{ ...softInput, paddingLeft: 40 }}
          />
        </Field>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <Field icon={<FaFilter />} white label="Environment">
          <select value={props.environment} onChange={(e) => props.onEnvironment(e.target.value as EnvironmentType)} style={selectInput}>
            <option value="STAGING">Staging</option>
            <option value="PRODUCTION">Production</option>
          </select>
        </Field>
        <Field icon={<FaExchangeAlt />} white label="Message Direction">
          <select value={props.direction} onChange={(e) => props.onDirection(e.target.value as DirectionType)} style={selectInput}>
            <option value="ALL">All</option>
            <option value="INBOUND">Inbound</option>
            <option value="OUTBOUND">Outbound</option>
          </select>
        </Field>
        <Field icon={<FaFilter />} white label="Status">
          <select value={props.status} onChange={(e) => props.onStatus(e.target.value as StatusType)} style={selectInput}>
            <option value="ALL">All</option>
            <option value="SUCCESSFUL">Successful</option>
            <option value="ERROR">Error</option>
            <option value="IN_PROGRESS">In-Progress</option>
            <option value="PENDING">Pending</option>
            <option value="ARCHIVED">Archive</option>
          </select>
        </Field>
      </div>
    </div>
  );
}

function Field({ label, icon, children, white }: { label: string; icon: React.ReactNode; children: React.ReactNode; white?: boolean }) {
  return (
    <label style={{ display: "grid", gap: 6, minWidth: 0 }}>
      <span style={{ fontSize: 12, color: white ? "#dbeafe" : "#64748b", fontWeight: 700 }}>{label}</span>
      <div style={{ position: "relative", minWidth: 0 }}>
        <div style={{ position: "absolute", left: 12, top: 11, color: "#64748b", zIndex: 1 }}>{icon}</div>
        {children}
      </div>
    </label>
  );
}