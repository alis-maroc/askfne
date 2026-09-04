import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { logger } from "@/lib/logger";

const BASE_URL =
  process.env.APP_BASE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://askfne.taalim.org";


/**
 * Creates or retrieves a clean short link for a given destination URL.
 * Especially useful for long ministerial PDFs with Arabic percent-encoding (e.g. %D9%85%D8%B0%D9%83%D8%B1%D8%A9...).
 */
export async function getOrCreateShortLink(originalUrl: string): Promise<string> {
  if (!originalUrl || !originalUrl.startsWith("http")) return originalUrl;

  // Don't shorten already short URLs from the same host or clean short URLs
  if (originalUrl.startsWith(BASE_URL) || (originalUrl.length < 50 && !originalUrl.includes("%"))) {
    return originalUrl;
  }

  try {
    // Try to find if slug already exists for this URL
    const existing = await (prisma as any).shortLink.findFirst({
      where: { url: originalUrl },
      select: { slug: true },
    });
    if (existing) {
      return `${BASE_URL}/r/${existing.slug}`;
    }

    // Try to derive a meaningful slug from circular number if present
    // e.g. "26-067" or "26-064"
    let desiredSlug = "";
    const circularMatch = originalUrl.match(/(?:%20|_|-|\/)(2\d-[0-9]{2,4})/i);
    if (circularMatch) {
      desiredSlug = circularMatch[1].toLowerCase();
    } else {
      // 6-char cryptographic hash
      const hash = crypto.createHash("md5").update(originalUrl).digest("hex").substring(0, 6);
      desiredSlug = `fne-${hash}`;
    }

    // Check if desiredSlug is taken by a different URL
    const slugExists = await (prisma as any).shortLink.findUnique({
      where: { slug: desiredSlug },
      select: { url: true },
    });

    let finalSlug = desiredSlug;
    if (slugExists && slugExists.url !== originalUrl) {
      const extraHash = crypto.createHash("md5").update(originalUrl).digest("hex").substring(0, 4);
      finalSlug = `${desiredSlug}-${extraHash}`;
    }

    await (prisma as any).shortLink.create({
      data: {
        slug: finalSlug,
        url: originalUrl,
      },
    });

    return `${BASE_URL}/r/${finalSlug}`;
  } catch (err) {
    logger.warn("[ShortLinks] Error generating short link:", { error: String(err), originalUrl });
    return originalUrl;
  }
}

/**
 * Resolves a slug to its target destination URL and increments hits count.
 */
export async function resolveShortLink(slug: string): Promise<string | null> {
  if (!slug) return null;
  try {
    const link = await (prisma as any).shortLink.findUnique({
      where: { slug },
    });
    if (!link) return null;

    // Increment hit asynchronously
    void (prisma as any).shortLink
      .update({
        where: { id: link.id },
        data: { hits: { increment: 1 } },
      })
      .catch(() => {});

    return link.url;
  } catch (err) {
    logger.error("[ShortLinks] Failed to resolve short link:", { slug, error: String(err) });
    return null;
  }
}
