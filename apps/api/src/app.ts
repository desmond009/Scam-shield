import { randomUUID } from "node:crypto";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { config } from "./config";
import { logger } from "./lib/logger";
import { healthRouter } from "./routes/health";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
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
      autoLogging: { ignore: (req) => req.url === "/health" },
    }),
  );
  app.use(healthRouter);
  return app;
}
