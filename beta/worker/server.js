/**
 * Good Fellas Clan Manager - Oracle Cloud Dedicated Proxy Server (server.js v1.8.0)
 * 
 * [주요 기능 & 최적화 (v1.8.0)]
 * 1. In-Flight Request Coalescing (동시 요청 병합):
 *    - 캐시 만료 시점에 다수 사용자가 동시 접속하더라도 진행 중인 동일 요청 Promise를 공유하여
 *      Supercell API 중복 호출(Request Stampede) 및 429 에러를 원천 차단
 * 2. On-Demand In-Memory TTL 캐시 & Stale-Fallback 메커니즘:
 *    - 클랜 정보: 20초 TTL / 배틀로그: 30초 TTL (호출 실패 시 Stale 캐시 안전 보존)
 * 3. 신규 단일 통합 엔드포인트 (/v1/clans/:clanTag/summary):
 *    - 클랜 기본 정보 + 50명 클랜원의 최근 배틀 시각/유형을 서버에서 병렬 수집 후 1번에 번들링
 */

const express = require('express');
const app = express();

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
  const forwarded = req.headers['x-forwarded-for'];
  const ip = (forwarded ? String(forwarded).split(',')[0].trim() : null) || req.socket.remoteAddress || 'unknown';
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

  if (rateLimitMap.size > 2000) {
    for (const [k, v] of rateLimitMap.entries()) {
      if (now > v.resetAt) rateLimitMap.delete(k);
    }
  }
  next();
});

// 3. 인메모리 TTL 캐시 및 동시 요청 병합(In-Flight Coalescing) 맵
const cache = new Map();
const inFlightRequests = new Map();

function getCached(key, allowStale = false) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    if (allowStale) return item.data;
    return null;
  }
  return item.data;
}

function setCache(key, data, ttlSeconds) {
  cache.set(key, {
    data,
    expiresAt: Date.now() + (ttlSeconds * 1000)
  });

  if (cache.size > 1500) {
    const now = Date.now();
    for (const [k, v] of cache.entries()) {
      if (now > v.expiresAt + 600000) cache.delete(k);
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

// 5. 신규 단일 통합 엔드포인트 (/v1/clans/:clanTag/summary) + In-Flight Coalescing 적용
app.get('/v1/clans/:clanTag/summary', async (req, res) => {
  try {
    let tag = req.params.clanTag.trim();
    if (!tag.startsWith('#')) tag = '#' + tag;
    const encodedTag = encodeURIComponent(tag);
    const summaryCacheKey = `clan_summary_${encodedTag}`;

    const force = req.query.force === '1' || req.query.force === 'true';
    const cachedSummary = !force ? getCached(summaryCacheKey) : null;
    if (cachedSummary) {
      res.setHeader('X-Cache-Status', 'HIT');
      return res.json(cachedSummary);
    }

    // 이미 동일한 클랜 요약 수집이 진행 중이면 중복 호출하지 않고 완료될 Promise를 공유
    if (!force && inFlightRequests.has(summaryCacheKey)) {
      const coalescedData = await inFlightRequests.get(summaryCacheKey);
      res.setHeader('X-Cache-Status', 'COALESCED');
      return res.json(coalescedData);
    }

    const buildSummaryPromise = (async () => {
      const clanData = await fetchSupercell(`/v1/clans/${encodedTag}`);
      if (!clanData || !clanData.memberList) {
        const err = new Error('Failed to retrieve clan members');
        err.status = 502;
        throw err;
      }

      const members = clanData.memberList;
      const chunkSize = 10;

      for (let i = 0; i < members.length; i += chunkSize) {
        const chunk = members.slice(i, i + chunkSize);
        await Promise.allSettled(chunk.map(async (member) => {
          if (!member || !member.tag) return;
          const playerEncoded = encodeURIComponent(member.tag);
          const playerCacheKey = `battlelog_${playerEncoded}`;

          let battlelog = (!force ? getCached(playerCacheKey) : null);
          if (!battlelog) {
            try {
              const fetched = await fetchSupercell(`/v1/players/${playerEncoded}/battlelog`);
              if (Array.isArray(fetched) && fetched.length > 0) {
                battlelog = fetched;
                setCache(playerCacheKey, battlelog, 30);
              }
            } catch (e) {
              battlelog = getCached(playerCacheKey, true);
            }
          }

          if (Array.isArray(battlelog) && battlelog.length > 0) {
            member.lastBattleTime = battlelog[0].battleTime;
            member.lastBattleType = battlelog[0].type || 'Battle';
          }
        }));

        if (i + chunkSize < members.length) {
          await new Promise(r => setTimeout(r, 60));
        }
      }

      setCache(summaryCacheKey, clanData, 20);
      return clanData;
    })();

    inFlightRequests.set(summaryCacheKey, buildSummaryPromise);

    try {
      const resultData = await buildSummaryPromise;
      res.setHeader('X-Cache-Status', 'MISS');
      res.json(resultData);
    } finally {
      inFlightRequests.delete(summaryCacheKey);
    }
  } catch (err) {
    console.error('Error fetching clan summary:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// 6. 범용 슈퍼셀 API 프록시 엔드포인트 (/v1/...) - TTL 캐시 및 동시 요청 병합 적용
app.use('/v1', async (req, res) => {
  try {
    const rawUrl = req.originalUrl;
    const cleanUrl = rawUrl
      .replace(/([?&])_t=\d+(&?)/, '$1')
      .replace(/([?&])force=(?:1|true)(&?)/, '$1')
      .replace(/[?&]+$/, '')
      .replace(/\?&/, '?')
      .replace(/&&/, '&');

    const cacheKey = `proxy_${cleanUrl}`;

    const force = req.query.force === '1' || req.query.force === 'true';
    const cachedData = !force ? getCached(cacheKey) : null;
    if (cachedData) {
      res.setHeader('X-Cache-Status', 'HIT');
      return res.json(cachedData);
    }

    if (!force && inFlightRequests.has(cacheKey)) {
      const coalesced = await inFlightRequests.get(cacheKey);
      res.setHeader('X-Cache-Status', 'COALESCED');
      return res.json(coalesced);
    }

    const fetchPromise = (async () => {
      const data = await fetchSupercell(cleanUrl);
      let ttl = 20;
      if (cleanUrl.includes('/battlelog')) ttl = 30;
      setCache(cacheKey, data, ttl);
      return data;
    })();

    inFlightRequests.set(cacheKey, fetchPromise);

    try {
      const data = await fetchPromise;
      res.setHeader('X-Cache-Status', 'MISS');
      res.json(data);
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// 7. 헬스체크 / 핑 테스트 엔드포인트
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    version: '1.8.0',
    cachedEntries: cache.size,
    inFlightCount: inFlightRequests.size,
    message: 'Good Fellas Dedicated Oracle CR Proxy v1.8.0 is running with TTL Cache & Request Coalescing!'
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Proxy server v1.8.0 running on port ${PORT}`));
