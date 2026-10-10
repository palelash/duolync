import { config } from "dotenv";
import { validateYouTubeMaintenanceStartup } from "../lib/youtube-maintenance-config";
import { executeYouTubeMaintenance } from "../lib/youtube-maintenance-runner";

config({ quiet: true });
async function main() {
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  try {
    process.exitCode = await executeYouTubeMaintenance({
      log: message => console.log(message), error: message => console.error(message),
      initialize: async () => {
        const settings = validateYouTubeMaintenanceStartup();
        // Stop claims at runLimitMs; allow two minutes for final bounded work
        // and shutdown. Hard stop covers a stalled database too.
        watchdog = setTimeout(() => {
          console.error("YouTube maintenance hard run deadline exceeded.");
          process.exit(1);
        }, settings.runLimitMs + 120000);
        const database = await import("../lib/db");
        return { close: database.closeDatabase, run: async () => {
          const { runYouTubeMaintenance } = await import("../lib/youtube-maintenance");
          return runYouTubeMaintenance(settings);
        } };
      },
    });
  } finally { if (watchdog) clearTimeout(watchdog); }
}
void main();
