import { logger } from "@/lib/logger";

interface QueueTask<T> {
  id: string;
  fn: () => Promise<T>;
  fallbackFn?: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: any) => void;
  queuedAt: number;
}

export class SmartAIQueue {
  private queue: Array<QueueTask<any>> = [];
  private isProcessing = false;

  // Rate-limiting configuration for Groq
  // 26 requests per 60 seconds gives a safe margin below Groq's 30 RPM limit
  private maxRequestsPerMinute = 26;
  private minIntervalMs = 2200; // at least 2.2s between consecutive Groq dispatches
  private maxQueueDepthBeforeOverflow = 4; // if 4+ queries are queued, overflow immediately to fallback!

  private recentRequestTimestamps: number[] = [];
  private lastDispatchTime = 0;

  // Real-time telemetry
  private totalProcessed = 0;
  private totalOverflowed = 0;

  constructor() {}

  /**
   * Enqueue an AI request.
   * If the queue is already backed up beyond maxQueueDepthBeforeOverflow,
   * immediately bypass the queue and run fallbackFn (OpenRouter) to avoid user wait!
   */
  async enqueue<T>(
    taskFn: () => Promise<T>,
    fallbackFn?: () => Promise<T>,
    taskName = "ai-request"
  ): Promise<T> {
    // Clean old timestamps (> 60s)
    const now = Date.now();
    this.cleanOldTimestamps(now);

    // 1. SMART OVERFLOW: If the queue is congested and a fallback is available, run fallback immediately!
    if (this.queue.length >= this.maxQueueDepthBeforeOverflow && fallbackFn) {
      this.totalOverflowed++;
      logger.warn(
        `[SmartAIQueue] Queue congested (${this.queue.length} tasks). Instant overflow to fallback for ${taskName}.`
      );
      try {
        return await fallbackFn();
      } catch (fbErr) {
        logger.error(`[SmartAIQueue] Fallback failed during overflow, queuing back to Groq:`, fbErr);
        // If fallback failed, continue below and enqueue into standard queue
      }
    }

    // 2. Standard FIFO Queue execution
    return new Promise<T>((resolve, reject) => {
      const task: QueueTask<T> = {
        id: `${taskName}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        fn: taskFn,
        fallbackFn,
        resolve,
        reject,
        queuedAt: Date.now(),
      };

      this.queue.push(task);
      this.processQueue();
    });
  }

  private cleanOldTimestamps(now: number) {
    const oneMinuteAgo = now - 60000;
    while (
      this.recentRequestTimestamps.length > 0 &&
      this.recentRequestTimestamps[0] < oneMinuteAgo
    ) {
      this.recentRequestTimestamps.shift();
    }
  }

  private async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      this.cleanOldTimestamps(now);

      // Check Rate Limit 1: Requests per minute window
      if (this.recentRequestTimestamps.length >= this.maxRequestsPerMinute) {
        const oldestInWindow = this.recentRequestTimestamps[0];
        const waitMs = Math.max(50, 60000 - (now - oldestInWindow) + 100);
        logger.info(
          `[SmartAIQueue] Rate limit reached (${this.recentRequestTimestamps.length}/min). Throttling for ${waitMs}ms...`
        );
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      // Check Rate Limit 2: Minimum pacing between dispatches
      const timeSinceLastDispatch = now - this.lastDispatchTime;
      if (timeSinceLastDispatch < this.minIntervalMs) {
        const paceDelay = this.minIntervalMs - timeSinceLastDispatch;
        await new Promise((r) => setTimeout(r, paceDelay));
      }

      const task = this.queue.shift();
      if (!task) break;

      // Update timestamps
      const dispatchTime = Date.now();
      this.lastDispatchTime = dispatchTime;
      this.recentRequestTimestamps.push(dispatchTime);
      this.totalProcessed++;

      const waitDuration = dispatchTime - task.queuedAt;
      if (waitDuration > 1000) {
        logger.info(`[SmartAIQueue] Executing ${task.id} (waited ${waitDuration}ms in queue).`);
      }

      // Execute task asynchronously without blocking next iterations
      (async () => {
        try {
          const result = await task.fn();
          task.resolve(result);
        } catch (err: any) {
          const errMsg = String(err?.message || err).toLowerCase();
          const isRateLimit = errMsg.includes("429") || errMsg.includes("rate limit");

          if (isRateLimit && task.fallbackFn) {
            logger.warn(`[SmartAIQueue] Task ${task.id} hit 429 despite queue. Executing fallback immediately...`);
            try {
              const fbResult = await task.fallbackFn();
              task.resolve(fbResult);
              return;
            } catch (fbErr) {
              task.reject(fbErr);
              return;
            }
          }
          task.reject(err);
        }
      })();
    }

    this.isProcessing = false;
  }

  /**
   * Telemetry stats for observability
   */
  getStats() {
    this.cleanOldTimestamps(Date.now());
    return {
      queueDepth: this.queue.length,
      isProcessing: this.isProcessing,
      requestsInLastMinute: this.recentRequestTimestamps.length,
      maxAllowedPerMinute: this.maxRequestsPerMinute,
      totalProcessed: this.totalProcessed,
      totalOverflowed: this.totalOverflowed,
    };
  }
}

// Singleton queue instance shared across all chat requests
export const globalAIQueue = new SmartAIQueue();
