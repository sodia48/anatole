import { redirect } from "next/navigation";

export default function LegacyComptePage() {
  redirect("/parametres?section=account");
}
