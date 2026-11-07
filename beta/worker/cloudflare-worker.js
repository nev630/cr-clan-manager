/**
 * Clash Royale API Cloudflare Worker Proxy (v1.8.0)
 * 
 * [목적]
 * 1. 브라우저의 CORS 제한 해결 및 HTTPS -> HTTP 종단 처리
 * 2. 슈퍼셀 Developer API의 IP 화이트리스트 통과를 위해 오라클 서울 인스턴스(168.110.63.115) 경유
 * 3. v1.8.0: X-Forwarded-For 클라이언트 IP 전달, COALESCED 캐시 상태 헤더 투과 및 무캐시 응답 보장
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

    if (url.pathname.includes("..")) {
      return new Response(JSON.stringify({ error: "Invalid path traversal" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": corsOrigin
        }
      });
    }

    if (url.pathname === "/" || url.pathname === "") {
      return new Response(JSON.stringify({
        status: "online",
        version: "1.8.0",
        message: "Clash Royale API Proxy v1.8.0 (Oracle Dedicated Instance with TTL Cache & Request Coalescing) is active!",
        timestamp: new Date().toISOString()
      }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    const targetPath = url.pathname.startsWith("/v1") ? url.pathname : `/v1${url.pathname}`;
    const targetUrl = `http://168.110.63.115.sslip.io${targetPath}${url.search}`;

    const clientIp = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "";

    const forwardHeaders = {
      "Accept": "application/json",
      "X-Forwarded-For": clientIp
    };

    const authHeader = request.headers.get("Authorization");
    if (authHeader) {
      forwardHeaders["Authorization"] = authHeader;
    }

    try {
      const apiResponse = await fetch(targetUrl, {
        method: request.method,
        headers: forwardHeaders
      });

      const responseBody = await apiResponse.text();
      const cacheStatus = apiResponse.headers.get("x-cache-status") || "DYNAMIC";

      return new Response(responseBody, {
        status: apiResponse.status,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": corsOrigin,
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key, Cache-Control, Pragma",
          "X-Proxy-Cache": cacheStatus,
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          "Pragma": "no-cache",
          "Expires": "0"
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
