# Loading Screen Assets (`beta`)

이 폴더에 이미지를 업로드하면 베타 대시보드 로딩 화면에 자동으로 적용됩니다.

1. **초기 중앙 로고 (슈퍼셀 로고 자리)**
   - 파일명: `intro-logo.jpg` (`.png`, `.webp`, `.jpeg`, `.svg` 모두 지원)
   - 검은 배경 중앙에서 반짝이며 등장합니다.

2. **로딩 아트워크 배경 (여러 장 중 랜덤 1개 표시)**
   - **방법 A (파일명 규칙)**: `artwork1.png`, `artwork2.jpg`, `artwork3.webp` ... (`artwork` 및 `artwork1`~`artwork10` 지원) 형태로 여러 장 올리면 매 접속 시 그중 1장을 랜덤으로 표시합니다.
   - **방법 B (`artworks.json` 사용)**: 원하는 파일명 그대로 올린 뒤, 같은 폴더에 `artworks.json` 파일을 만들어 `["my-art-a.jpg", "my-art-b.png"]`처럼 적어두면 그 목록에서 랜덤으로 1장을 선택합니다.
