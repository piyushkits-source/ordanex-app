import PageHeader from "../components/common/PageHeader";
import ComingSoonCard from "../components/common/ComingSoonCard";

export default function BusinessRulesPage() {
  return (
    <div>
      <PageHeader title="Business Rules" subtitle="Manage duplicate checks, date rules, split rules, and overrides." />
      <ComingSoonCard
        title="Business Rules Module"
        points={["Rule priorities", "Client-specific policies", "Activation and testing"]}
      />
    </div>
  );
}