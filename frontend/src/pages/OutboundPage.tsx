import PageHeader from "../components/common/PageHeader";
import ComingSoonCard from "../components/common/ComingSoonCard";

export default function OutboundPage() {
  return (
    <div>
      <PageHeader title="Outbound" subtitle="Track payload generation, dispatch, retries, and acknowledgements." />
      <ComingSoonCard
        title="Outbound Module"
        points={["Outbound queue", "Retry failed sends", "Download transformed payload"]}
      />
    </div>
  );
}