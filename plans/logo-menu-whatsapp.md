# Plan: Réduire la taille du logo FNE dans le menu WhatsApp

## Objectif
Garder le logo FNE en pièce jointe, mais le réduire à une **taille icône** (très petit) pour qu'il ne soit plus "trop exposé" et ressemble plus à un emoji inline.

## Analyse du code existant

### `sendMenuWithLogo` (ligne 840)
```typescript
const FNE_LOGO_PATH = path.join(process.cwd(), "public", "logo_fne.gif");
const FNE_LOGO_MAX_WIDTH = 280; // pixels — small, discreet logo
```

L'image est actuellement redimensionnée à 280px de large, ce qui l'utilisateur trouve encore trop grand/exposé.

### Emplacements qui appellent `sendMenuWithLogo`
- **Ligne 1020**: Menu principal (commandes /menu, /start, salutations)
- **Ligne 1064**: Menu catégories
- **Ligne 1266**: Menu Hub
- **Ligne 1296**: Menu principal (après expiration)

---

## Solution

Réduire `FNE_LOGO_MAX_WIDTH` de 280px à **64-80px** (taille icône) pour que le logo ressemble à un emoji inline au lieu d'une image d'en-tête.

### Modification simple

Dans `src/lib/channels/whatsapp.ts` ligne 834:

**Avant:**
```typescript
const FNE_LOGO_MAX_WIDTH = 280; // pixels — small, discreet logo for the menu header
```

**Après:**
```typescript
const FNE_LOGO_MAX_WIDTH = 64; // pixels — icon-sized logo, inline with menu text
```

Optionnel: Aussi réduire la qualité JPEG de 80 à 70 pour des bytes plus petits.

---

## Résultat attendu

**Avant:** Image 280px en haut du message (trop exposé)
**Après:** Petite image 64px (taille icône) au-dessus du texte, ressemble à un emoji

Le format reste: image avec caption (texte du menu) — juste la taille de l'image est réduite.

---

## Fichiers à modifier

| Fichier | Modification |
|---------|-------------|
| `src/lib/channels/whatsapp.ts` | Réduire `FNE_LOGO_MAX_WIDTH` de 280 à 64 (ou 80) |

---

## Étapes d'implémentation

1. Modifier la constante `FNE_LOGO_MAX_WIDTH` à 64
2. (Optionnel) Réduire la qualité JPEG de 80 à 70
3. Vérifier le rendu en testant l'envoi du menu
