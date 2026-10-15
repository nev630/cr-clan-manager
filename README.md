# 👑 클래시 로얄 클랜 대표 관리기 (CR Clan Manager Pro)

클래시 로얄(Clash Royale) 클랜 대표 및 공동대표, 임원진을 위한 **실시간 클랜원 활동성 모니터링 & 스마트 클랜원 관리 웹 애플리케이션**입니다.  
별도의 백엔드 서버 설치 없이 **GitHub Pages**에 바로 업로드하여 브라우저에서 편리하게 사용할 수 있습니다.

---

## 🌟 주요 핵심 기능

### 1. 3대 핵심 지표 한눈에 확인
- **주간 지원량(Donations)**: 이번 주 기여한 지원량 및 받은 지원량 비율 표시
- **최근 7일 게임 횟수(Recent 7-Day Battles)**: 출석만 하고 게임은 안 하는지 vs 실제 활발히 플레이하는지 시각화 게이지 바 제공
- **마지막 접속 일자(Last Seen)**: "방금 전", "3시간 전", "4일 전" 등 실시간 상대 시간 및 정확한 일시 툴팁 제공

### 2. 🚨 스마트 추방(강퇴) 및 주의 권장 엔진
- 클랜 규칙(예: 미접속 4일 이상, 주간 지원량 30 미만, 주간 게임 0회 등)에 부합하는 클랜원을 자동 판별하여 배지 표시
- **대표 맞춤 기준치 설정(⚙️)**: 클랜마다 다른 강퇴/경고 기준을 모달에서 언제든지 자유롭게 조정 가능

### 3. 📢 카톡/디스코드 공지문 원클릭 자동 생성
- **강퇴 대상자 명단 공지**: 클릭 한 번으로 대상 멤버, 사유, 태그가 정리된 공지 텍스트 자동 작성 및 클립보드 복사
- **주간 지원왕 명예의 전당**: 1~5위 지원왕 멤버 칭찬 공지 자동 생성

### 4. 📊 엑셀 / CSV 다운로드 (한글 완벽 호환)
- 전체 클랜원 명단(닉네임, 태그, 직책, 트로피, 상태, 마지막 접속, 최근 7일 배틀수, 지원량, 클랜전 덱, 대표 메모)을 UTF-8 BOM 인코딩이 적용된 CSV 파일로 다운로드 (엑셀에서 글자 깨짐 없음)

### 5. 📝 대표 전용 로컬 메모장
- 클랜원별로 "시험 기간", "군 휴가 복귀 예정", "경고 1회 부여" 등 개인 메모를 작성하면 브라우저에 안전하게 영구 저장

### 6. 📈 데이터 시각화 차트
- 주간 지원량 Top 7 랭킹 막대 차트
- 클랜원 마지막 접속 분포(오늘 / 1~3일 / 4~6일 / 7일 이상 유령) 도넛 차트

### 7. 📱 테이블 뷰 & 모바일 카드 뷰 완벽 지원
- PC 및 태블릿에서는 고밀도 데이터 테이블로, 스마트폰에서는 터치하기 편한 카드 뷰로 자유롭게 전환

---

## 🚀 GitHub Pages 1분 배포 가이드

본 프로그램은 순수 프론트엔드 정적 웹 앱(Static Web App)으로 빌드 과정 없이 GitHub Pages에서 즉시 동작합니다.

### 1단계: GitHub 저장소(Repository) 생성
1. [GitHub](https://github.com)에 로그인 후 **New repository**를 클릭합니다.
2. Repository name을 입력합니다 (예: `cr-clan-manager`).
3. **Public**을 선택하고 **Create repository**를 누릅니다.

### 2단계: 코드 푸시(Upload)
터미널(또는 Git Bash)에서 현재 프로젝트 폴더로 이동한 후 아래 명령어를 입력합니다:

```bash
git init
git add .
git commit -m "feat: Clash Royale Clan Manager 초기 배포"
git branch -M main
git remote add origin https://github.com/<본인의-깃허브-아이디>/<저장소-이름>.git
git push -u origin main
```

### 3단계: GitHub Pages 켜기
1. 생성한 GitHub 저장소의 **Settings** 메뉴로 이동합니다.
2. 좌측 메뉴에서 **Pages**를 클릭합니다.
3. **Build and deployment** 항목의 **Source**를 `Deploy from a branch`로 선택합니다.
4. **Branch**를 `main` 브랜치, 폴더는 `/(root)`로 지정하고 **Save**를 누릅니다.
5. 약 1분 후 상단에 나오는 배포 URL(`https://<아이디>.github.io/<저장소-이름>/`)로 접속하면 끝!

---

## 🔑 클래시 로얄 API 및 CORS 프록시 연동 방법

슈퍼셀(Supercell) 공식 API는 브라우저 직접 요청 시 CORS 정책 및 IP 제한이 적용됩니다. 본 프로그램은 이를 해결하기 위해 3가지 방식을 모두 지원합니다.

### 방법 1: Cloudflare Worker 프록시 사용 (가장 추천 / 완전 무료 / 3분 완성)
Cloudflare Workers는 하루 10만 건 무료이며, 유동 IP 문제를 완벽하게 해결해 줍니다.

1. [Cloudflare 대시보드](https://dash.cloudflare.com)에 회원가입 후 로그인합니다.
2. **Workers & Pages** -> **Create application** -> **Create Worker** 클릭
3. 프로젝트 내 `worker/cloudflare-worker.js` 파일의 전체 내용을 Worker 코드 에디터에 붙여넣기합니다.
4. (선택 사항) Worker의 **Settings** -> **Variables and Secrets**에 아래 환경변수 추가:
   - Variable name: `CR_API_KEY`
   - Value: Supercell Developer Portal에서 발급받은 API 키
5. **Deploy**를 클릭하면 `https://<워커이름>.<아이디>.workers.dev` 주소가 발급됩니다.
6. 본 웹 앱 우측 상단 톱니바퀴(⚙️) 설정에서:
   - **CORS 프록시 연결 방식**: `Cloudflare Worker 프록시` 선택
   - **Cloudflare Worker 프록시 주소**: 위에서 발급받은 URL 입력
   - **클랜 태그**: 내 클랜 태그(예: `#2Y9PQ8V0`) 입력 후 저장!

### 방법 2: 공용 프록시 사용 (간편 설정)
1. 웹 앱 우측 상단 ⚙️ 설정 아이콘 클릭
2. **CORS 프록시 연결 방식**을 `corsproxy.io` 또는 `allorigins.win`으로 선택
3. Supercell API Token 입력 후 저장

### 방법 3: 체험 모드 (Demo Mode)
- API 키나 클랜 태그 설정 없이도 상단의 **[데모 데이터]** 버튼을 누르면 즉시 48명의 리얼한 한국 클랜원 샘플 데이터가 로드되어 모든 기능(필터링, 강퇴 추천, 공지문 복사, 차트, CSV 다운로드)을 바로 테스트해볼 수 있습니다.

---

## 🛠️ 기술 스택
- **HTML5 & CSS3** (Vanilla Modern JS, 반응형 UI)
- **Tailwind CSS** (현대적인 다크 모드 & 글래스모피즘 디자인)
- **Chart.js** (지원량 및 접속 분포 통계 시각화)
- **Lucide Icons** (직관적인 벡터 아이콘)
- **Supercell Clash Royale Official API** 호환

---

## 📜 라이선스 안내
본 애플리케이션은 팬 콘텐츠 정책(Fan Content Policy)에 따라 제작된 비공식 팬 프로젝트입니다.
Clash Royale 및 Supercell은 본 프로젝트와 무관하며 보증하지 않습니다.
