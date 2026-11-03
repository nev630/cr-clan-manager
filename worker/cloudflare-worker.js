/**
 * Clash Royale API Cloudflare Worker Proxy (v1.4.2)
 * 
 * [목적]
 * 1. 브라우저의 CORS 제한 해결 및 HTTPS -> HTTP 종단 처리
 * 2. 슈퍼셀 Developer API의 IP 화이트리스트 통과를 위해 오라클 서울 인스턴스(168.110.63.115) 경유
 * 3. v1.4.2: 신규 /v1/clans/:tag/summary 지원 및 브라우저/Edge 캐시 협력
 */

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const allowedOrigin = env.ALLOWED_ORIGIN || "*";
    const corsOrigin = (allowedOrigin === "*" || origin === allowedOrigin) ? (origin || "*") : allowedOrigin;

    // 1. CORS Preflight (OPTIONS) 요청 처리
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": corsOrigin,
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key, Cache-Control, Pragma",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // 허용 HTTP 메서드 검증 (GET, HEAD만 허용)
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
        status: 405,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": corsOrigin,
          "Allow": "GET, HEAD, OPTIONS"
        }
      });
    }

    const url = new URL(request.url);

    // 경로 조작(Path Traversal) 방지
    if (url.pathname.includes("..")) {
      return new Response(JSON.stringify({ error: "Invalid path traversal" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": corsOrigin
        }
      });
    }

    // 기본 핑 테스트
    if (url.pathname === "/" || url.pathname === "") {
      return new Response(JSON.stringify({
        status: "online",
        version: "1.4.2",
        message: "Clash Royale API Proxy (Oracle Dedicated Instance with TTL Cache) is active!",
        timestamp: new Date().toISOString()
      }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    // 2. 오라클 서울 Always Free 인스턴스(고정 IP: 168.110.63.115, Nginx 80)로 전달
    const targetPath = url.pathname.startsWith("/v1") ? url.pathname : `/v1${url.pathname}`;
    const targetUrl = `http://168.110.63.115.sslip.io${targetPath}${url.search}`;

    try {
      const apiResponse = await fetch(targetUrl, {
        method: request.method,
        headers: {
          "Accept": "application/json"
        }
      });

      const responseBody = await apiResponse.text();

      // 3. CORS 및 캐시 헤더를 붙여서 응답 반환
      const cacheStatus = apiResponse.headers.get("x-cache-status") || "DYNAMIC";

      return new Response(responseBody, {
        status: apiResponse.status,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": corsOrigin,
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key, Cache-Control, Pragma",
          "X-Proxy-Cache": cacheStatus,
          "Cache-Control": "public, max-age=10, stale-while-revalidate=20"
        }
      });
    } catch (err) {
      return new Response(JSON.stringify({
        error: "Proxy Request Failed",
        message: err.message
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": corsOrigin
        }
      });
    }
  }
};
