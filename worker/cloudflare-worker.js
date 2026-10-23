/**
 * Clash Royale API Cloudflare Worker Proxy
 * 
 * [목적]
 * 1. 브라우저의 CORS(Cross-Origin Resource Sharing) 제한 해결
 * 2. Supercell Developer API의 IP 제한(유동 IP 문제) 해결
 * 3. 클라이언트 코드에 Secret API Key를 직접 노출하지 않고 안전하게 호출 가능
 * 
 * [Cloudflare Worker 무료 배포 방법 (3분 소요)]:
 * 1. https://dash.cloudflare.com 회원가입/로그인 (완전 무료)
 * 2. Workers & Pages -> Create Application -> Create Worker 클릭
 * 3. 이 파일의 전체 코드를 복사하여 Worker 에디터에 붙여넣기
 * 4. Settings -> Variables 에서 시크릿 환경변수 등록:
 *    - Name: CR_API_KEY
 *    - Value: Supercell Developer Portal에서 발급받은 API Key
 *    (또는 클라이언트가 Authorization 헤더로 넘기게 할 수도 있습니다)
 * 5. 'Deploy' 클릭 후 생성된 *.workers.dev 주소를 클랜 관리기 설정창에 입력하면 끝!
 */

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const allowedOrigin = env.ALLOWED_ORIGIN || "*";
    const corsOrigin = (allowedOrigin === "*" || origin === allowedOrigin) ? (origin || "*") : allowedOrigin;

    // 1. CORS Preflight 요청 처리
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
    
    // IP 확인용 진단 엔드포인트
    if (url.pathname === "/ip") {
      try {
        const ipRes = await fetch("https://api.ipify.org?format=json");
        const ipData = await ipRes.json();
        return new Response(JSON.stringify({
          workerIp: ipData.ip,
          message: "Supercell Developer Portal의 Allowed IP Addresses에 이 IP를 등록하시면 됩니다."
        }, null, 2), {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: "Failed to detect IP" }), {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
    }

    // 기본 핑/테스트
    if (url.pathname === "/" || url.pathname === "") {
      return new Response(JSON.stringify({
        status: "online",
        message: "Clash Royale API CORS Proxy is running smoothly!",
        timestamp: new Date().toISOString()
      }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    // 2. Supercell API Base URL 생성 (/v1/...)
    // 고정 IP(45.79.218.79)를 제공하는 RoyaleAPI 프록시 경유
    const targetPath = url.pathname.startsWith("/v1") ? url.pathname : `/v1${url.pathname}`;
    const targetUrl = `https://proxy.royaleapi.dev${targetPath}${url.search}`;

    // 3. API 키 우선순위:
    // (1) Worker 환경변수(CR_API_KEY) -> (2) 클라이언트 헤더(Authorization or x-api-key)
    let apiKey = env.CR_API_KEY;
    if (!apiKey) {
      const authHeader = request.headers.get("Authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) {
        apiKey = authHeader.replace("Bearer ", "").trim();
      } else {
        apiKey = request.headers.get("x-api-key");
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
