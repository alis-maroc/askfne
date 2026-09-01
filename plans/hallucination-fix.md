# Plan: Prevent AI Hallucination on Unknown Topics

## Problem Analysis

The bot is **inventing false information** when it doesn't have relevant knowledge, instead of saying "I don't know." Two reported cases:

1. **المذكرة 26-061**: Bot invented wrong dates (February 2025), wrong content, wrong year — completely fabricated
2. **تيزنيت**: Bot spelled it wrong (تزنيت instead of تيزنيت) and gave wrong contact info for Tanger instead of the correct info

### Root Causes

1. **No knowledge retrieval quality check before generation**: The AI gets called even when the KB returns garbage/empty entries
2. **No post-generation hallucination detection**: The `isAssistantRefusal()` only catches explicit refusals, not confident fabrications
3. **OCR corruption**: Even after the fix, entries might contain garbage OCR text that LOOKS like real content to the AI
4. **AI hallucinates to fill gaps**: Free-tier AI models tend to fill knowledge gaps with plausible-sounding fabrications

### Current Architecture (already exists)

- `buildSystemPrompt()` (engine.ts:534-729): System prompt with "do not fabricate" rules
- `getKnowledgeBase()` (engine.ts:949+): KB retrieval, up to 500 entries
- `isAssistantRefusal()` (refusal-detector.ts:52-66): Catches explicit refusals only
- `estimateConfidence()` (guardrails.ts:177-216): Confidence scoring with threshold 0.6
- Post-response: marks `hasUnanswered=true` if `isRefusal=true`

## Solution Design

### Tier 1: Prevent AI from generating when KB is empty/garbage

```
getKnowledgeBase(query)
  → returns KnowledgeItem[]
  → NEW: measure retrieval quality
  → if quality < threshold AND no strong matches:
      → skip AI call entirely
      → return direct "I don't know" response
```

### Tier 2: Add hallucination detection for confident fabrications

```
Post-generation check:
  if response contains specific known facts NOT in KB:
    → flag as potential hallucination
    → replace with "I don't know" response

Patterns to detect:
  - Named dates/durations that don't match KB content
  - Named phone numbers that don't match KB entries
  - Named officials for regions NOT in KB
  - Content about circulars/decrees that aren't in KB
```

### Tier 3: Strengthen the "I don't know" instruction in system prompt

Add explicit instruction: if KB entries are < X chars total for the query topic, say you don't know.

---

## Implementation Steps

### Step 1: Add `hasRelevantKnowledge()` function to engine.ts

Create a quality scoring function that checks:
- Total KB characters for matching entries
- Presence of key query terms in entries
- OCR garbage detection (check for `-- N of M --` patterns, random characters)

### Step 2: Modify `getKnowledgeBase()` to return quality metadata

```typescript
export async function getKnowledgeBase(query?: string): Promise<{
  items: KnowledgeItem[];
  quality: { score: number; hasStrongMatch: boolean; totalChars: number };
}>
```

### Step 3: Add pre-generation gate in `sendMessage()`

In engine.ts around line 1414-1436, before calling AI:
```typescript
const knowledgeBase = await getKnowledgeBase(retrievalQuery);
// NEW: Check if KB is sufficient for this query
const kbQuality = knowledgeBase.quality;
if (kbQuality.totalChars < 100 && !kbQuality.hasStrongMatch) {
  // Return "I don't know" directly without calling AI
  return await buildNoAnswerResponse(userMessage, context);
}
```

### Step 4: Add post-generation hallucination detector

In `refusal-detector.ts`, add new function:
```typescript
export function detectHallucination(
  response: string,
  knowledgeBase: KnowledgeItem[]
): boolean {
  // Check for content that claims to be specific facts
  // but isn't in the KB
}
```

### Step 5: Update `sendMessage()` to use hallucination detector

Around line 1535, after getting response:
```typescript
const isHallucination = detectHallucination(response, knowledgeBase);
if (isHallucination) {
  return await buildNoAnswerResponse(userMessage, context);
}
```

### Step 6: Strengthen system prompt

In `buildSystemPrompt()`, add instruction:
```
إذا كانت قاعدة المعرفة المرفقة تحتوي على أقل من 100 حرف متعلق بسؤال المنخرط، اعترف فوراً أنك لا تملك المعلومة:
"عذراً، ليس لدي حالياً معلومات دقيقة ومؤكدة حول هذا الموضوع في قاعدة البيانات. يمكنني فتح طلب تواصل مع المكتب المختص لمساعدتك."
```

### Step 7: Fix the تيزنيت typo issue

The system prompt has explicit office names for each province. The issue is the AI is **ignoring** these explicit instructions and inventing. This suggests:
- The AI is not attending to the specific province instructions
- OR the user query normalization (`normalizeForMatch`) is stripping تيزنيت toتزنيت before matching

Check engine.ts line 127:
```typescript
.replace(/\b(تزنيت)\b/g, "تيزنيت")
```
Wait - this says **replace تيزنيت with تزنيت** which is BACKWARDS! This might be the actual bug for the تيزنيت issue.

---

## Files to Modify

1. **src/lib/ai/engine.ts**
   - Add `hasRelevantKnowledge()` function
   - Modify `getKnowledgeBase()` return type
   - Add pre-generation KB quality gate
   - Add post-generation hallucination check
   - Add `buildNoAnswerResponse()` function
   - Fix تيزنيت typo in `normalizeForMatch()`

2. **src/lib/ai/refusal-detector.ts**
   - Add `detectHallucination()` function
   - Add hallucination patterns for known fact types

3. **src/lib/ai/guardrails.ts**
   - Adjust confidence scoring for low-KB scenarios

4. **src/lib/ai/types.ts** (if needed)
   - Add new types for KB quality metadata

## Testing Plan

1. Test "المذكرة 26-061" query → should return "I don't know"
2. Test "الكاتب الإقليمي لتيزنيت" → should return correct name (هشام الكرطيط)
3. Test "بني ملال" → should not give Tanger info
4. Verify escalation/conversation marking works

## Mermaid: Flow Diagram

```mermaid
flowchart TD
    UserQuery[User Query] --> KBR[Knowledge Base Retrieval]
    KBR --> QualityCheck{Quality Check<br/>totalChars > 100<br/>OR strong match?}
    QualityCheck -->|No| NoAns[Return "I Don't Know"<br/>mark escalated]
    QualityCheck -->|Yes| AICall[Call AI with KB]
    AICall --> Response[AI Response]
    Response --> HallCheck{Hallucination<br/>Detector}
    HallCheck -->|Detected| NoAns
    HallCheck -->|Clean| FinalResp[Return Response]
```
