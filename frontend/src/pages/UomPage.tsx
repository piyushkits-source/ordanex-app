import PageHeader from "../components/common/PageHeader";
import ComingSoonCard from "../components/common/ComingSoonCard";

export default function UomPage() {
  return (
    <div>
      <PageHeader title="UOM" subtitle="Maintain unit-of-measure conversion setups." />
      <ComingSoonCard
        title="UOM Module"
        points={["Conversion rules", "Bulk upload template", "Material-specific overrides"]}
      />
    </div>
  );
}