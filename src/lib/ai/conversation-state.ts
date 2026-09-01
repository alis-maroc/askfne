/**
 * Conversation State Machine — AGENTS.md compliant
 *
 * Five exclusive states. Only one state can be active at any time. A
 * free-form user question ALWAYS clears the current state before being
 * classified by the intent router.
 *
 * Yes/no confirmations (`نعم`) only confirm the action that matches the
 * CURRENT active state.
 *
 * Office clarification never creates a ticket.
 */

export const CONVERSATION_STATE = {
    /** Default state — no pending context. */
    IDLE: "idle",
    /** The bot has shown a main menu and is waiting for a numeric choice. */
    MENU: "menu",
    /** The bot has shown guided-questions for a category and awaits an answer. */
    GUIDED_QUESTION: "guided_question",
    /** The bot is asking for clarification of an ambiguous bureau name. */
    OFFICE_CLARIFICATION: "office_clarification",
    /** The bot is generating a document (PDF, demande, etc). */
    DOCUMENT_GENERATION: "document_generation",
    /** The bot has shown a ticket summary and awaits explicit confirmation. */
    TICKET_CONFIRMATION: "ticket_confirmation",
} as const;

export type ConversationState =
    (typeof CONVERSATION_STATE)[keyof typeof CONVERSATION_STATE];

/**
 * Default expiration time for non-IDLE states.
 * After this many seconds, the state auto-clears to IDLE.
 */
export const STATE_EXPIRY_SECONDS: Record<ConversationState, number | null> = {
    idle: null,
    menu: 600, // 10 minutes
    guided_question: 600,
    office_clarification: 600,
    document_generation: 300, // 5 minutes — documents must be confirmed quickly
    ticket_confirmation: 300,
};

export interface StateContext {
    state: ConversationState;
    /** Timestamp of last activity */
    lastActivity: Date;
    /** State-specific data (e.g. ticket draft, clarification candidates) */
    payload?: Record<string, unknown>;
}

/**
 * Build a fresh state context. Returns the IDLE state by default.
 */
export function createIdleState(): StateContext {
    return { state: CONVERSATION_STATE.IDLE, lastActivity: new Date() };
}

/**
 * Determine whether a state has expired and should be cleared.
 */
export function isStateExpired(
    ctx: StateContext,
    now: Date = new Date()
): boolean {
    const expiry = STATE_EXPIRY_SECONDS[ctx.state];
    if (expiry === null) return false;
    const elapsed = (now.getTime() - ctx.lastActivity.getTime()) / 1000;
    return elapsed > expiry;
}

/**
 * Touch a state — update its lastActivity timestamp.
 */
export function touchState(ctx: StateContext): StateContext {
    return { ...ctx, lastActivity: new Date() };
}

/**
 * CRITICAL GUARD — When a free-form user question arrives, the previous
 * state MUST be cleared before classification runs. This is the rule that
 * prevents the AGENTS.md failure mode where a menu selection or office
 * clarification would leak into an unrelated global question.
 *
 * Returns the cleared state when needed, or the original state if it's
 * still fresh.
 */
export function clearStaleState(
    ctx: StateContext,
    isFreeFormQuestion: boolean,
    now: Date = new Date()
): StateContext {
    if (!isFreeFormQuestion) return touchState(ctx);
    // Free-form questions always clear state, regardless of expiry
    return createIdleState();
}

/**
 * Guard for `نعم` (yes) confirmation.
 *
 * The word "yes" must only confirm the action that matches the CURRENT
 * active state. Without an active TICKET_CONFIRMATION state, "yes" can
 * never create a ticket.
 */
export function isConfirmationForActiveState(
    ctx: StateContext,
    state: ConversationState
): boolean {
    return ctx.state === state && !isStateExpired(ctx);
}

/**
 * Strict rule from AGENTS.md: an OFFICE_CLARIFICATION state may NEVER
 * create a ticket. Use this guard before any ticket creation tool call.
 */
export function canCreateTicketFromState(ctx: StateContext): boolean {
    if (ctx.state === CONVERSATION_STATE.OFFICE_CLARIFICATION) return false;
    return ctx.state === CONVERSATION_STATE.TICKET_CONFIRMATION && !isStateExpired(ctx);
}