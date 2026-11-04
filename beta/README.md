# Good Fellas 클랜 관리 대시보드 (v1.4.5)

클래시 로얄(Clash Royale) 클랜 **Good Fellas** (`#G890J9JC`)의 실시간 클랜 관리 및 타 갤클 비교 대시보드입니다.

---

## ⚡ v1.4.5 전방위 버그 수정 & 백그라운드 동기화 최적화 & UI 정합성 확립

1. **백그라운드 배틀로그 보충 수집 정상화 & 신규/미배틀 유저 무한 폴링 방지 (`app.js`)**:
   - `onPartialData` 콜백 시 원본 데이터 참조 덮어쓰기로 인해 누락 멤버 추출이 누락되던 버그를 수정하여 백그라운드 핀포인트 수집(`fetchAllMembersBattleLogs`)이 항상 정상 동작하도록 보장했습니다.
   - 슈퍼셀 배틀 기록이 없는 클랜원에 대해 sentinel 기록(`time: "none"`)을 적용하여 매 20초 주기 폴링마다 개별 API를 무한 호출하던 네트워크/배터리 낭비를 원천 차단했습니다.
   - 로컬스토리지 캐시 키를 `cr_clan_battle_cache_v5`로 업그레이드하고 이전 v4 및 구버전 캐시를 자동 정리했습니다.

2. **Cloudflare Worker 엣지 무캐시 헤더 적용 & 실제 클라이언트 IP 전달 (`cloudflare-worker.js`)**:
   - `Cache-Control: no-store, no-cache, must-revalidate` 헤더를 강제 적용하여 엣지 및 브라우저 레벨의 HTTP 응답 캐싱 지연을 완전 해소했습니다.
   - 클라이언트 실제 IP(`CF-Connecting-IP` / `X-Forwarded-For`)를 오라클 백엔드로 정상 전달하여, 단일 IP로 오인되어 발생하던 프록시 서버의 `429 Too Many Requests` 일괄 차단 위험을 해결했습니다.

3. **오라클 프록시 서버 슈퍼셀 429 방지 & Stale-Fallback 보존 (`server.js`)**:
   - `/v1/clans/:clanTag/summary`에서 50명의 배틀로그를 10명 단위 청크로 수집할 때 청크 간 60ms 딜레이를 두어 슈퍼셀 API 초당 요청 제한(Rate Limit)을 완벽히 방지했습니다.
   - 만료된 캐시 항목도 개별 멤버 호출 실패 시 직전 정상 캐시(stale cache)로 활용할 수 있도록 보존 정책을 개선했습니다.
   - 범용 프록시 호출 시 내부 관리용 `force=1` 파라미터가 슈퍼셀로 전달되지 않도록 URL 정제 로직을 보완했습니다.

4. **비교 탭 커스텀 클랜 추가 & 새로고침 UI 복원 및 기본 갤클 프리셋 내장 (`index.html`, `api.js`)**:
   - `index.html`에 누락되어 있던 커스텀 갤클 추가 입력창(`input-custom-clan-tag`, `btn-add-compare-clan`) 및 비교 새로고침 버튼(`btn-refresh-compare`, `compare-refresh-icon`)을 정상 배치했습니다.
   - 네트워크 오류나 첫 진입 시에도 비교 탭이 빈 화면으로 나오지 않도록 3대 갤클(Good Fellas, Vandros, 딜넣는 도둑)의 기본 프리셋을 `api.js`에 자체 내장했습니다.

5. **모바일 검색/필터 빈 화면 안내 복원 & 미접속자 집계 기준 정합성 확립 (`app.js`)**:
   - 모바일 뷰(`window.innerWidth < 1024`)에서 검색 결과가 0건일 때 빈 공백 대신 "일치하는 클랜원이 없습니다" 안내 카드가 즉시 노출되도록 개선했습니다.
   - 상단 통계 칩(`updateStats`)과 필터 목록(`applyFilterAndRender`) 간의 활동 기록 미보유 멤버 처리 기준을 통일하여 수량 불일치 현상을 해소했습니다.

6. **반응형 리사이즈 대응, 차트 리사이즈 & 안전 가드 강화 (`app.js`, `index.html`)**:
   - 디바이스 가로/세로 회전 및 윈도우 리사이즈 이벤트 리스너를 추가하여 뷰 전환 시 테이블이 공백으로 남지 않도록 보완했습니다.
   - 탭 전환 시 차트 리사이즈(`resize()`)를 호출하여 레이아웃 붕괴를 방지했습니다.
   - 클랜 데이터 미수신 시 `c.name` null 참조 에러 방지 가드를 추가하고, 클랜원 3명 미만 시 시상대 초기화 로직을 보강했습니다.
   - `index.html` 내 스크립트 및 스타일시트 캐시 버스팅 파라미터를 `?v=1.4.5`로 갱신했습니다.

---

## 🏛️ 시스템 아키텍처 및 Oracle Cloud의 역할

본 프로젝트는 슈퍼셀(Supercell) 공식 API의 보안 정책과 고성능 실시간 처리를 위해 **Oracle Cloud + Cloudflare Worker** 하이브리드 아키텍처를 채택하고 있습니다.

### Oracle Cloud의 핵심 역할
1. **슈퍼셀 공식 API 고정 IP 화이트리스트 통과**:
   - 슈퍼셀 공식 개발자 포털은 API 키 발급 시 **인가된 고정 공인 IP(Static IP)**에서 들어오는 트래픽만 허용합니다.
   - 사용자 브라우저(동적 IP)나 일반 서버리스 환경(유동 IP)에서는 직접 호출이 불가능하므로, 고정 IP(`168.110.63.115`)가 제공되는 **Oracle Cloud Always Free (도쿄/서울 리전)** 전용 인스턴스가 슈퍼셀과 직접 통신하는 공식 관문 역할을 수행합니다.
2. **API 보안 키(Token) 은닉 및 무단 유출 방지**:
   - 클라이언트 브라우저에 개발자 토큰을 노출하지 않고, 오라클 서버 내부 환경변수(`SUPERCELL_API_KEY`)로 안전하게 보관하여 대행 인증합니다.
3. **CORS (Cross-Origin Resource Sharing) 해결**:
   - 웹 브라우저에서 공식 API 직접 호출 시 발생하는 보안 정책(CORS) 차단을 해소하기 위해 표준 허용 헤더를 부착하여 응답합니다.
4. **인메모리 On-Demand TTL 캐시 & 통합 단일 요약 엔드포인트 (`/summary`)**:
   - 클랜원 50명의 개별 배틀로그 조회를 클라이언트가 각각 호출할 경우 발생하는 429(Rate Limit) 병목을 방지하기 위해, 오라클 프록시 서버(`server.js`)에서 50명의 데이터를 한 번에 번들링하여 0.1초 만에 응답하는 통합 엔드포인트를 제공합니다.

---

## 🛠️ 기술 스택

- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3, Tailwind CSS, Chart.js, Lucide Icons
- **Proxy Server**: Oracle Cloud Always Free (Node.js Express + In-Memory Fast TTL Cache)
- **Edge Proxy**: Cloudflare Workers
- **Hosting**: GitHub Pages
