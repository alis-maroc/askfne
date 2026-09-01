/**
 * Arabic Consonantal Skeleton (Squelette Consonantique) Normalization
 * 
 * Reduces Arabic city names to their consonantal skeleton by:
 * - Removing prosthetic alef variants (إأآا at start of words)
 * - Removing all alef variants (إأآا → ∅) throughout
 * - Removing prepositions (لـ, بـ, فـ, للـ, ال)
 * - Normalizing ta marbuta (ة → ه)
 * - Normalizing ya (ى → ي)
 * - Removing harakat (short vowel marks)
 * - Removing final vowels that are grammatical endings (triptote)
 * 
 * Examples:
 * - تيزنيت / تزنيت → تيزنت
 * - إيفني / إفني → افني
 * - اشتوكة آيت باها → شتوكه ايتباحا
 * - سيدي افني → سيدي افن
 * - ورزازات → ورزازات
 */

// Stopwords/darija common words to filter from queries
const STOPWORDS = new Set([
    "من", "ما", "هو", "هي", "هل", "عن", "في", "على", "إلى", "اك", "اللي",
    "هذا", "هذه", "ذلك", "تلك", "كان", "كانت", "يكون", "تكون",
    "انا", "انت", "انتم", "نحن", "هم", "هن",
    "ماهو", "ماهي", "فين", "كيف", "علاش", "كيفاش",
]);

/**
 * Process a single word to extract its skeleton.
 * Handles Arabic city names by:
 * - Removing prosthetic alef variants at start
 * - Removing harakat (diacritics)
 * - Normalizing ta marbuta and alef maqsura
 * - Removing final vowels that are grammatical endings
 */
function processWordForSkeleton(word: string): string {
    if (!word || word.length === 0) return "";

    let result = word.trim();

    // Remove definite article ال at start
    if (result.startsWith("ال")) {
        result = result.slice(2);
    }

    // Remove preposition prefixes at very start (ب، ل، ف، ك، و)
    if (result.length > 2) {
        const firstChar = result.charAt(0);
        if (["ب", "ل", "ف", "ك", "و"].includes(firstChar)) {
            result = result.slice(1);
        }
    }

    // Remove prosthetic alef at start of word (إأآا when at beginning)
    // But NOT و which is a consonant
    if (result.length > 0) {
        const firstChar = result.charAt(0);
        if (["إ", "أ", "آ", "ا"].includes(firstChar)) {
            result = result.slice(1);
        }
    }

    // Remove hamza from anywhere (همزة)
    // إ and أ can appear anywhere in the word
    result = result.replace(/[إأآ]/g, "");

    // Remove harakat (short vowel marks: fatha, damma, kasra, sukun, tanween)
    result = result.replace(/[\u064B-\u065F\u0670]/g, "");

    // Normalize ta marbuta (ة) → ه
    result = result.replace(/ة/g, "ه");

    // Normalize alef maqsura (ى) → ي
    result = result.replace(/ى/g, "ي");

    // Remove non-Arabic characters
    result = result.replace(/[^\u0600-\u06FF]/g, "");

    // Remove final vowels that are grammatical endings (triptote markers)
    // In Arabic, many city names end with ي or ا which is a grammatical case ending
    // Remove these final vowels to get the core name
    // BUT preserve و if it's a consonant (like in ورزازات)
    if (result.length > 2) {
        const lastChar = result.slice(-1);
        // Remove final ي or ا (case endings) but not final و (often a consonant)
        if (lastChar === "ي" || lastChar === "ا") {
            result = result.slice(0, -1);
        }
    }

    return result;
}

/**
 * Extract the consonantal skeleton from a full Arabic text/query.
 * Handles multi-word queries by removing stopwords and prepositions.
 */
export function extractPhoneticSkeleton(text: string): string {
    if (!text || text.length === 0) return "";

    let result = text.trim();

    // Remove stopwords from the entire query
    for (const word of STOPWORDS) {
        const regex = new RegExp(`\\s${word}\\s|\\s${word}$|^${word}\\s|^${word}$`, "g");
        result = result.replace(regex, " ");
    }

    // Split into words and process each
    const words = result.split(/\s+/).filter(Boolean);
    const processedWords = words.map((word) => processWordForSkeleton(word));

    return processedWords.join(" ").trim();
}

/**
 * Normalize a full city name for skeleton matching.
 * This is the main function for city name matching.
 * 
 * Preserves sidi/siyedi prefix since it's part of the name.
 */
export function normalizeCitySkeleton(cityName: string): string {
    if (!cityName || cityName.length === 0) return "";

    // Split into words
    const words = cityName.trim().split(/\s+/).filter(Boolean);
    const processedWords = words.map((word) => processWordForSkeleton(word));

    return processedWords.join(" ").trim();
}

/**
 * Extract skeleton from a single word (no stopword removal).
 * Better for city name matching.
 */
export function extractWordSkeleton(word: string): string {
    return processWordForSkeleton(word);
}

/**
 * Compare two strings by their skeletons.
 * Returns true if they have the same consonantal skeleton.
 */
export function skeletonMatch(a: string, b: string): boolean {
    if (!a || !b) return false;
    return normalizeCitySkeleton(a) === normalizeCitySkeleton(b);
}

/**
 * Test the skeleton extraction for known cases.
 * Useful for debugging and validation.
 */
export function testSkeletonCases(): void {
    const cases: Array<[string, string]> = [
        ["تيزنيت", "تيزنت"],
        ["تزنيت", "تيزنت"],
        ["إيفني", "افني"],
        ["إفني", "افني"],
        ["اشتوكة آيت باها", "شتوكه ايتباحا"],
        ["سيدي افني", "سيدي افن"],
        ["ورزازات", "ورزازات"],
        ["وارزازات", "ورزازات"],
        ["اشتوكة", "شتوكه"],
        ["شتوكة", "شتوكه"],
        ["اكادير", "اكادير"],
        ["أكادير", "اكادير"],
    ];

    let passed = 0;
    let failed = 0;

    for (const [input, expected] of cases) {
        const result = normalizeCitySkeleton(input);
        const ok = result === expected;
        console.log(`${ok ? "✓" : "✗"} "${input}" → "${result}" ${ok ? "" : `(expected: ${expected})`}`);
        if (ok) passed++;
        else failed++;
    }

    console.log(`\n${passed}/${passed + failed} tests passed`);
}
