import { createHash } from "node:crypto";
import { badRequest, conflict, HttpError } from "./errors";
import { keys, TTL } from "./keys";
import { redis } from "./redis";

interface Stored {
  state: "pending" | "done";
  hash: string;
  status?: number;
  body?: unknown;
}

export interface IdempotentResult<T> {
  status: number;
  body: T;
  replayed: boolean;
}

const KEY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;

/**
 * Runs fn at most once per (user, Idempotency-Key). A retry with the same key and body gets the stored response;
 * the same key with a different body is rejected; a concurrent duplicate gets 409 while the first is in flight.
 */
export async function withIdempotency<T>(
  userId: string,
  key: string | undefined,
  requestBody: unknown,
  fn: () => Promise<{ status: number; body: T }>,
): Promise<IdempotentResult<T>> {
  if (key === undefined) return { ...(await fn()), replayed: false };
  if (!KEY_PATTERN.test(key)) throw badRequest("Idempotency-Key must be 8-100 characters: letters, digits, - or _");
  const redisKey = keys.idempotency(userId, key);
  const hash = createHash("sha256").update(JSON.stringify(requestBody)).digest("hex");
  const pending: Stored = { state: "pending", hash };
  const claimed = await redis.set(redisKey, JSON.stringify(pending), "EX", TTL.idempotencySeconds, "NX");
  if (!claimed) {
    const existing = JSON.parse((await redis.get(redisKey)) ?? "null") as Stored | null;
    if (!existing) return withIdempotency(userId, key, requestBody, fn);
    if (existing.hash !== hash) throw new HttpError(422, "IDEMPOTENCY_MISMATCH", "This Idempotency-Key was used for a different request");
    if (existing.state === "pending") throw conflict("A request with this Idempotency-Key is still being processed");
    return { status: existing.status ?? 200, body: existing.body as T, replayed: true };
  }
  try {
    const result = await fn();
    const done: Stored = { state: "done", hash, status: result.status, body: result.body };
    await redis.set(redisKey, JSON.stringify(done), "EX", TTL.idempotencySeconds);
    return { ...result, replayed: false };
  } catch (err) {
    await redis.del(redisKey);
    throw err;
  }
}
