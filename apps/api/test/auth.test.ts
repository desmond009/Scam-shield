import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { failedAttempts } from "../src/services/redisState";
import { app, authed, createUser, mlStub, PASSWORD, resetState, tokenFor } from "./helpers";

describe("auth and RBAC", () => {
  beforeAll(() => mlStub.start());
  afterAll(() => mlStub.stop());
  beforeEach(resetState);

  it("registers with an httpOnly session cookie and a synthetic starting balance", async () => {
    const email = `new${Date.now()}@test.local`;
    const res = await request(app).post("/api/auth/register").send({ name: "New Person", email, password: "longenough1" });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email, role: "USER", balance: 25_000 });
    expect(res.body.user.passwordHash).toBeUndefined();
    const cookie = res.headers["set-cookie"][0];
    expect(cookie).toMatch(/ss_session=/);
    expect(cookie).toMatch(/HttpOnly/);
    const me = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(me.body.user.email).toBe(email);
    expect((await request(app).post("/api/auth/register").send({ name: "Again", email, password: "longenough1" })).status).toBe(409);
  });

  it("rejects bad credentials with a generic message and counts the failure", async () => {
    const user = await createUser();
    const res = await request(app).post("/api/auth/login").send({ email: user.email, password: "wrong-password" });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Incorrect email or password");
    expect(await failedAttempts(user.id, Date.now())).toBe(1);
    expect((await request(app).post("/api/auth/login").send({ email: "nobody@test.local", password: PASSWORD })).status).toBe(401);
  });

  it("validates input", async () => {
    const res = await request(app).post("/api/auth/register").send({ name: "x", email: "not-an-email", password: "short" });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.details.fieldErrors)).toEqual(["name", "email", "password"]);
  });

  it("enforces roles: USER < ANALYST < ADMIN", async () => {
    const [user, analyst, admin] = await Promise.all([createUser(), createUser({ role: "ANALYST" }), createUser({ role: "ADMIN" })]);
    const [u, a, ad] = await Promise.all([tokenFor(user.email), tokenFor(analyst.email), tokenFor(admin.email)]);
    expect((await authed(u).get("/api/alerts")).status).toBe(403);
    expect((await authed(a).get("/api/alerts")).status).toBe(200);
    expect((await authed(a).get("/api/admin/thresholds")).status).toBe(403);
    expect((await authed(ad).get("/api/admin/thresholds")).status).toBe(200);
    expect((await authed(ad).get("/api/alerts")).status).toBe(200);
    expect((await request(app).get("/api/wallet")).status).toBe(401);
    expect((await request(app).get("/api/wallet").set("authorization", "Bearer forged.token.here")).status).toBe(401);
  });
});
