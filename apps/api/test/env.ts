/** Test environment: a separate database and Redis DB, and a local ML stub, so tests never touch demo data. */
export const TEST_ENV = {
  NODE_ENV: "test",
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://scamshield:scamshield_dev_pw@localhost:5433/scamshield_test",
  REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://localhost:6380/1",
  ML_URL: "http://127.0.0.1:4999",
  ML_STUB_PORT: "4999",
  JWT_SECRET: "test-jwt-secret-that-is-at-least-32-characters",
  CHECK_TOKEN_SECRET: "test-check-token-secret-at-least-32-characters",
  RATE_LIMIT_AUTH_PER_MIN: "10000",
  RATE_LIMIT_CHECK_PER_MIN: "10000",
  ML_TIMEOUT_MS: "150",
};
