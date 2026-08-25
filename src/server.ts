import { type Server, createServer } from "node:http";
import app from "./app.ts";
import { env } from "./config/env.ts";

async function init() {
  try {
    const port = Number(env.PORT ?? 3000);
    const shutdownTimeout = 10_000;

    const server: Server | undefined = createServer(app);
    let isShuttingDown = false;

    const closeServer = async (exitCode: number) => {
      if (isShuttingDown) {
        return;
      }

      isShuttingDown = true;

      const forceShutdownTimer = setTimeout(() => {
        console.error("Graceful shutdown timed out.");
        process.exit(exitCode);
      }, shutdownTimeout);

      forceShutdownTimer.unref();

      if (!server) {
        clearTimeout(forceShutdownTimer);
        process.exit(exitCode);
      }

      const activeServer = server;

      activeServer.close((error) => {
        clearTimeout(forceShutdownTimer);

        if (error) {
          console.error("Failed to close the HTTP server gracefully.", error);
          process.exit(1);
        }

        console.log("HTTP server closed.");
        process.exit(exitCode);
      });
    };

    const handleSignal = (signal: NodeJS.Signals) => {
      console.log(`${signal} received. Starting graceful shutdown.`);
      void closeServer(0);
    };

    process.on("SIGINT", handleSignal);
    process.on("SIGTERM", handleSignal);

    process.on("uncaughtException", (error) => {
      console.error("Uncaught exception.", error);
      void closeServer(1);
    });

    process.on("unhandledRejection", (reason) => {
      console.error("Unhandled promise rejection.", reason);
      void closeServer(1);
    });

    server.listen(port, () => {
      console.log(`Server is running on port ${port}.`);
    });

    server.on("error", (error) => {
      console.error("HTTP server error.", error);
      void closeServer(1);
    });

  } catch (error) {
    process.exit(1)
  }
}

init();