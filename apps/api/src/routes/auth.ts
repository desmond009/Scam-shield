import { loginSchema, registerSchema } from "@scamshield/shared";
import { Router } from "express";
import { deviceHash } from "../lib/device";
import { parseBody } from "../lib/validate";
import { currentUser, requireAuth, SESSION_COOKIE, setSessionCookie, signSession } from "../middleware/auth";
import { authLimiter } from "../middleware/rateLimit";
import { getMe, login, register } from "../services/auth.service";

export const authRouter = Router();

authRouter.post("/register", authLimiter, async (req, res) => {
  const user = await register(parseBody(registerSchema, req), deviceHash(req));
  setSessionCookie(res, signSession(user));
  res.status(201).json({ user });
});

authRouter.post("/login", authLimiter, async (req, res) => {
  const user = await login(parseBody(loginSchema, req));
  const token = signSession(user);
  setSessionCookie(res, token);
  // The token is also returned for API clients (Swagger, load tests); the browser relies on the httpOnly cookie.
  res.json({ user, token });
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.status(204).end();
});

authRouter.get("/me", requireAuth, async (req, res) => {
  res.json({ user: await getMe(currentUser(req).id) });
});
