import { createHash } from "node:crypto";
import type { Request } from "express";

/** Hashes the client-generated device id (or the user agent as a fallback); raw identifiers are never stored. */
export function deviceHash(req: Request): string {
  const raw = (req.headers["x-device-id"] as string | undefined) || `ua:${req.headers["user-agent"] ?? "unknown"}`;
  return hashDeviceId(raw);
}

/** Hash for a raw device id (used by the seed so demo accounts are bound to a known simulated phone). */
export function hashDeviceId(raw: string): string {
  return createHash("sha256").update(raw.slice(0, 200)).digest("hex").slice(0, 32);
}
