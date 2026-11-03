/**
 * Clash Royale API Cloudflare Worker Proxy (v1.2.0 - Oracle Cloud Always Free 전용 프록시 연동)
 * 
 * [목적]
 * 1. 브라우저의 CORS(Cross-Origin Resource Sharing) 제한 해결
 * 2. 슈퍼셀 Developer API의 IP 제한(유동 IP 문제)을 해결하기 위해
 *    고정 IP(168.110.63.115)를 제공하는 오라클 서울 Always Free 전용 서버 경유
 * 3. 3자 무료 프록시(RoyaleAPI)의 SSL 만료/장애(HTTP 525) 위험 완전 차단 및 국내망 직통 지연시간 대폭 개선
 * 4. Cloudflare Error 1003(Direct IP Access Not Allowed) 방지를 위한 sslip.io 자동 DNS 도메인 적용
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
        message: "Clash Royale API Proxy (Oracle Dedicated Instance) is running smoothly!",
        timestamp: new Date().toISOString()
      }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    // 2. 오라클 서울 Always Free 인스턴스(고정 IP: 168.110.63.115, Nginx 80)로 전달
    // ※ Cloudflare Error 1003(Raw IP 차단) 방지 및 포트 80 웹표준 통신 적용
    const targetPath = url.pathname.startsWith("/v1") ? url.pathname : `/v1${url.pathname}`;
    const targetUrl = `http://168.110.63.115.sslip.io${targetPath}${url.search}`;

    try {
      // 오라클 서버로 프록시 요청 (오라클 내부 Node.js 프록시가 슈퍼셀 API 토큰을 부착하여 직접 호출)
      const apiResponse = await fetch(targetUrl, {
        method: request.method,
        headers: {
          "Accept": "application/json"
        }
      });

      const responseBody = await apiResponse.text();

      // 3. CORS 및 캐시 헤더를 붙여서 응답 반환
      return new Response(responseBody, {
        status: apiResponse.status,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": corsOrigin,
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"
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
