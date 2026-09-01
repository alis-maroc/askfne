/**
 * Intent Router — AGENTS.md compliant
 *
 * Each free-form user message is classified into ONE exclusive intent BEFORE any
 * retrieval, search, or AI generation runs. The intent then dictates which
 * source is authorized (see SOURCE_BY_INTENT) and which response shape is
 * acceptable. A free-form question ALWAYS clears stale state (menu,
 * guided-question, office-clarification, pending-ticket) before classification.
 *
 * Why a dedicated router? The previous routing layer conflated questions about
 * national union positions with office lookups, allowing a question like
 * "موقف الجامعة من الحراك التعليمي" to trigger geographic similarity over
 * 82+ offices. This router prevents that class of bug by design.
 */

export const INTENT = {
    CONTACT_BUREAU: "contact_bureau",
    ORGANE_OFFICIEL: "organe_officiel",
    POSITION_NATIONALE: "position_nationale",
    TICKET_REQUEST: "ticket_request",
    QUESTION_GENERALE: "question_generale",
} as const;

export type Intent = (typeof INTENT)[keyof typeof INTENT];

/**
 * Source allowed per intent. The router will refuse to call any source that
 * is not in this list. This is the data-contract gate that prevents
 * hallucinated contacts and stale rosters.
 */
export const SOURCE_BY_INTENT: Record<Intent, ReadonlyArray<SourceType>> = {
    // Only the verified Office registry is allowed. No KB, no LLM-generated contacts.
    [INTENT.CONTACT_BUREAU]: ["office_registry"],

    // Only a dated, official roster is allowed. Until such a roster exists the
    // answer must be "information non disponible".
    [INTENT.ORGANE_OFFICIEL]: ["official_roster"],

    // Only communiqués from the union site. No offices, no KB inference.
    [INTENT.POSITION_NATIONALE]: ["union_communique", "union_site"],

    // Tickets only via explicit user request + confirmation. Never implicit.
    [INTENT.TICKET_REQUEST]: ["ticket_system"],

    // General knowledge without contact injection or guessed members.
    [INTENT.QUESTION_GENERALE]: ["knowledge_base"],
};

export type SourceType =
    | "office_registry"
    | "official_roster"
    | "union_communique"
    | "union_site"
    | "ticket_system"
    | "knowledge_base";

export type IntentDecision =
    | { kind: "answer"; intent: Intent }
    | { kind: "clarify"; intent: Intent; reason: string }
    | { kind: "refuse"; intent: Intent; reason: string };

/**
 * Keyword seeds per intent. Order matters: the FIRST match wins.
 * Each list is a strict whitelist of patterns that justify entering the
 * intent. Patterns are matched against normalized text.
 */
const INTENT_KEYWORDS: Array<{ intent: Intent; keywords: string[] }> = [
    {
        // TICKET_REQUEST must be matched BEFORE CONTACT_BUREAU — phrases like
        // "فتح تذكرة حول الهاتف" contain both ticket and contact signals.
        intent: INTENT.TICKET_REQUEST,
        keywords: [
            "فتح تذكرة", "انشاء تذكرة", "إنشاء تذكرة", "تذكرة دعم", "تذكرة جديدة",
            "ouvrir un ticket", "creer un ticket", "créer un ticket",
            "open ticket", "create ticket", "support ticket",
        ],
    },
    {
        intent: INTENT.ORGANE_OFFICIEL,
        keywords: [
            // Bodies of the union
            "اللجنة الادارية", "اللجنة الإدارية", "المجلس الوطني", "المكتب الوطني",
            "الجامعة الوطنية للتعليم", "النقابة الوطنية للتعليم",
            "المكتب التنفيذي", "المكتب الجهوي", "المكتب الاقليمي", "المكتب المحلي",
            // Members / composition queries
            "اعضاء اللجنة", "أعضاء اللجنة", "اعضاء المكتب", "أعضاء المكتب",
            "اعضاء المجلس", "أعضاء المجلس", "تشكيلة", "تركيبة",
            "من هي اعضاء", "من هم اعضاء", "من هي أعضاء", "من هم أعضاء",
            "لجنة تنفيذية", "هيكل الجامعة", "هياكل الجامعة",
        ],
    },
    {
        intent: INTENT.POSITION_NATIONALE,
        keywords: [
            // Union stance / movement / communiqué — explicitly NOT geographic.
            "موقف الجامعة", "موقف النقابة", "موقف المكتب الوطني",
            "بيان الجامعة", "بيان النقابة", "بلاغ الجامعة", "بلاغ النقابة",
            "الحراك التعليمي", "الحراك النقابي", "الحركة النقابية",
            "اضراب وطني", "إضراب وطني", "اضراب عام", "إضراب عام",
            "وقفة احتجاجية", "وقفة وطنية", "احتجاج",
            "اصلاح التعليم", "إصلاح التعليم", "اصلاح منظومة", "إصلاح منظومة",
            "تكتل نقابي", "الجبهة النقابية",
        ],
    },
    {
        // CONTACT_BUREAU must only match when the user is clearly asking for a
        // bureau's contact info. This is the trigger that gates geographic
        // search. Adding more triggers here widens the funnel and reintroduces
        // the false-positive class of bugs the router exists to prevent.
        intent: INTENT.CONTACT_BUREAU,
        keywords: [
            "رقم المكتب", "رقم مكتب", "هاتف المكتب", "هاتف مكتب",
            "نمرة المكتب", "نمرة مكتب",
            "تواصل مع المكتب", "الاتصال بالمكتب", "الاتصال بمكتب",
            "امين المال", "الأمين", "الكاتب المحلي", "الكاتب الإقليمي", "الكاتب الجهوي",
            "امين المكتب", "سكرتير المكتب",
            "telephone bureau", "numero bureau", "numero du bureau",
            "contact bureau", "contacter le bureau",
        ],
    },
    // QUESTION_GENERALE is the default for everything that didn't match above.
];

export interface IntentClassification {
    intent: Intent;
    /** True when at least one seed keyword matched. */
    matched: boolean;
    /** Confidence in [0,1]. Question keywords ⇒ ~0.95, fallback ⇒ 0.5. */
    confidence: number;
}

/**
 * Classify a normalized user message into a single intent.
 *
 * The classifier is intentionally conservative: when no keyword matches it
 * returns `QUESTION_GENERALE` with low confidence so downstream code can
 * trigger a clarification rather than guessing.
 */
export function classifyIntent(normalizedText: string): IntentClassification {
    for (const { intent, keywords } of INTENT_KEYWORDS) {
        for (const keyword of keywords) {
            if (normalizedText.includes(keyword)) {
                return { intent, matched: true, confidence: 0.95 };
            }
        }
    }
    return { intent: INTENT.QUESTION_GENERALE, matched: false, confidence: 0.5 };
}

/**
 * Gate that decides if a given (intent, sourceType) pair is legal.
 * Returns true ONLY if the source is listed for that intent.
 */
export function isSourceAllowed(intent: Intent, source: SourceType): boolean {
    return SOURCE_BY_INTENT[intent].includes(source);
}

/**
 * Observability-friendly decision helper. Use this anywhere the AI engine is
 * about to invoke a tool or surface an answer. It returns one of:
 *   - answer:   source is allowed, confidence acceptable
 *   - clarify:  source missing OR confidence < threshold
 *   - refuse:   no legal source exists for this intent in the current state
 *                (e.g. ORGANE_OFFICIEL with no registered roster)
 */
export interface DecideParams {
    intent: Intent;
    classification: IntentClassification;
    availableSources: ReadonlyArray<SourceType>;
    hasOfficialRoster: boolean;
}

export function decideAnswer({
    intent,
    classification,
    availableSources,
    hasOfficialRoster,
}: DecideParams): IntentDecision {
    // Special guard: ORGANE_OFFICIEL must NOT be answered with a guessed roster.
    if (intent === INTENT.ORGANE_OFFICIEL && !hasOfficialRoster) {
        return {
            kind: "refuse",
            intent,
            reason:
                "Aucune liste officielle datée des membres n'est disponible. Aucune réponse ne peut être produite.",
        };
    }

    const allowed = SOURCE_BY_INTENT[intent];
    const hasSource = availableSources.some((s) => allowed.includes(s));

    if (!hasSource) {
        return {
            kind: "clarify",
            intent,
            reason: `Aucune source autorisée disponible pour l'intention ${intent}.`,
        };
    }

    if (classification.confidence < 0.6) {
        return {
            kind: "clarify",
            intent,
            reason: "Confiance trop basse — clarification recommandée.",
        };
    }

    return { kind: "answer", intent };
}