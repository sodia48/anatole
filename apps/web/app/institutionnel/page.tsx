import { InstitutionalHub } from "@/components/institutional/InstitutionalHub";
import {
  INSTITUTIONAL_AREAS,
  INSTITUTIONAL_CAPABILITIES,
} from "@/lib/institutional-capabilities";

export default function InstitutionalPage() {
  return (
    <InstitutionalHub
      areas={INSTITUTIONAL_AREAS}
      capabilities={INSTITUTIONAL_CAPABILITIES}
    />
  );
}
