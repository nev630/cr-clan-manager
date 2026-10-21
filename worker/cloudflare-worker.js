/**
 * Clash Royale API Cloudflare Worker Proxy
 * 
 * [목적]
 * 1. 브라우저의 CORS(Cross-Origin Resource Sharing) 제한 해결
 * 2. Supercell Developer API의 IP 제한(유동 IP 문제) 해결
 * 3. 클라이언트 코드에 Secret API Key를 직접 노출하지 않고 안전하게 호출 가능
 * 4. [보안 강화] 허가되지 않은 도메인(Origin)에서의 API Key 무단 도용 및 프록시 남용 방지
 * 
 * [Cloudflare Worker 무료 배포 방법]:
 * 1. https://dash.cloudflare.com 회원가입/로그인 (완전 무료)
 * 2. Workers & Pages -> Create Application -> Create Worker 클릭
 * 3. 이 파일의 전체 코드를 복사하여 Worker 에디터에 붙여넣기
 * 4. Settings -> Variables 에서 시크릿 환경변수 등록:
 *    - Name: CR_API_KEY
 *    - Value: Supercell Developer Portal에서 발급받은 API Key
 *    (선택 사항) ALLOWED_ORIGIN: "https://nev630.github.io" (지정하지 않아도 기본 허용됨)
 * 5. 'Deploy' 클릭 후 생성된 *.workers.dev 주소를 클랜 관리기 설정창에 입력하면 끝!
 */

const DEFAULT_ALLOWED_ORIGINS = [
  "https://nev630.github.io",
  "http://localhost:3000",
  "http://localhost:5500",
  "http://localhost:8080",
  "http://127.0.0.1:5500",
  "http://127.0.0.1:8080"
];

function isOriginAllowed(origin, env) {
  if (!origin) return false;
  const originLower = origin.toLowerCase().trim();

  // 1. Worker 환경변수 ALLOWED_ORIGIN 설정 확인
  if (env.ALLOWED_ORIGIN) {
    if (env.ALLOWED_ORIGIN === "*") return true;
    const envOrigins = env.ALLOWED_ORIGIN.split(",").map(o => o.trim().toLowerCase());
    if (envOrigins.includes(originLower)) return true;
  }

  // 2. 기본 허용 도메인 및 로컬 개발 환경 검증
  if (DEFAULT_ALLOWED_ORIGINS.some(allowed => allowed.toLowerCase() === originLower)) {
    return true;
  }

  // 3. GitHub Pages 서브도메인 (*.github.io) 허용
  if (originLower.endsWith(".github.io")) {
    return true;
  }

  return false;
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin");
    const allowed = isOriginAllowed(origin, env);
    const corsOrigin = allowed ? origin : (env.ALLOWED_ORIGIN || "https://nev630.github.io");

    // 1. CORS Preflight 요청 처리
    if (request.method === "OPTIONS") {
      if (origin && !allowed) {
        return new Response(JSON.stringify({ error: "Origin Not Allowed" }), {
          status: 403,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "null"
          }
        });
      }

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

    // IP 확인용 진단 엔드포인트
    if (url.pathname === "/ip") {
      try {
        const ipRes = await fetch("https://api.ipify.org?format=json");
        const ipData = await ipRes.json();
        return new Response(JSON.stringify({
          workerIp: ipData.ip,
          message: "Supercell Developer Portal의 Allowed IP Addresses에 이 IP를 등록하시면 됩니다."
        }, null, 2), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "X-Content-Type-Options": "nosniff"
          }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: "Failed to detect IP" }), {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
    }

    // 기본 핑/테스트 (헬스체크)
    if (url.pathname === "/" || url.pathname === "") {
      return new Response(JSON.stringify({
        status: "online",
        message: "Clash Royale API CORS Proxy is running smoothly!",
        timestamp: new Date().toISOString()
      }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "X-Content-Type-Options": "nosniff"
        }
      });
    }

    // 2. API 키 우선순위 결정:
    // (1) 클라이언트 헤더(Authorization or x-api-key) -> (2) Worker 환경변수(CR_API_KEY)
    let clientKey = null;
    const authHeader = request.headers.get("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      clientKey = authHeader.replace("Bearer ", "").trim();
    } else {
      clientKey = request.headers.get("x-api-key");
    }

    let apiKey = clientKey || env.CR_API_KEY;

    // [보안 강화] Worker 환경변수에 저장된 관리자 API Key를 사용할 때는 반드시 인가된 Origin이어야 함
    if (!clientKey && env.CR_API_KEY) {
      if (origin && !allowed) {
        return new Response(JSON.stringify({
          error: "Forbidden",
          message: "Unauthorized origin cannot use server API key."
        }), {
          status: 403,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "null",
            "X-Content-Type-Options": "nosniff"
          }
        });
      }
    }

    if (!apiKey) {
      return new Response(JSON.stringify({
        error: "Missing API Key",
        message: "API Key is required. Set CR_API_KEY secret in Cloudflare or pass Authorization: Bearer <TOKEN> header."
      }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": corsOrigin
        }
      });
    }

    // 3. Supercell API Base URL 생성 (/v1/...)
    // 고정 IP(45.79.218.79)를 제공하는 RoyaleAPI 프록시 경유
    const targetPath = url.pathname.startsWith("/v1") ? url.pathname : `/v1${url.pathname}`;
    const targetUrl = `https://proxy.royaleapi.dev${targetPath}${url.search}`;

    try {
      // 4. Supercell API로 프록시 요청
      const apiResponse = await fetch(targetUrl, {
        method: request.method,
        headers: {
          "Accept": "application/json",
          "Authorization": `Bearer ${apiKey}`
        }
      });

      const responseBody = await apiResponse.text();

      // 5. CORS 헤더를 붙여서 응답 반환
      return new Response(responseBody, {
        status: apiResponse.status,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": corsOrigin,
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
          "Pragma": "no-cache",
          "Expires": "0",
          "X-Content-Type-Options": "nosniff"
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
