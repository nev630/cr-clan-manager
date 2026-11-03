/**
 * Good Fellas Clan Manager - Oracle Cloud Dedicated Proxy Server (server.js v1.4.0)
 * 
 * [주요 기능 & 최적화 (v1.4.0)]
 * 1. On-Demand In-Memory TTL 캐시 적용:
 *    - 클랜 정보: 60초 TTL
 *    - 배틀로그: 120초(2분) TTL
 *    - 슈퍼셀 공식 API 429(Rate Limit) 원천 차단 및 N배 트래픽 완충
 * 2. 신규 단일 통합 엔드포인트 (/v1/clans/:clanTag/summary):
 *    - 클랜 기본 정보 + 50명 클랜원의 최근 배틀 시각/유형을 서버에서 병렬 수집 후 1번에 반환
 *    - 클라이언트에서 50번 순차 요청하던 것을 단 1회 네트워크 요청으로 축소
 * 3. 보안 및 안정성 강화:
 *    - SUPERCELL_API_KEY 환경변수 지원 (process.env.SUPERCELL_API_KEY)
 *    - IP별 기본 요청 제한(Rate Limiting) 내장
 * 
 * [실행 환경]
 * - Oracle Cloud Always Free Ubuntu 24.04 (South Korea Central - Seoul)
 * - Nginx (포트 80) -> Node.js (포트 3000) 리버스 프록시 연동
 */

const express = require('express');
const app = express();

// Supercell Developer Portal에서 발급받은 API 토큰 (환경변수 우선)
const SUPERCELL_KEY = process.env.SUPERCELL_API_KEY || 'YOUR_SUPERCELL_API_KEY';

// 1. CORS 허용 헤더 설정
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, Pragma');
  res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// 2. 가벼운 인메모리 요청 제한기 (IP당 초당 최대 30회)
const rateLimitMap = new Map();
app.use((req, res, next) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, resetAt: now + 1000 };

  if (now > entry.resetAt) {
    entry.count = 1;
    entry.resetAt = now + 1000;
  } else {
    entry.count++;
  }
  rateLimitMap.set(ip, entry);

  if (entry.count > 30) {
    return res.status(429).json({ error: 'Too Many Requests from this IP' });
  }

  // 주기적 정리
  if (rateLimitMap.size > 2000) {
    for (const [k, v] of rateLimitMap.entries()) {
      if (now > v.resetAt) rateLimitMap.delete(k);
    }
  }
  next();
});

// 3. 인메모리 TTL 캐시 시스템
const cache = new Map();

function getCached(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    cache.delete(key);
    return null;
  }
  return item.data;
}

function setCache(key, data, ttlSeconds) {
  cache.set(key, {
    data,
    expiresAt: Date.now() + (ttlSeconds * 1000)
  });
  
  if (cache.size > 1000) {
    const now = Date.now();
    for (const [k, v] of cache.entries()) {
      if (now > v.expiresAt) cache.delete(k);
    }
  }
}

// 4. 슈퍼셀 API 공통 호출 함수
async function fetchSupercell(endpoint) {
  const targetUrl = `https://api.clashroyale.com${endpoint}`;
  const response = await fetch(targetUrl, {
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${SUPERCELL_KEY}`
    }
  });

  const rawText = await response.text();
  if (!response.ok) {
    const err = new Error(`Supercell API error (${response.status}): ${rawText}`);
    err.status = response.status;
    err.rawText = rawText;
    throw err;
  }

  try {
    return JSON.parse(rawText);
  } catch (e) {
    return null;
  }
}

// 5. 신규 단일 통합 엔드포인트 (/v1/clans/:clanTag/summary)
// 클랜 정보 + 50명 클랜원의 최근 배틀 시각 및 상태를 서버에서 캐시를 활용해 1번에 번들링
app.get('/v1/clans/:clanTag/summary', async (req, res) => {
  try {
    let tag = req.params.clanTag.trim();
    if (!tag.startsWith('#')) tag = '#' + tag;
    const encodedTag = encodeURIComponent(tag);
    const summaryCacheKey = `clan_summary_${encodedTag}`;

    const cachedSummary = getCached(summaryCacheKey);
    if (cachedSummary) {
      res.setHeader('X-Cache-Status', 'HIT');
      return res.json(cachedSummary);
    }

    // A. 클랜 기본 정보 조회
    const clanData = await fetchSupercell(`/v1/clans/${encodedTag}`);
    if (!clanData || !clanData.memberList) {
      return res.status(502).json({ error: 'Failed to retrieve clan members' });
    }

    // B. 멤버별 최근 배틀로그 병렬 수집 (서버 캐시 우선 적용)
    const members = clanData.memberList;
    const chunkSize = 10;

    for (let i = 0; i < members.length; i += chunkSize) {
      const chunk = members.slice(i, i + chunkSize);
      await Promise.allSettled(chunk.map(async (member) => {
        if (!member || !member.tag) return;
        const playerEncoded = encodeURIComponent(member.tag);
        const playerCacheKey = `battlelog_${playerEncoded}`;

        let battlelog = getCached(playerCacheKey);
        if (!battlelog) {
          try {
            battlelog = await fetchSupercell(`/v1/players/${playerEncoded}/battlelog`);
            if (Array.isArray(battlelog)) {
              setCache(playerCacheKey, battlelog, 120); // 배틀로그 2분 TTL
            }
          } catch (e) {
            // 개별 실패 시 건너뜀
          }
        }

        if (Array.isArray(battlelog) && battlelog.length > 0) {
          member.lastBattleTime = battlelog[0].battleTime;
          member.lastBattleType = battlelog[0].type || 'Battle';
        }
      }));
    }

    // C. 60초간 서버 캐싱 후 반환
    setCache(summaryCacheKey, clanData, 60);
    res.setHeader('X-Cache-Status', 'MISS');
    res.json(clanData);
  } catch (err) {
    console.error('Error fetching clan summary:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// 6. 범용 슈퍼셀 API 프록시 엔드포인트 (/v1/...) - TTL 캐시 자동 적용
app.use('/v1', async (req, res) => {
  try {
    const rawUrl = req.originalUrl;
    // _t 타임스탬프 캐시버스터를 제거하여 정규화된 캐시 키 생성
    const cleanUrl = rawUrl.replace(/([?&])_t=\d+(&?)/, '$1').replace(/[?&]$/, '');
    const cacheKey = `proxy_${cleanUrl}`;

    const cachedData = getCached(cacheKey);
    if (cachedData) {
      res.setHeader('X-Cache-Status', 'HIT');
      return res.json(cachedData);
    }

    const data = await fetchSupercell(cleanUrl);

    // 엔드포인트 유형별 TTL 차등 적용
    let ttl = 60; // 기본 1분
    if (cleanUrl.includes('/battlelog')) ttl = 120; // 배틀로그 2분

    setCache(cacheKey, data, ttl);
    res.setHeader('X-Cache-Status', 'MISS');
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// 7. 헬스체크 / 핑 테스트 엔드포인트
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    version: '1.4.0',
    cachedEntries: cache.size,
    message: 'Good Fellas Dedicated Oracle CR Proxy is running with In-Memory TTL Cache!'
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Proxy server v1.4.0 running on port ${PORT}`));
