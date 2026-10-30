import { OptionsClient } from "@/components/options/OptionsClient";
import { Suspense } from "react";

export default function OptionsPage() {
  return <Suspense fallback={<p>Chargement des options…</p>}><OptionsClient /></Suspense>;
}
