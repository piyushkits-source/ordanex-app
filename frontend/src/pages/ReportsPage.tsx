import PageHeader from "../components/common/PageHeader";
import ComingSoonCard from "../components/common/ComingSoonCard";

export default function ReportsPage() {
  return (
    <div>
      <PageHeader title="Reports" subtitle="Generate operational exports and audit-friendly summaries." />
      <ComingSoonCard
        title="Reports Module"
        points={["PO summary", "Exception report", "Export history"]}
      />
    </div>
  );
}