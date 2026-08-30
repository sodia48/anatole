import { Redirect, useLocalSearchParams } from "expo-router";

export default function FocusDeepLink() {
  const { ticker } = useLocalSearchParams<{ ticker: string }>();
  return <Redirect href={{ pathname: "/stock/[ticker]", params: { ticker: String(ticker ?? "RY") } }} />;
}
