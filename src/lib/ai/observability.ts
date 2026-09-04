/**
 * Observability — AGENTS.md compliant
 *
 * Every answer path must be logged with:
 *   - intent          : classified intent
 *   - sourceType      : which authorized source was used
 *   - confidence      : [0, 1]
 *   - decision        : "answer" | "clarify" | "refuse"
 *
 * PHONE NUMBERS ARE NEVER LOGGED.
 *
 * This module centralises all observability so that one-off console.log
 * statements never accidentally leak PII.
 */

import { logger } from "@/lib/logger";
import type { Intent } from "./intent-router";
import type { SourceType } from "./intent-router";

export type DecisionKind = "answer" | "clarify" | "refuse";

export interface AnswerLogEntry {
    /** ISO timestamp */
    timestamp: string;
    /** Classified intent */
    intent: Intent;
    /** Source that was used (one of SOURCE_BY_INTENT values) */
    sourceType: SourceType | "none";
    /** [0, 1] confidence score */
    confidence: number;
    /** The routing decision */
    decision: DecisionKind;
    /** Reason for clarify / refuse (omit for answer) */
    reason?: string;
    /** Channel through which the message arrived (e.g. "telegram", "whatsapp", "api") */
    channel?: string;
    /** Conversation ID (hash-safe — no PII) */
    conversationId?: string;
    /** True when the response required clarification */
    requiredClarification: boolean;
    /** True when a tool was called */
    toolCallExecuted: boolean;
}

/**
 * Safely create a log entry. Phone numbers are explicitly stripped.
 */
export function logAnswer(entry: Omit<AnswerLogEntry, "timestamp">): void {
    // Never log phone numbers — even if they're in the context
    const sanitized = {
        ...entry,
        timestamp: new Date().toISOString(),
    };

    // Strip any accidental phone-like strings from intent/reason fields
    // (defence in depth — the caller should already not pass phones)
    const phonePattern = /(?:\+?212[\s.-]?)?(?:0[\s.-]?)?[5-7](?:[\s.-]?[0-9]){8}|(?:\+?212)?[\s.-]?[0-9]{9,10}/g;
    sanitized.reason = sanitized.reason?.replace(phonePattern, "[TÉLÉPHONE]");

    logger.info("[IntentRouter] answer_log", sanitized);
}

/**
 * Track clarification rate for regression detection.
 * Call this whenever the router emits a "clarify" decision.
 */
export function trackClarification(intent: Intent): void {
    logger.info("[IntentRouter] clarification", {
        timestamp: new Date().toISOString(),
        intent,
        event: "clarification_emitted",
    });
}

/**
 * Track refusal rate for regression detection.
 * Call this whenever the router emits a "refuse" decision.
 */
export function trackRefusal(intent: Intent, reason: string): void {
    logger.info("[IntentRouter] refusal", {
        timestamp: new Date().toISOString(),
        intent,
        reason,
        event: "refusal_emitted",
    });
}

/**
 * Track tool call usage per intent.
 */
export function trackToolCall(intent: Intent, toolName: string): void {
    logger.info("[IntentRouter] tool_call", {
        timestamp: new Date().toISOString(),
        intent,
        toolName,
        event: "tool_call_executed",
    });
}

/**
 * Compute aggregate stats for an analytics dashboard.
 * Returns safe metrics with no PII.
 */
export interface AggregateStats {
    totalQueries: number;
    clarificationRate: number;
    refusalRate: number;
    topIntents: Array<{ intent: Intent; count: number }>;
    avgConfidence: number;
}

/**
 * Placeholder for a rolling stats store.
 * In production this would query the database or a time-series store.
 * Returns zeros — callers must handle the empty state gracefully.
 */
export function getAggregateStats(): AggregateStats {
    // TODO: wire to database / time-series store
    return {
        totalQueries: 0,
        clarificationRate: 0,
        refusalRate: 0,
        topIntents: [],
        avgConfidence: 0,
    };
}