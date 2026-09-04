import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

const API_VERSION = "2026-04-07";

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "X-API-Version": API_VERSION,
};

const CORS_ORIGIN = process.env.CORS_ORIGIN || "";

function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function addHeaders(
  response: NextResponse,
  requestId: string,
  rateLimit?: { limit: number; remaining: number; resetAt: number },
  pathname?: string
): NextResponse {
  // Security headers
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    // Allow embedding web-chat in iframes for WordPress and external sites
    if (key === "X-Frame-Options" && pathname?.startsWith("/web-chat")) {
      continue;
    }
    response.headers.set(key, value);
  }

  // Request ID
  response.headers.set("X-Request-Id", requestId);

  // Rate limit headers
  if (rateLimit) {
    response.headers.set("X-RateLimit-Limit", String(rateLimit.limit));
    response.headers.set("X-RateLimit-Remaining", String(Math.max(0, rateLimit.remaining)));
    response.headers.set("X-RateLimit-Reset", String(Math.ceil(rateLimit.resetAt / 1000)));
  }

  // CORS: allow embedding widget.js, web-chat, and public chat from any domain (e.g. WordPress)
  if (
    pathname?.endsWith(".js") ||
    pathname?.startsWith("/web-chat") ||
    pathname?.startsWith("/api/chat")
  ) {
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, X-Request-Id");
  } else if (CORS_ORIGIN) {
    response.headers.set("Access-Control-Allow-Origin", CORS_ORIGIN);
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key, X-Request-Id");
    response.headers.set("Access-Control-Expose-Headers", "X-Request-Id, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-API-Version");
    response.headers.set("Access-Control-Max-Age", "86400");
  }

  return response;
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestId = request.headers.get("x-request-id") || generateRequestId();

  // Static files and Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".jpg") ||
    pathname.endsWith(".jpeg") ||
    pathname.endsWith(".webp") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".ico") ||
    pathname.endsWith(".pdf") ||
    pathname.endsWith(".html") ||
    pathname.endsWith(".js")
  ) {
    const res = NextResponse.next();
    if (pathname.endsWith(".js")) {
      res.headers.set("Access-Control-Allow-Origin", "*");
      res.headers.set("Cache-Control", "public, max-age=3600");
    }
    return res;
  }

  // CORS preflight
  if (request.method === "OPTIONS") {
    const preflight = new NextResponse(null, { status: 204 });
    return addHeaders(preflight, requestId, undefined, pathname);
  }

  // Public paths that don't require auth
  const shareToken = request.nextUrl.searchParams.get("share");
  const isWhatsAppShare = pathname === "/whatsapp-share" &&
    Boolean(shareToken) && shareToken === process.env.WHATSAPP_SHARE_TOKEN;
  const isWhatsAppShareApi = pathname === "/api/channels/whatsapp" &&
    Boolean(shareToken) && shareToken === process.env.WHATSAPP_SHARE_TOKEN;
  const publicPaths = [
    "/login",
    "/setup",
    "/web-chat",
    "/widget.js",
    "/api/auth",
    "/api/chat",
    "/api/health",
    "/api/feedback",
    "/api/openapi.json",
    "/requests/print",
    "/api/requests/token",
    "/api/requests/pdf",
    "/wa",
    "/whatsapp",
    "/chat",
    "/poster",
    "/affiche",
    "/guide",
    "/r",
  ];
  const isPublic = publicPaths.some((p) => pathname.startsWith(p));

  // Channel webhook endpoints (authenticated via provider signatures, not JWT)
  if (
    pathname.startsWith("/api/channels/phone/") ||
    pathname.startsWith("/api/channels/sms") ||
    pathname.startsWith("/api/channels/telegram") ||
    pathname.startsWith("/api/channels/whatsapp/webhook")
  ) {
    return addHeaders(NextResponse.next(), requestId);
  }

  // Rate limiting for auth endpoint
  if (pathname.startsWith("/api/auth")) {
    const ip = getClientIp(request);
    const rateResult = checkRateLimit(`auth:${ip}`, RATE_LIMITS.auth);

    if (!rateResult.allowed) {
      const response = NextResponse.json(
        { error: { code: "RATE_LIMIT_EXCEEDED", message: "Too many requests. Please try again later.", requestId } },
        { status: 429 }
      );
      response.headers.set("Retry-After", String(Math.ceil((rateResult.resetAt - Date.now()) / 1000)));
      return addHeaders(response, requestId, { limit: RATE_LIMITS.auth.maxRequests, remaining: 0, resetAt: rateResult.resetAt });
    }

    return addHeaders(NextResponse.next(), requestId, {
      limit: RATE_LIMITS.auth.maxRequests,
      remaining: rateResult.remaining,
      resetAt: rateResult.resetAt,
    });
  }

  // Rate limiting for AI Chat endpoint (15 requests/min per IP to protect LLM quota & prevent abuse)
  if (pathname.startsWith("/api/chat")) {
    const ip = getClientIp(request);
    const rateResult = checkRateLimit(`chat:${ip}`, RATE_LIMITS.chat);

    if (!rateResult.allowed) {
      const response = NextResponse.json(
        {
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: "لقد أرسلت عدة رسائل في وقت وجيز. يرجى الانتظار بضع ثوانٍ قبل إرسال رسالة جديدة.",
            requestId,
          },
        },
        { status: 429 }
      );
      response.headers.set("Retry-After", String(Math.ceil((rateResult.resetAt - Date.now()) / 1000)));
      return addHeaders(response, requestId, {
        limit: RATE_LIMITS.chat.maxRequests,
        remaining: 0,
        resetAt: rateResult.resetAt,
      });
    }

    const response = NextResponse.next();
    response.headers.set("Cache-Control", "no-store, max-age=0");
    return addHeaders(
      response,
      requestId,
      {
        limit: RATE_LIMITS.chat.maxRequests,
        remaining: rateResult.remaining,
        resetAt: rateResult.resetAt,
      },
      pathname
    );
  }

  if (isPublic) {
    const response = NextResponse.next();
    if (pathname === "/web-chat") {
      response.headers.set("Cache-Control", "no-store, max-age=0");
    }
    return addHeaders(response, requestId, undefined, pathname);
  }

  if (isWhatsAppShare) {
    return addHeaders(NextResponse.next(), requestId);
  }

  if (isWhatsAppShareApi) {
    return addHeaders(NextResponse.next(), requestId);
  }

  // General API rate limiting
  let apiRateInfo: { limit: number; remaining: number; resetAt: number } | undefined;
  if (pathname.startsWith("/api/")) {
    const ip = getClientIp(request);
    const rateResult = checkRateLimit(`api:${ip}`, RATE_LIMITS.api);

    if (!rateResult.allowed) {
      const response = NextResponse.json(
        { error: { code: "RATE_LIMIT_EXCEEDED", message: "Too many requests. Please try again later.", requestId } },
        { status: 429 }
      );
      response.headers.set("Retry-After", String(Math.ceil((rateResult.resetAt - Date.now()) / 1000)));
      return addHeaders(response, requestId, { limit: RATE_LIMITS.api.maxRequests, remaining: 0, resetAt: rateResult.resetAt });
    }

    apiRateInfo = {
      limit: RATE_LIMITS.api.maxRequests,
      remaining: rateResult.remaining,
      resetAt: rateResult.resetAt,
    };
  }

  // Check for auth token (cookie) or API key (header)
  const token = request.cookies.get("owly-token")?.value;
  const apiKey = request.headers.get("x-api-key");

  if (!token && !apiKey) {
    if (pathname.startsWith("/api/")) {
      return addHeaders(
        NextResponse.json(
          { error: { code: "UNAUTHORIZED", message: "Authentication required", requestId } },
          { status: 401 }
        ),
        requestId,
        apiRateInfo
      );
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // API key auth is validated in route handlers (requireAuth), just pass through
  if (apiKey && !token) {
    return addHeaders(NextResponse.next(), requestId, apiRateInfo);
  }

  // Verify JWT structure
  const parts = (token || "").split(".");
  if (parts.length !== 3) {
    if (pathname.startsWith("/api/")) {
      return addHeaders(
        NextResponse.json(
          { error: { code: "INVALID_TOKEN", message: "Invalid authentication token", requestId } },
          { status: 401 }
        ),
        requestId,
        apiRateInfo
      );
    }
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete("owly-token");
    return response;
  }

  return addHeaders(NextResponse.next(), requestId, apiRateInfo);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
