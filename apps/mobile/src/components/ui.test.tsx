import { render } from "@testing-library/react-native";

import { QueryState } from "./ui";

jest.mock("@/src/lib/i18n", () => ({
  useLocale: () => ({ t: (key: string) => key }),
}));

describe("QueryState", () => {
  it.each([
    Object.assign(new Error("aborted"), { name: "AbortError" }),
    Object.assign(new Error("CancelledError"), { name: "CancelledError" }),
    Object.assign(new Error("Fetch request has been canceled (NativeResponse.swift: 42)"), { name: "FetchRequestCanceledException" }),
  ])("does not render lifecycle cancellation as a user error", async (error) => {
    const view = await render(<QueryState error={error} loading={false} onRetry={jest.fn()} />);
    expect(view.queryByText(/AbortError|FetchRequestCanceledException|NativeResponse\.swift|canceled/i)).toBeNull();
    expect(view.queryByText("retry")).toBeNull();
    await view.unmount();
  });

  it("keeps a real API timeout visible", async () => {
    const error = new Error("La requête a expiré.");
    const view = await render(<QueryState error={error} loading={false} />);
    expect(view.getByText("La requête a expiré.")).toBeTruthy();
    await view.unmount();
  });
});
