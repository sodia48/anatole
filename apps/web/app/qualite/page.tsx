import { redirect } from "next/navigation";

export default function LegacyQualitePage() {
  redirect("/parametres?section=quality");
}
