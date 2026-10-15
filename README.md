# 👑 Good Fellas 클랜 관리 대시보드 (Good Fellas Clan Dashboard)

클래시 로얄(Clash Royale) 클랜 **Good Fellas (`#G890J9JC`)**의 실시간 클랜원 활동성 모니터링 및 운영을 위한 **초고속 웹 대시보드**입니다.  
별도의 무거운 백엔드 서버 없이 **GitHub Pages**와 **Cloudflare Worker** 프록시를 통해 100% 무료로 운영됩니다.

🔗 **배포 웹사이트**: [https://nev630.github.io/cr-clan-manager/](https://nev630.github.io/cr-clan-manager/)

---

## 🌟 주요 기능 및 화면 구성

### 1. 🏆 주간 지원 기여도 Top 7 올림픽 단상 (포디움)
- 클랜 내 주간 카드 지원 기여도가 가장 높은 멤버들을 위한 **시상대 단상(Podium)** 시스템:
  - **1위 (금메달)**: 중앙 최상단 왕관 및 하이라이트
  - **2위 (은메달)**: 좌측 2위 단상 배치
  - **3위 (동메달)**: 우측 3위 단상 배치
- **4위 ~ 7위 러너 리스트**: 시상대 하단에 간결한 카드 형태로 순위와 지원량을 함께 표기합니다.

### 2. 🍩 클랜원 접속 분포 시각화 (도넛 차트)
- 클랜원들의 최근 접속 시점을 3단계로 분류하여 직관적인 도넛 차트로 제공:
  - **오늘 접속 (초록)**: 24시간 이내 접속한 활성 유저
  - **1 ~ 2일 전 (노랑)**: 정상 활동 유저
  - **3일 이상 미접속 (빨강)**: 장기 미접속(관리 대상) 유저

### 3. 📊 핵심 3대 지표 스트립
- **전체 클랜원**: 현재 인원수 및 신규 영입 가능 여유 자리 즉시 확인 (`47 / 50`, `여유 자리: 3석`)
- **주간 총 지원량**: 슈퍼셀 공식 API의 `donationsPerWeek` 필드를 직접 연동하여 **로얄API 및 인게임 수치와 100% 일치 (`7,600개`)** 및 1인 평균 지원량 계산
- **3일+ 미접속 경고**: 장기 미접속 인원수 표기 및 클릭 시 즉시 해당 대상자만 모아보는 퀵 필터 기능 연동

### 4. 📱 모바일 최적화 고밀도 카드 뷰 & PC 데이터 테이블
- **PC / 태블릿 환경 (반응형 테이블)**:
  - 순위 (`#`), 클랜원(닉네임, 직책 배지, 태그, 트로피), 마지막 접속(상태 닷 및 상세 일시 툴팁), 주간 지원량(지원/받음)을 정돈된 테이블로 제공
- **스마트폰 모바일 환경 (2분할 고밀도 카드)**:
  - 가로 스크롤 없이 한 손으로 쾌적하게 볼 수 있는 카드 리스트 제공
  - 상단: 순위 + 닉네임 + 직책 배지 + 트로피
  - 하단: **2분할 그리드 (좌측: 마지막 접속 상대시간 / 우측: 주간 지원량 및 받은 수치)**로 시원하고 가독성 높은 레이아웃

### 5. ⚡ 초고속 단일 요청 실시간 동기화 & 오버레이
- 기존 40~50회에 달하던 반복 배틀로그 조회를 제거하고, **단 1회의 초고속 API 호출(0.5초 이내 완료)**로 모든 클랜 데이터를 즉시 동기화합니다.
- 첫 사이트 접속 시 이전 캐시나 부정확한 수치가 번쩍이며 노출되지 않도록 **부드러운 실시간 동기화 오버레이 팝업**을 제공합니다.

### 6. 🔍 스마트 검색 및 다각도 정렬
- **실시간 검색**: 클랜원 닉네임 및 플레이어 태그(#) 즉시 필터링
- **원클릭 필터 칩**:
  - `전체 클랜원`
  - `3일+ 미접속` (활동 저조자 모아보기)
  - `지원 저조 (50 미만)` (지원 미달자 모아보기)
- **정렬 옵션**: 지원량 순(많은/적은 순), 접속일자 순(최근/오래된 순), 트로피 높은 순

---

## 🏗️ 시스템 아키텍처

```
[사용자 브라우저]
       │
       │  (HTTPS / 정적 웹 호스팅)
       ▼
[GitHub Pages] (https://nev630.github.io/cr-clan-manager/)
       │
       │  (CORS 해결 & API Key 안전 캡슐화)
       ▼
[Cloudflare Worker 프록시] (https://green-disk-88a6.marble593812345.workers.dev)
       │
       │  (고정 IP 제공 & Supercell 공식 REST API)
       ▼
[Supercell Clash Royale API] (https://api.clashroyale.com/v1/clans/%23G890J9JC)
```

- **GitHub Pages**: 정적 자산(HTML, CSS, JS)만 서빙하므로 서버 유지비가 발생하지 않습니다.
- **Cloudflare Worker**: 브라우저의 CORS 제한을 우회하고, Supercell의 IP 화이트리스트 정책을 충족하며, 클라이언트 측에 API Secret Key를 노출하지 않고 안전하게 프록시합니다.

---

## 🔒 보안 점검 및 안전 수칙 (Security Guide)

### 1. 깃허브 개인 액세스 토큰 (PAT) 관리
* **점검 결과**: 레포지토리의 소스 코드, 커밋 기록, `.git/config` 등 모든 저장소 파일 내에 토큰 정보가 전혀 남아있지 않음을 확인했습니다.
* **필수 권고사항**: 이전 대화나 채팅 세션에서 한 번이라도 공유된 토큰은 즉시 만료시키는 것이 보안 원칙입니다.
  * [GitHub 토큰 관리 페이지](https://github.com/settings/tokens)로 이동하여 이전에 발급한 Personal Access Token을 **Delete(삭제)** 또는 **Revoke(회수)**해 주시기 바랍니다.

### 2. 슈퍼셀 API Key 안전 보관
* 슈퍼셀 Developer Portal에서 발급받은 API Key는 프론트엔드 코드(JavaScript)에 절대 하드코딩되지 않으며, **Cloudflare Worker의 암호화된 시크릿 환경 변수(`CR_API_KEY`)**로만 격리 저장되어 안전합니다.

### 3. XSS (크로스 사이트 스크립팅) 방어
* 외부 슈퍼셀 API에서 전달되는 클랜원 닉네임(`member.name`) 및 태그(`member.tag`)는 렌더링 직전 `escapeHtml()` 함수를 거쳐 `&`, `<`, `>`, `"`, `'` 문자가 철저히 이스케이프 처리되므로 악의적인 스크립트 삽입이 원천 차단됩니다.

### 4. Cloudflare Worker 프록시 보안 강화 (선택 사항)
* `worker/cloudflare-worker.js`의 CORS 설정(`Access-Control-Allow-Origin: *`)을 본인 저장소 도메인(`https://nev630.github.io`)으로 한정하면, 타인이 워커 URL을 도용하여 슈퍼셀 API 일일 할당량을 소모시키는 것을 완전히 방지할 수 있습니다.

---

## 🛠️ 기술 스택
- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3
- **Styling**: Tailwind CSS (CDN), Custom Glassmorphic Dark UI
- **Visualization**: Chart.js (접속 분포 도넛 차트)
- **Icons**: Lucide Icons
- **Proxy & Serverless**: Cloudflare Workers
- **Hosting**: GitHub Pages

---

## 📜 라이선스 및 면책조항
본 프로젝트는 슈퍼셀의 [팬 콘텐츠 정책(Fan Content Policy)](https://supercell.com/en/fan-content-policy/)에 따라 비상업적 목적으로 제작된 오픈소스 팬 프로젝트입니다.  
Clash Royale 및 Supercell은 본 프로젝트와 무관하며 보증하지 않습니다.
