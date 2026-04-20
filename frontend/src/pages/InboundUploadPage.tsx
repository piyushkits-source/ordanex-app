import PageHeader from "../components/common/PageHeader";
import ComingSoonCard from "../components/common/ComingSoonCard";

export default function InboundUploadPage() {
  return (
    <div>
      <PageHeader title="Inbound Upload" subtitle="Manual upload channel for customer files and test samples." />
      <ComingSoonCard
        title="Inbound Upload Module"
        points={["Drag and drop upload", "Client selection", "Job creation and tracking"]}
      />
    </div>
  );
}