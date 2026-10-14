import { expect, test, type Page } from "@playwright/test";

async function signInAsAsha(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /Asha Verma/ }).click();
  await expect(page).toHaveURL(/\/wallet/);
  await expect(page.getByText("Available balance")).toBeVisible();
}

async function startPayment(page: Page, upi: string, amount: string) {
  await page.getByRole("link", { name: "Send money" }).first().click();
  await page.getByLabel("Recipient's UPI ID").fill(upi);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Amount").fill(amount);
  await page.getByRole("button", { name: /Check & pay/ }).click();
}

test("a normal payment to a known shop goes through instantly", async ({ page }) => {
  await signInAsAsha(page);
  await startPayment(page, "kirana.sharma@okaxis", "240");
  await expect(page.getByText("₹240 sent")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Risk check: low risk/)).toBeVisible();
  await expect(page.getByText(/New balance/)).toBeVisible();
});

test("a fake KYC payment is stopped with reasons and can be cancelled and reported", async ({ page }) => {
  await signInAsAsha(page);
  // A fresh, never-seen account each run, so earlier runs (reports, analyst verdicts) cannot change the outcome.
  await startPayment(page, `kyc.verify${Date.now() % 1_000_000}@ybl`, "9999");

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Stop. This could be a scam.")).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByText("New recipient.")).toBeVisible();
  // Paying needs the cooldown and the retyped UPI ID; the button stays disabled until both are satisfied.
  await dialog.getByText("I know this person and still want to pay").click();
  await expect(dialog.getByRole("button", { name: "Pay anyway" })).toBeDisabled();

  await dialog.getByRole("button", { name: "Cancel and report this account" }).click();
  await expect(page.getByText("Payment cancelled")).toBeVisible();
  await expect(page.getByText(/No money was sent/)).toBeVisible();
});
