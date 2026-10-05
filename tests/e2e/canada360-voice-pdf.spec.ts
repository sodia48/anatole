import { expect, test } from "@playwright/test";

function pdfWithText(text: string): Buffer {
  const content = `BT /F1 12 Tf 20 250 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let output = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(output));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    output += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output, "ascii");
}

test("Canada 360 accepte un PDF lisible avec consentement explicite", async ({ page, isMobile }) => {
  test.setTimeout(90_000);
  await page.goto("/canada", { waitUntil: "domcontentloaded" });
  const frame = page.frameLocator('[data-testid="canada360-assistant-frame"]');
  await frame.getByRole("button", { name: "Outils et PDF" }).click();
  await frame.getByLabel("Question à Canada 360").fill("Explique-moi cette lettre de l'ARC.");
  await frame.locator('input[name="pdf"]').setInputFiles({
    name: "lettre-arc.pdf",
    mimeType: "application/pdf",
    buffer: pdfWithText("CRA notice: check payment date."),
  });
  await frame.getByRole("button", { name: "Envoyer" }).click();
  await expect(frame.locator(".message.error")).toContainText(
    "Confirme l’avertissement sur les données sensibles",
  );
  await expect(frame.getByTestId("canada360-assistant-chat")).not.toContainText(
    "Explique-moi cette lettre de l'ARC.",
  );
  if (await frame.locator('#tools-panel').isHidden()) {
    await frame.getByRole("button", { name: "Outils et PDF" }).click();
  }
  await frame.getByLabel("Question à Canada 360").fill("Explique-moi cette lettre de l'ARC.");
  await frame.locator('input[name="pdf"]').setInputFiles({
    name: "lettre-arc.pdf",
    mimeType: "application/pdf",
    buffer: pdfWithText("CRA notice: check payment date."),
  });
  await frame.locator('input[name="document_consent"]').check();
  if (isMobile) {
    await frame.getByLabel("Question à Canada 360").evaluate(
      (element) => (element as HTMLTextAreaElement).blur(),
    );
  }
  await frame.getByRole("button", { name: "Envoyer" }).click();
  await expect(frame.getByTestId("canada360-assistant-chat")).toContainText(
    "Explique-moi cette lettre de l'ARC.",
  );
  await expect(frame.getByTestId("canada360-assistant-chat")).not.toContainText("PDF invalide");
  await expect(frame.locator("body")).not.toContainText("CRA notice: check payment date.");
});

test("Canada 360 permet la dictée sans envoyer automatiquement", async ({ page }) => {
  await page.addInitScript(() => {
    const FakeRecognition = class {
        onresult: ((event: { results: { transcript: string }[][] }) => void) | null = null;
        onend: (() => void) | null = null;
        start() {
          this.onresult?.({ results: [[{ transcript: "Quels services existent au Canada ?" }]] });
          this.onend?.();
        }
        stop() { this.onend?.(); }
      };
    for (const name of ["SpeechRecognition", "webkitSpeechRecognition"]) {
      Object.defineProperty(window, name, {
        configurable: true,
        value: FakeRecognition,
      });
    }
  });
  await page.goto("/canada", { waitUntil: "domcontentloaded" });
  const frame = page.frameLocator('[data-testid="canada360-assistant-frame"]');
  await frame.getByRole("button", { name: "Dicter" }).click();
  await expect(frame.getByLabel("Question à Canada 360")).toHaveValue(
    "Quels services existent au Canada ?",
  );
  await expect(frame.getByTestId("canada360-assistant-chat")).not.toContainText(
    "Quels services existent au Canada ?",
  );
});
