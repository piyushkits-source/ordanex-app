import PageHeader from "../components/common/PageHeader";
import ComingSoonCard from "../components/common/ComingSoonCard";

export default function ConnectorsPage() {
  return (
    <div>
      <PageHeader title="Connectors" subtitle="Maintain inbound and outbound connections for staging and production." />
      <ComingSoonCard
        title="Connectors Module"
        points={["Email / API / SFTP / AS2", "Environment-specific settings", "Connection test actions"]}
      />
    </div>
  );
}