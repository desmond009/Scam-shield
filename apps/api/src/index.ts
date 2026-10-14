import { createApp } from "./app";
import { config } from "./config";
import { logger } from "./lib/logger";

const server = createApp().listen(config.PORT, () => logger.info({ port: config.PORT }, "api listening"));

function shutdown(signal: string) {
  logger.info({ signal }, "shutting down");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
