import { logger } from "@/lib/logger";

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
const INITIAL_WARMUP_DELAY_MS = 3 * 60 * 1000; // 3 minutes after boot

let isSyncInProgress = false;
let syncIntervalHandle: NodeJS.Timeout | null = null;
let initialTimeoutHandle: NodeJS.Timeout | null = null;

/**
 * Executes a full synchronization cycle across MEN (men.gov.ma) and FNE (taalim.org).
 */
export async function runFullSyncCycle(): Promise<{
  men?: { imported: number; skippedIrrelevant: number; skippedExisting: number };
  taalim?: { imported: number; skipped: number };
  error?: string;
}> {
  if (isSyncInProgress) {
    logger.warn("[AutoSync] Sync cycle already in progress — skipping concurrent trigger");
    return { error: "Sync in progress" };
  }

  isSyncInProgress = true;
  logger.info("[AutoSync] Starting scheduled 48h sync cycle for men.gov.ma and taalim.org...");

  const results: {
    men?: { imported: number; skippedIrrelevant: number; skippedExisting: number };
    taalim?: { imported: number; skipped: number };
    error?: string;
  } = {};

  try {
    // 1. Synchronize official MEN circulars & news
    try {
      const { executeMenSync } = await import("@/app/api/knowledge/sync-men/route");
      const menRes = await executeMenSync({ mode: "auto", limit: 30 });
      results.men = {
        imported: menRes.imported,
        skippedIrrelevant: menRes.skippedIrrelevant,
        skippedExisting: menRes.skippedExisting,
      };
      logger.info("[AutoSync] MEN sync completed:", results.men);
    } catch (menErr) {
      logger.error("[AutoSync] MEN sync step failed:", {
        error: menErr instanceof Error ? menErr.message : String(menErr),
      });
    }

    // 2. Synchronize FNE union articles & positions from taalim.org
    try {
      const { executeTaalimSync } = await import("@/app/api/knowledge/sync-feed/route");
      const taalimRes = await executeTaalimSync({ page: 1, perPage: 30 });
      results.taalim = {
        imported: taalimRes.imported,
        skipped: taalimRes.skipped,
      };
      logger.info("[AutoSync] Taalim.org sync completed:", results.taalim);
    } catch (taalimErr) {
      logger.error("[AutoSync] Taalim.org sync step failed:", {
        error: taalimErr instanceof Error ? taalimErr.message : String(taalimErr),
      });
    }

    logger.info("[AutoSync] Full sync cycle finished successfully");
  } catch (err) {
    logger.error("[AutoSync] Critical error during sync cycle:", {
      error: err instanceof Error ? err.message : String(err),
    });
    results.error = err instanceof Error ? err.message : String(err);
  } finally {
    isSyncInProgress = false;
  }

  return results;
}

/**
 * Initializes the recurring 48-hour background sync timer.
 * Called once during server startup from instrumentation.ts.
 */
export function startAutoSyncScheduler(): void {
  if (syncIntervalHandle || initialTimeoutHandle) {
    logger.info("[AutoSync] Scheduler already active — ignoring duplicate init");
    return;
  }

  logger.info(
    `[AutoSync] Initializing 48-hour sync scheduler (Initial warmup in ${INITIAL_WARMUP_DELAY_MS / 1000}s, recurring every 48h)`
  );

  // Initial warmup run
  initialTimeoutHandle = setTimeout(async () => {
    initialTimeoutHandle = null;
    try {
      await runFullSyncCycle();
    } catch (err) {
      logger.error("[AutoSync] Initial warmup sync failed:", { error: String(err) });
    }
  }, INITIAL_WARMUP_DELAY_MS);

  // Recurring 48-hour timer
  syncIntervalHandle = setInterval(async () => {
    try {
      await runFullSyncCycle();
    } catch (err) {
      logger.error("[AutoSync] Recurring 48h sync failed:", { error: String(err) });
    }
  }, FORTY_EIGHT_HOURS_MS);
}
