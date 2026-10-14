import { randomUUID } from "node:crypto";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import swaggerUi from "swagger-ui-express";
import { config } from "./config";
import { errorHandler, notFoundHandler } from "./lib/errors";
import { logger } from "./lib/logger";
import { buildOpenApiDocument } from "./lib/openapi";
import { adminRouter } from "./routes/admin";
import { alertsRouter } from "./routes/alerts";
import { authRouter } from "./routes/auth";
import { healthRouter } from "./routes/health";
import { paymentsRouter } from "./routes/payments";
import { walletRouter } from "./routes/wallet";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  // Swagger UI needs inline scripts/styles, so it is mounted before helmet's strict CSP.
  const openApi = buildOpenApiDocument();
  app.get("/openapi.json", (_req, res) => res.json(openApi));
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApi));
  app.use(helmet());
  app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = (req.headers["x-request-id"] as string) || randomUUID();
        res.setHeader("x-request-id", id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === "/health" || req.url === "/ready" },
    }),
  );
  app.use(healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/payments", paymentsRouter);
  app.use("/api/alerts", alertsRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api", walletRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
