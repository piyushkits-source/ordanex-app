import { FaCalendarAlt, FaExchangeAlt, FaFilter, FaSearch } from "react-icons/fa";
import { card, inputStyle, labelStyle } from "../common/styles";
import type { DirectionType, EnvironmentType, StatusType } from "../../types/messageMonitor";
interface Props {
  search: string; onSearch: (v: string) => void; fromDateTime: string; toDateTime: string; onFrom: (v: string) => void; onTo: (v: string) => void;
  environment: EnvironmentType; onEnvironment: (v: EnvironmentType) => void; direction: DirectionType; onDirection: (v: DirectionType) => void; status: StatusType; onStatus: (v: StatusType) => void;
}
export default function SearchToolbar(props: Props) {
  return <div style={{ ...card, padding: 16, display: "grid", gap: 14 }}>
    <div style={{ display: "grid", gridTemplateColumns: "1.35fr 0.8fr 0.8fr", gap: 12 }}>
      <Field label="Search" icon={<FaSearch />}><input value={props.search} onChange={e => props.onSearch(e.target.value)} placeholder="Search Sender, Receiver, PO number, or advanced field search" style={{ ...inputStyle, paddingLeft: 38 }} /></Field>
      <Field label="From" icon={<FaCalendarAlt />}><input type="datetime-local" value={props.fromDateTime} onChange={e => props.onFrom(e.target.value)} style={{ ...inputStyle, paddingLeft: 38 }} /></Field>
      <Field label="To" icon={<FaCalendarAlt />}><input type="datetime-local" value={props.toDateTime} onChange={e => props.onTo(e.target.value)} style={{ ...inputStyle, paddingLeft: 38 }} /></Field>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
      <Field label="Environment" icon={<FaFilter />}><select value={props.environment} onChange={e => props.onEnvironment(e.target.value as EnvironmentType)} style={{ ...inputStyle, paddingLeft: 38 }}><option value="STAGING">Staging</option><option value="PRODUCTION">Production</option></select></Field>
      <Field label="Message Direction" icon={<FaExchangeAlt />}><select value={props.direction} onChange={e => props.onDirection(e.target.value as DirectionType)} style={{ ...inputStyle, paddingLeft: 38 }}><option value="ALL">All</option><option value="INBOUND">Inbound</option><option value="OUTBOUND">Outbound</option></select></Field>
      <Field label="Status" icon={<FaFilter />}><select value={props.status} onChange={e => props.onStatus(e.target.value as StatusType)} style={{ ...inputStyle, paddingLeft: 38 }}><option value="ALL">All</option><option value="SUCCESSFUL">Successful</option><option value="ERROR">Error</option><option value="IN_PROGRESS">In-Progress</option><option value="PENDING">Pending</option><option value="ARCHIVED">Archive</option></select></Field>
    </div>
  </div>;
}
function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <label style={{ display: "grid", gap: 6 }}><span style={labelStyle}>{label}</span><div style={{ position: "relative" }}><div style={{ position: "absolute", left: 12, top: 11, color: "#64748b" }}>{icon}</div>{children}</div></label>;
}