import { OptionsClient } from "@/components/options/OptionsClient";
import { OptionsCopyProvider } from "@/components/options/OptionsCopyProvider";
import { optionsCopy } from "./options-copy";
import { Suspense } from "react";

export default function OptionsPage() {
  return <OptionsCopyProvider copy={optionsCopy}><Suspense fallback={<p>Chargement des options…</p>}><OptionsClient /></Suspense></OptionsCopyProvider>;
}
