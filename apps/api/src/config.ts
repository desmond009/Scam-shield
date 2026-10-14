import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  ML_URL: z.string().default("http://localhost:8000"),
  JWT_SECRET: z.string().min(32),
  CHECK_TOKEN_SECRET: z.string().min(32),
  LOG_LEVEL: z.string().default("info"),
  RATE_LIMIT_CHECK_PER_MIN: z.coerce.number().default(120),
  RATE_LIMIT_AUTH_PER_MIN: z.coerce.number().default(20),
  ML_TIMEOUT_MS: z.coerce.number().default(150),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  /** Cookies need Secure=false on plain-http localhost. */
  COOKIE_SECURE: z.enum(["true", "false"]).default("false"),
});

export const config = envSchema.parse(process.env);
export type Config = typeof config;
