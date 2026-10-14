#!/usr/bin/env node
/**
 * Regenerates docs/screenshots/*.png from a running stack (`make demo`). Uses Playwright's Chromium.
 * Usage: node scripts/screenshots.mjs [--url http://localhost:3000]
 * Note: it creates real (synthetic) payments, alerts and simulator runs in the demo database.
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const URL_ = process.argv.includes("--url") ? process.argv[process.argv.indexOf("--url") + 1] : "http://localhost:3000";
const OUT = new URL("../docs/screenshots/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: "chromium" });

async function session(user, { viewport = { width: 1280, height: 860 }, scheme = "light" } = {}) {
  const ctx = await browser.newContext({ viewport, colorScheme: scheme, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.addInitScript((u) => localStorage.setItem("ss_device_id", `demo-phone-${u}`), user);
  const res = await page.request.post(`${URL_}/api/auth/login`, { data: { email: `${user}@demo.scamshield.in`, password: "Demo@1234" } });
  if (!res.ok()) throw new Error(`login ${user} failed: ${res.status()}`);
  return page;
}

const shot = (page, name, fullPage = true) => page.screenshot({ path: `${OUT}${name}.png`, fullPage });

async function pay(page, upi, amount) {
  await page.goto(`${URL_}/send`);
  await page.getByLabel("Recipient's UPI ID").fill(upi);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Amount").fill(String(amount));
  await page.getByRole("button", { name: /Check & pay/ }).click();
  await page.waitForTimeout(2500);
}

const fresh = (prefix) => `${prefix}${Date.now() % 100000}@ybl`;

const landing = await browser.newPage({ viewport: { width: 1280, height: 860 } });
await landing.goto(URL_);
await landing.waitForLoadState("networkidle");
await shot(landing, "landing", false);

const asha = await session("asha");
await asha.goto(`${URL_}/wallet`);
await asha.waitForTimeout(2000);
await shot(asha, "wallet", false);
await pay(asha, fresh("gift.voucher.desk"), 2999);
await shot(asha, "send-medium");

const mobile = await session("asha", { viewport: { width: 390, height: 844 }, scheme: "dark" });
await pay(mobile, fresh("kyc.verify.desk"), 9999);
await shot(mobile, "send-high-risk-mobile-dark", false);
await pay(asha, fresh("refund.helpline"), 9999);
await shot(asha, "send-high-risk", false);

const admin = await session("admin");
await admin.goto(`${URL_}/admin/simulator`);
await admin.waitForTimeout(1500);
await admin.getByRole("button", { name: /^Run/ }).nth(2).click(); // Mule collection
await admin.waitForTimeout(6000);
await shot(admin, "simulator");
for (const [path, name] of [["/admin/model", "model-evaluation"], ["/admin/rules", "rules"], ["/admin/health", "health"]]) {
  await admin.goto(URL_ + path);
  await admin.waitForTimeout(3500);
  await shot(admin, name);
}

const ravi = await session("ravi");
await ravi.goto(`${URL_}/analyst`);
await ravi.waitForTimeout(2000);
await ravi.getByText(/Victim 8 \(sim\)/).first().click();
await ravi.waitForTimeout(2500);
await shot(ravi, "analyst", false);

await browser.close();
console.log(`screenshots written to ${OUT}`);
