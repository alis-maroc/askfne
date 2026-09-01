/**
 * Ticket Guard — AGENTS.md compliant
 *
 * Tickets are created ONLY when:
 *   1. The user explicitly requests one (فتح تذكرة / انشاء تذكرة)
 *   2. After an explicit confirmation screen showing the draft
 *   3. Never automatically from a vague "I need help" or data-unavailable case
 *
 * Rules:
 *   - No implicit ticket creation from missing data
 *   - Confirmation state must be active (ticket_confirmation)
 *   - "نعم" only confirms if ticket_confirmation state is active
 *   - No ticket can be created from office_clarification state
 */

import { CONVERSATION_STATE, type StateContext } from "./conversation-state";
import { INTENT, type Intent } from "./intent-router";

/**
 * Pre-condition check before showing a ticket confirmation.
 * Returns a reason string if the ticket should NOT be created.
 */
export function canInitiateTicketWorkflow(
    intent: Intent,
    state: StateContext
): { allowed: true } | { allowed: false; reason: string } {
    // Must be an explicit ticket request
    if (intent !== INTENT.TICKET_REQUEST) {
        return {
            allowed: false,
            reason: "Un ticket ne peut être créé que sur demande explicite de l'utilisateur.",
        };
    }

    // office_clarification may never create a ticket
    if (state.state === CONVERSATION_STATE.OFFICE_CLARIFICATION) {
        return {
            allowed: false,
            reason:
                "تم رفض إنشاء تذكرة أثناء توضيح المكتب. يرجى إعادة صياغة طلبك.",
        };
    }

    // Any non-idle, non-menu state blocks the ticket workflow
    if (
        state.state !== CONVERSATION_STATE.IDLE &&
        state.state !== CONVERSATION_STATE.MENU
    ) {
        return {
            allowed: false,
            reason: "لا يمكن إنشاء تذكرة في هذا السياق. يرجى إعادة المحاولة في حالة خمول.",
        };
    }

    return { allowed: true };
}

/**
 * Final confirmation guard — called when the user says "نعم" / "oui".
 * Returns true ONLY if the current state is ticket_confirmation.
 */
export function canConfirmTicket(state: StateContext): boolean {
    return (
        state.state === CONVERSATION_STATE.TICKET_CONFIRMATION &&
        !isExpired(state)
    );
}

/**
 * Helper — check if a state has expired.
 */
function isExpired(ctx: StateContext): boolean {
    const expirySeconds: Record<string, number | null> = {
        [CONVERSATION_STATE.IDLE]: null,
        [CONVERSATION_STATE.MENU]: 600,
        [CONVERSATION_STATE.GUIDED_QUESTION]: 600,
        [CONVERSATION_STATE.OFFICE_CLARIFICATION]: 600,
        [CONVERSATION_STATE.DOCUMENT_GENERATION]: 300,
        [CONVERSATION_STATE.TICKET_CONFIRMATION]: 300,
    };
    const expiry = expirySeconds[ctx.state];
    if (expiry === null) return false;
    const elapsed = (Date.now() - ctx.lastActivity.getTime()) / 1000;
    return elapsed > expiry;
}

/**
 * Draft ticket shape shown to the user before confirmation.
 * This is the ONLY thing shown to the user — no ticket is created yet.
 */
export interface TicketDraft {
    title: string;
    description: string;
    channel: string;
    customerName?: string;
    priority?: "low" | "normal" | "high";
}

/**
 * Format a ticket draft for display to the user.
 * The actual ticket is NOT created until confirmation.
 */
export function formatTicketDraft(draft: TicketDraft): string {
    return [
        "📝 *مسودة التذكرة / Brouillon du ticket*",
        "",
        `*العنوان / Titre* : ${draft.title}`,
        `*الوصف / Description* : ${draft.description}`,
        `*القناة / Canal* : ${draft.channel}`,
        draft.priority ? `*الأولوية / Priorité* : ${draft.priority}` : "",
        "",
        "هل تريد تأكيد إنشاء هذه التذكرة؟ (أرسل نعم / Oui pour confirmer)",
        "Souhaitez-vous confirmer la création de ce ticket ? (Envoyez نعم / Oui pour confirmer)",
    ]
        .filter(Boolean)
        .join("\n");
}