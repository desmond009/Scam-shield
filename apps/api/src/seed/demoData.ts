import type { Role } from "@scamshield/shared";

/** Password for every seeded demo account (synthetic accounts only). */
export const DEMO_PASSWORD = "Demo@1234";

export type Persona = "salaried" | "student" | "senior";

export interface DemoUser {
  key: string;
  name: string;
  email: string;
  role: Role;
  upiId: string;
  balance: number;
  persona: Persona;
  /** Raw id of the simulated registered phone; the web app's demo-login buttons send the same id. */
  deviceId: string;
  accountAgeDays: number;
  payees: string[];
}

export interface DemoPayee {
  upiId: string;
  displayName: string;
  ageDays: number;
  reportCount?: number;
  confirmedFraud?: boolean;
}

export const MERCHANTS: DemoPayee[] = [
  { upiId: "kirana.sharma@okaxis", displayName: "Sharma Kirana Store", ageDays: 1400 },
  { upiId: "freshmart@ybl", displayName: "FreshMart Supermarket", ageDays: 1100 },
  { upiId: "chai.point@paytm", displayName: "Chai Point", ageDays: 900 },
  { upiId: "metro.pharmacy@oksbi", displayName: "Metro Pharmacy", ageDays: 1300 },
  { upiId: "power.bill@okaxis", displayName: "City Electricity Board", ageDays: 2000 },
  { upiId: "mobile.recharge@ybl", displayName: "Mobile Recharge", ageDays: 1800 },
  { upiId: "food.delivery@ybl", displayName: "Food Delivery", ageDays: 1500 },
  { upiId: "cab.rides@okaxis", displayName: "Cab Rides", ageDays: 1600 },
  { upiId: "book.world@oksbi", displayName: "Book World", ageDays: 700 },
  { upiId: "city.clinic@okaxis", displayName: "City Clinic", ageDays: 1200 },
  { upiId: "hp.petrol@ibl", displayName: "HP Petrol Pump", ageDays: 1700 },
  { upiId: "fitzone.gym@paytm", displayName: "FitZone Gym", ageDays: 500 },
  { upiId: "rohan.mehta@okaxis", displayName: "Rohan Mehta", ageDays: 900 },
  { upiId: "neha.verma@ybl", displayName: "Neha Verma", ageDays: 1000 },
  { upiId: "kapoor.rent@oksbi", displayName: "Mr. Kapoor (Landlord)", ageDays: 1500 },
];

/** Payees used in the presenter's manual walkthrough (docs/DEMO_SCRIPT.md). */
export const SCAM_PAYEES: DemoPayee[] = [
  { upiId: "kyc.update.desk@ybl", displayName: "KYC Update Desk", ageDays: 2 },
  { upiId: "olx.seller.deals@ybl", displayName: "OLX Seller Deals", ageDays: 20, reportCount: 3 },
  { upiId: "prize.claim.center@paytm", displayName: "Prize Claim Center", ageDays: 9, reportCount: 5, confirmedFraud: true },
];

const everyday = MERCHANTS.slice(0, 12).map((m) => m.upiId);

const user = (u: Omit<DemoUser, "deviceId">): DemoUser => ({ ...u, deviceId: `demo-phone-${u.key}` });

export const DEMO_USERS: DemoUser[] = [
  user({ key: "asha", name: "Asha Verma", email: "asha@demo.scamshield.in", role: "USER", upiId: "asha.verma@okdemo", balance: 52_000, persona: "salaried", accountAgeDays: 700, payees: [...everyday, "rohan.mehta@okaxis", "neha.verma@ybl", "kapoor.rent@oksbi"] }),
  user({ key: "ravi", name: "Ravi Iyer", email: "ravi@demo.scamshield.in", role: "ANALYST", upiId: "ravi.iyer@okdemo", balance: 30_000, persona: "salaried", accountAgeDays: 900, payees: everyday.slice(0, 6) }),
  user({ key: "admin", name: "Admin", email: "admin@demo.scamshield.in", role: "ADMIN", upiId: "admin@okdemo", balance: 10_000, persona: "salaried", accountAgeDays: 1000, payees: everyday.slice(0, 4) }),
  // Simulator personas: each scenario uses its own account so runs are repeatable and easy to explain.
  user({ key: "arjun", name: "Arjun Nair (sim)", email: "arjun@sim.scamshield.in", role: "USER", upiId: "arjun.nair@okdemo", balance: 40_000, persona: "salaried", accountAgeDays: 600, payees: everyday }),
  user({ key: "meera", name: "Meera Pillai (sim, senior)", email: "meera@sim.scamshield.in", role: "USER", upiId: "meera.pillai@okdemo", balance: 180_000, persona: "senior", accountAgeDays: 1200, payees: everyday.slice(0, 7) }),
  user({ key: "karan", name: "Karan Singh (sim, student)", email: "karan@sim.scamshield.in", role: "USER", upiId: "karan.singh@okdemo", balance: 30_000, persona: "student", accountAgeDays: 400, payees: everyday.slice(0, 9) }),
  user({ key: "priya", name: "Priya Das (sim)", email: "priya@sim.scamshield.in", role: "USER", upiId: "priya.das@okdemo", balance: 65_000, persona: "salaried", accountAgeDays: 800, payees: everyday }),
  ...Array.from({ length: 8 }, (_, i) =>
    user({
      key: `victim${i + 1}`,
      name: `Victim ${i + 1} (sim)`,
      email: `victim${i + 1}@sim.scamshield.in`,
      role: "USER",
      upiId: `victim${i + 1}@okdemo`,
      balance: 30_000,
      persona: (["salaried", "student", "senior"] as const)[i % 3],
      accountAgeDays: 300 + i * 40,
      payees: everyday.slice(i % 4, (i % 4) + 7),
    }),
  ),
];

export const PERSONA_HABITS: Record<Persona, { perDay: number; median: number; sigma: number; hours: [number, number] }> = {
  salaried: { perDay: 3, median: 350, sigma: 0.8, hours: [8, 22] },
  student: { perDay: 3, median: 150, sigma: 0.7, hours: [10, 23] },
  senior: { perDay: 1.5, median: 400, sigma: 0.6, hours: [8, 19] },
};

export const demoUser = (key: string) => {
  const u = DEMO_USERS.find((d) => d.key === key);
  if (!u) throw new Error(`Unknown demo user ${key}`);
  return u;
};
