import { redirect } from "next/navigation";

export default function LegacyPreferencesPage() {
  redirect("/parametres?section=preferences");
}
