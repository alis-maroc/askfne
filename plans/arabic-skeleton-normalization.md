# Arabic City Name Normalization: Consonantal Skeleton Approach

## Problem Statement
Current normalization using regex-based replacements is fragile and incomplete. Examples that still fail:
- `إيفني` ≠ `إفني` (different alef variants)
- `اشتوكة` ≠ `شتوكة` (alef prosthetique)
- `ورزازات` ≠ `وارزازات` (preposition prefix)

## Solution: Consonantal Skeleton (Squelette Consonantique)

### How it works
Reduce city names to their consonantal skeleton by removing:
- All vowels (including alef variants إأآا → ∅)
- Prepositions (لـ, بـ, فـ, للـ)
- Article prefix (الـ)
- Hamza variations
- Ta marbuta (ة → ه)

**Examples:**
| Original | Skeleton |
|----------|-----------|
| تيزنيت | تيزنت |
| تزنيت | تيزنت |
| إيفني | افني |
| إفني | افني |
| اشتوكة آيت باها | شتوكه ايتباحا |
| سيدي افني | سيدي افني |

## Implementation Plan

### 1. Database Migration
Add `squelette_ville` column to `Office` table:
```sql
ALTER TABLE "Office" ADD COLUMN IF NOT EXISTS "squeletteVille" TEXT;
CREATE INDEX IF NOT EXISTS "Office_squelette_ville_idx" ON "Office"("squeletteVille");
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "Office_squelette_trgm_idx" ON "Office" USING gin ("squeletteVille" gin_trgm_ops);
```

### 2. Create Skeletization Function
File: `src/lib/arabic-skeleton.ts`
```typescript
export function extractPhoneticSkeleton(text: string): string {
  // 1. Remove stopwords/darija
  // 2. Remove prepositions: لـ, بـ, فـ, للـ
  // 3. Remove article: الـ
  // 4. Remove alef variants at start: ^[إأآا](?=[^وي])
  // 5. Remove all vowels/semi-vowels: [اوي]
  // 6. Normalize ta marbuta: ة → ه
  // 7. Normalize ya: ى → ي
  // 8. Remove non-Arabic characters
}
```

### 3. Update Office Prisma Model
File: `prisma/schema.prisma`
```prisma
model Office {
  // ... existing fields
  squeletteVille String?  // New field
}
```

### 4. Create Migration
File: `prisma/migrations/YYYYMMDDHHMMSS_add_squelette_ville/migration.sql`

### 5. Update Hub Ingestion
File: `src/lib/hub-offices.ts`
- When storing offices from hub, also compute and store `squeletteVille`

### 6. Create Database Query Functions
File: `src/lib/office-search.ts`
```typescript
// Step 1: Exact skeleton match (instant)
export async function findOfficesBySkeleton(skeleton: string): Promise<Office[]>

// Step 2: Trigram similarity fallback
export async function findOfficesBySimilarity(query: string, minSimilarity = 0.4): Promise<Office[]>
```

### 7. Update buildOfficeDirectAnswer
File: `src/lib/ai/engine.ts`
- Generate skeleton from user query
- Try exact skeleton match first
- Fall back to similarity search

## Files to Modify
1. `prisma/schema.prisma` - Add squeletteVille field
2. `prisma/migrations/` - New migration
3. `src/lib/arabic-skeleton.ts` - NEW: Skeletization function
4. `src/lib/hub-offices.ts` - Store skeleton on ingestion
5. `src/lib/office-search.ts` - NEW: DB query functions
6. `src/lib/ai/engine.ts` - Use skeleton search

## Testing Plan
1. `تزنيت` → `تيزنيت` (same skeleton)
2. `إيفني` → `إفني` (same skeleton)
3. `اشتوكة` → `شتوكة` (same skeleton)
4. `ورزازات` → `وارزازات` (same skeleton)
5. Fuzzy cases like `سيدي افني` with typos still resolve correctly
