/**
 * Clash Royale API Cloudflare Worker Proxy (v2.0.0 - Direct RoyaleAPI Proxy)
 *
 * [목적]
 * 1. 오라클 클라우드 서버 없이 Cloudflare Worker 단독으로 Clash Royale API 프록시 운영
 * 2. Supercell Developer Portal에 RoyaleAPI 고정 IP(45.79.218.79)를 등록하고
 *    Worker 환경 변수(SUPERCELL_API_KEY)로 인증 헤더를 안전하게 주입
 * 3. Cloudflare Edge Cache(caches.default)를 활용한 TTL 캐싱 및 CORS 처리
 */

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin");
    const allowedOrigin = env.ALLOWED_ORIGIN || "*";
    const corsOrigin = (allowedOrigin === "*" || origin === allowedOrigin) ? (origin || "*") : allowedOrigin;

    const corsHeaders = {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key, Cache-Control, Pragma",
    };

    // 1. CORS Preflight (OPTIONS)
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders,
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
        status: 405,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
          "Allow": "GET, HEAD, OPTIONS",
        },
      });
    }

    const url = new URL(request.url);

    if (url.pathname.includes("..")) {
      return new Response(JSON.stringify({ error: "Invalid path traversal" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      });
    }

    // 2. 헬스체크
    if (url.pathname === "/" || url.pathname === "") {
      return new Response(JSON.stringify({
        status: "online",
        version: "2.0.0",
        mode: "royaleapi-direct",
        hasApiKey: Boolean(env.SUPERCELL_API_KEY),
        message: "Clash Royale API Proxy v2.0.0 (Cloudflare Worker -> proxy.royaleapi.dev) is active!",
        timestamp: new Date().toISOString(),
      }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    const targetPath = url.pathname.startsWith("/v1") ? url.pathname : `/v1${url.pathname}`;

    // /summary는 오라클 전용 커스텀 엔드포인트이므로 즉시 404를 반환해 클라이언트가 바로 /clans/:tag로 폴백하도록 유도
    if (targetPath.endsWith("/summary")) {
      return new Response(JSON.stringify({
        error: "Not Found",
        message: "Summary endpoint is not used in direct proxy mode; fallback to /v1/clans/:tag.",
      }), {
        status: 404,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          ...corsHeaders,
        },
      });
    }

    // 캐시 버스터(_t) 및 force 파라미터 제거 후 업스트림 URL 구성
    const upstreamParams = new URLSearchParams(url.search);
    const force = upstreamParams.get("force") === "1" || upstreamParams.get("force") === "true";
    upstreamParams.delete("_t");
    upstreamParams.delete("force");
    const cleanQuery = upstreamParams.toString();
    const targetUrl = `https://proxy.royaleapi.dev${targetPath}${cleanQuery ? `?${cleanQuery}` : ""}`;

    // 3. Cloudflare Edge Cache 조회
    const cache = caches.default;
    const cacheKey = new Request(targetUrl, { method: "GET" });

    if (!force && request.method === "GET") {
      const cached = await cache.match(cacheKey);
      if (cached) {
        const cachedHeaders = new Headers(cached.headers);
        Object.entries(corsHeaders).forEach(([k, v]) => cachedHeaders.set(k, v));
        cachedHeaders.set("X-Proxy-Cache", "HIT");
        cachedHeaders.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        return new Response(cached.body, {
          status: cached.status,
          headers: cachedHeaders,
        });
      }
    }

    // 4. Supercell API 인증 헤더 (Worker 환경 변수 우선, 없으면 클라이언트 헤더 사용)
    const forwardHeaders = {
      "Accept": "application/json",
    };
    const apiKey = (env.SUPERCELL_API_KEY || "").trim();
    if (apiKey) {
      forwardHeaders["Authorization"] = `Bearer ${apiKey}`;
    } else {
      const authHeader = request.headers.get("Authorization");
      if (authHeader) {
        forwardHeaders["Authorization"] = authHeader;
      }
    }

    try {
      const apiResponse = await fetch(targetUrl, {
        method: request.method,
        headers: forwardHeaders,
      });

      const responseBody = await apiResponse.text();

      // 정상 응답(200)만 엣지 캐시에 저장 (클랜 20초, 배틀로그 30초, 플레이어 120초)
      if (apiResponse.ok && request.method === "GET") {
        let ttl = 20;
        if (targetPath.includes("/battlelog")) ttl = 30;
        else if (targetPath.includes("/players/")) ttl = 120;

        const cacheResponse = new Response(responseBody, {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": `public, max-age=${ttl}`,
          },
        });
        ctx.waitUntil(cache.put(cacheKey, cacheResponse));
      }

      return new Response(responseBody, {
        status: apiResponse.status,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          ...corsHeaders,
          "X-Proxy-Cache": "MISS",
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
        },
      });
    } catch (err) {
      return new Response(JSON.stringify({
        error: "Proxy Request Failed",
        message: err.message,
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      });
    }
  },
};
