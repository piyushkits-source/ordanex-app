import PageHeader from "../components/common/PageHeader";
import ComingSoonCard from "../components/common/ComingSoonCard";

export default function AnalyticsPage() {
  return (
    <div>
      <PageHeader title="Analytics" subtitle="Visual operational KPIs and trend analysis." />
      <ComingSoonCard
        title="Analytics Module"
        points={["Volume trend", "Manual touch rate", "Failure reason analysis"]}
      />
    </div>
  );
}