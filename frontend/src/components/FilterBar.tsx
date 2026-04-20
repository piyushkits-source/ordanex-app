import type { Environment } from "../types";

type Props = {
  environment: Environment;
  onEnvironmentChange: (value: Environment) => void;
  direction: string;
  onDirectionChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
};

export default function FilterBar(props: Props) {
  return (
    <div className="panel filter-panel">
      <div className="segmented">
        {(["PROD","STAGING"] as Environment[]).map(env => (
          <button key={env} className={props.environment === env ? "segmented-active" : ""} onClick={() => props.onEnvironmentChange(env)}>
            {env === "PROD" ? "Production" : "Staging"}
          </button>
        ))}
      </div>

      <div className="filter-row">
        <div className="chip-group">
          <span className="filter-label">Direction</span>
          {["ALL","INBOUND","OUTBOUND"].map(value => (
            <button key={value} className={props.direction === value ? "chip chip-active" : "chip"} onClick={() => props.onDirectionChange(value)}>
              {value === "INBOUND" ? "⬅ Inbound" : value === "OUTBOUND" ? "➡ Outbound" : "◻ All"}
            </button>
          ))}
        </div>

        <div className="chip-group">
          <span className="filter-label">Status</span>
          {["ALL","SUCCESS","NEW","ERROR"].map(value => (
            <button key={value} className={props.status === value ? "chip chip-active" : "chip"} onClick={() => props.onStatusChange(value)}>
              {value === "SUCCESS" ? "🟢 Success" : value === "NEW" ? "🟡 Pending" : value === "ERROR" ? "🔴 Failure" : "◻ All"}
            </button>
          ))}
        </div>

        <div className="search-box">
          <input value={props.search} onChange={e => props.onSearchChange(e.target.value)} placeholder="Search document number, sender, receiver" />
        </div>
      </div>
    </div>
  );
}
