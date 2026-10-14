import type { Role } from "@scamshield/shared";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { forbidden, unauthorized } from "../lib/errors";

export const SESSION_COOKIE = "ss_session";
export const SESSION_TTL_SECONDS = 8 * 3600;

export interface AuthUser {
  id: string;
  role: Role;
  name: string;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
  }
}

export function signSession(user: AuthUser): string {
  return jwt.sign({ sub: user.id, role: user.role, name: user.name }, config.JWT_SECRET, {
    expiresIn: SESSION_TTL_SECONDS,
    algorithm: "HS256",
  });
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.COOKIE_SECURE === "true",
    maxAge: SESSION_TTL_SECONDS * 1000,
    path: "/",
  });
}

function readToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return req.cookies?.[SESSION_COOKIE];
}

export const requireAuth: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  const token = readToken(req);
  if (!token) return next(unauthorized());
  try {
    const payload = jwt.verify(token, config.JWT_SECRET, { algorithms: ["HS256"] }) as jwt.JwtPayload;
    req.user = { id: payload.sub as string, role: payload.role as Role, name: payload.name as string };
    next();
  } catch {
    next(unauthorized("Your session has expired. Please sign in again."));
  }
};

/** RBAC: ADMIN implicitly has every role. */
export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (req.user.role === "ADMIN" || roles.includes(req.user.role)) return next();
    next(forbidden());
  };

export const currentUser = (req: Request): AuthUser => {
  if (!req.user) throw unauthorized();
  return req.user;
};
