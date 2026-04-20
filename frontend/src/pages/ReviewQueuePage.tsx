import PageHeader from "../components/common/PageHeader";
import ComingSoonCard from "../components/common/ComingSoonCard";

export default function ReviewQueuePage() {
  return (
    <div>
      <PageHeader title="Review Queue" subtitle="Documents requiring manual validation and correction." />
      <ComingSoonCard
        title="Review Queue Module"
        points={["Pending queue by error reason", "Approve / reject flow", "Correction and reprocess controls"]}
      />
    </div>
  );
}