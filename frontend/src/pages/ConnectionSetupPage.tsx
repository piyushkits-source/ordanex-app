import { useQuery } from "@tanstack/react-query";
import type { EnvironmentType } from "../types/common";
import { listConnectors } from "../api/connectorsApi";
import PageHeader from "../components/common/PageHeader";

export default function ConnectionSetupPage({ environment }: { environment: EnvironmentType }) {
  const query = useQuery({
    queryKey: ["connectors", environment],
    queryFn: () => listConnectors(environment),
  });

  return (
    <div>
      <PageHeader title={`${environment} Connection Setup`} subtitle="Maintain separate setup for staging and production." />
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 16 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "#f9fafb" }}>
            <tr>
              {["Name", "Protocol", "Direction", "Status"].map((h) => <th key={h} style={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {(query.data ?? []).map((row, idx) => (
              <tr key={idx} style={{ borderTop: "1px solid #f3f4f6" }}>
                <td style={td}>{String(row.config_name ?? "-")}</td>
                <td style={td}>{String(row.protocol ?? "-")}</td>
                <td style={td}>{String(row.direction ?? "-")}</td>
                <td style={td}>{String(row.test_status ?? "NOT_TESTED")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th: React.CSSProperties = { textAlign: "left", padding: 12, fontSize: 13 };
const td: React.CSSProperties = { padding: 12 };