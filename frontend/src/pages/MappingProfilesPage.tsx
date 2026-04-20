import PageHeader from "../components/common/PageHeader";
import ComingSoonCard from "../components/common/ComingSoonCard";

export default function MappingProfilesPage() {
  return (
    <div>
      <PageHeader title="Mapping Profiles" subtitle="Maintain source-to-ERP field mapping profiles." />
      <ComingSoonCard
        title="Mapping Profiles Module"
        points={["Profile list", "Priority and activation", "Clone and version mappings"]}
      />
    </div>
  );
}