import { execSync } from "node:child_process";
import { TEST_ENV } from "./env";

/** Recreates the test database from the Prisma migrations before the suite runs. */
export default function setup() {
  execSync("npx prisma migrate reset --force --skip-seed --skip-generate", {
    env: { ...process.env, DATABASE_URL: TEST_ENV.DATABASE_URL },
    stdio: "pipe",
  });
}
