# Plan: Active les embeddings via OpenRouter (Option C bis)

## Problème découvert

Le backfill a échoué sur les 478 entrées car la clé OpenAI était un placeholder.
Inventaire des clés disponibles :

| Clé | Provider | Statut |
|-----|----------|--------|
| `gsk_KPuB1O...` (Groq) | `groq` | ✅ Clé réelle — chat seulement |
| `sk-or-v1-c...` (OpenRouter) | `openrouter` | ✅ Clé réelle — fallback chat |
| `OPENAI_API_KEY=sk-your...` | env var | ❌ Placeholder uniquement |
| `fallbackApiKey` dans DB | `openrouter` | ✅ Même clé `sk-or-v1-c...` |

**Conclusion** : il n'y a pas de clé OpenAI. Mais OpenRouter expose `text-embedding-3-small`
via son endpoint compatible OpenAI `/v1/embeddings` avec la même clé `sk-or-v1-c`.

## Solution : utiliser OpenRouter pour les embeddings

### Architecture proposée

```
generateEmbedding(text, apiKey)
  → OpenAI-compatible client pointing to OpenRouter
  → model: "text-embedding-3-small"  (OpenRouter routing)
  → endpoint: https://openrouter.ai/api/v1/embeddings
```

Le code existant `generateEmbedding()` dans `semantic-search.ts` utilise déjà le fetch raw
(direct, pas le SDK OpenAI). Il suffit de changer `baseURL` et `model`.

### Étapes de réalisation

#### 1. Modifier `src/lib/ai/semantic-search.ts`

Modifier `generateEmbedding()` pour détecter OpenRouter :

```typescript
async function generateEmbedding(text: string, apiKey: string, provider = "openai"): Promise<number[] | null> {
  const isOpenRouter = apiKey.startsWith("sk-or-v1-");
  const baseURL = isOpenRouter
    ? "https://openrouter.ai/api/v1"
    : "https://api.openai.com/v1";
  const model = isOpenRouter ? "text-embedding-3-small" : "text-embedding-3-small";

  const response = await fetch(`${baseURL}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      // OpenRouter nécessite ce header
      ...(isOpenRouter && { "HTTP-Referer": "https://owly.example.com", "X-Title": "Owly" }),
    },
    body: JSON.stringify({ model, input: text.substring(0, 8000) }),
  });
  // ...
}
```

#### 2. Modifier `searchKnowledgeBase()` dans `semantic-search.ts`

Mettre à jour la logique de sélection de clé pour chercher dans `fallbackApiKey`
quand le provider n'est pas OpenAI :

```typescript
const settings = await prisma.settings.findFirst({
  select: { aiApiKey: true, aiProvider: true, fallbackApiKey: true, fallbackProvider: true },
});

// Chercher une clé capable d'embeddings
const embeddingKey =
  (settings?.aiProvider === "openai" && settings?.aiApiKey?.startsWith("sk-"))
    ? settings.aiApiKey
    : (settings?.fallbackProvider === "openrouter" && settings?.fallbackApiKey?.startsWith("sk-or-v1-"))
      ? settings.fallbackApiKey
      : null;
```

#### 3. Modifier `indexKnowledgeEntry()` dans `semantic-search.ts`

Même logique de détection de clé OpenRouter.

#### 4. Mettre à jour le script de backfill `scripts/backfill-kb-embeddings.ts`

- Même modification de `generateEmbedding()`
- Afficher le provider utilisé : "Using OpenRouter for embeddings"

#### 5. Relancer le backfill

```bash
docker exec -e DATABASE_URL='...' owly-app-1 \
  bash -c 'cd /app && node_modules/.bin/tsx scripts-backfill-kb-embeddings.ts'
```

Vérifier avec psql :
```sql
SELECT count(*) FROM "KnowledgeEntry"
WHERE "isActive" = true
  AND jsonb_typeof("metadata"->'embedding') = 'array';
-- Attendu: 478 (après backfill)
```

#### 6. Rebuild + restart le container

```bash
docker compose up --build -d
```

#### 7. Commit + push

## Fichiers à modifier

| Fichier | Action |
|---------|--------|
| `src/lib/ai/semantic-search.ts` | Modifier `generateEmbedding()` pour OpenRouter + adapter `searchKnowledgeBase()` et `indexKnowledgeEntry()` |
| `scripts/backfill-kb-embeddings.ts` | Même modification de `generateEmbedding()` |

## Impact sur le système

- Aucune rupture pour les conversations existantes
- Les embeddings générés via OpenRouter sont compatibles avec cosineSimilarity()
- OpenRouter offre 1M tokens gratuits/jour pour embeddings (gratuit à ce niveau)
- Les routes POST/PUT utilisent la même logique de détection de clé
