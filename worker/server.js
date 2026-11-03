/**
 * Good Fellas Clan Manager - Oracle Cloud Dedicated Proxy Server (server.js)
 * 
 * [실행 환경]
 * - Oracle Cloud Always Free Ubuntu 24.04 (South Korea Central - Seoul)
 * - Nginx (포트 80) -> Node.js (포트 3000) 리버스 프록시 연동
 * - Supercell Clash Royale Official API 고정 IP 화이트리스트 통과용
 */

const express = require('express');
const app = express();

// Supercell Developer Portal에서 발급받은 API 토큰
const SUPERCELL_KEY = 'YOUR_SUPERCELL_API_KEY';

// 1. CORS 허용 헤더 설정
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// 2. 슈퍼셀 공식 API 엔드포인트 포워딩 (/v1/...)
app.use('/v1', async (req, res) => {
  try {
    const targetUrl = `https://api.clashroyale.com${req.originalUrl}`;
    const apiRes = await fetch(targetUrl, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${SUPERCELL_KEY}`
      }
    });
    const data = await apiRes.json();
    res.status(apiRes.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. 헬스체크 / 핑 테스트 엔드포인트
app.get('/', (req, res) => res.send('CR Proxy is running!'));

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Proxy running on port ${PORT}`));
