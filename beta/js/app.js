/**
 * Good Fellas Clan Manager - Core Application Logic (v1.4.4)
 * Mobile Optimized, Visual Charts & Gallery Clan Comparison
 * - 3분(180초) 현실적 '접속 중' 판정 윈도우 적용
 * - 트로피 변동 감지 완전 제거 및 슈퍼셀 lastSeen + 배틀로그 2중 검증 체계 확립
 * - 서버 요약 배틀로그 누락 멤버 선별적 백그라운드 보충 수집 적용
 */

console.log('%c[Good Fellas App] v1.6.8 - 이모지 풀 전수 검수 및 균일 스케일 9대 얼굴 클로즈업 풀 정비 완료', 'color: #10b981; font-weight: bold; font-size: 14px;');

const CR_EMOTES_POOL = [
  { name: "웃는 킹", url: "https://static.wikia.nocookie.net/clashroyale/images/8/84/HeHeHeHa.png/revision/latest?cb=20230915211717" },
  { name: "우는 킹", url: "https://static.wikia.nocookie.net/clashroyale/images/a/af/Crying_King.png/revision/latest?cb=20230915211808" },
  { name: "생각하는 호그라이더", url: "https://static.wikia.nocookie.net/clashroyale/images/b/b0/Hog_Rider_Thinking.png/revision/latest?cb=20230922123138" },
  { name: "비명 호그라이더", url: "https://static.wikia.nocookie.net/clashroyale/images/b/b6/Hog_Rider_Scream.png/revision/latest?cb=20230922123136" },
  { name: "이마 짚는 고블린", url: "https://static.wikia.nocookie.net/clashroyale/images/d/dc/Facepalm_Goblin.png/revision/latest?cb=20230918084628" },
  { name: "브이 프린세스", url: "https://static.wikia.nocookie.net/clashroyale/images/0/0f/Peace_Princess.png/revision/latest?cb=20230920123025" },
  { name: "따봉 일렉트로 마법사", url: "https://static.wikia.nocookie.net/clashroyale/images/3/37/Electro_Wizard_Thumbs-Up.png/revision/latest?cb=20181027033128" },
  { name: "우는 해골", url: "https://static.wikia.nocookie.net/clashroyale/images/7/73/Crying_Skeleton.png/revision/latest?cb=20180921183431" },
  { name: "고기 뜯는 자이언트", url: "https://static.wikia.nocookie.net/clashroyale/images/b/bb/Eating_Giant.png/revision/latest?cb=20230920123020" }
];

class ClanManagerApp {
  constructor() {
    this.currentData = null;
    this.filteredMembers = [];
    this.activeFilter = "all"; // 'all' | 'dormant' | 'low-donations'
    this.searchQuery = "";
    this.sorting = { key: "lastSeen", order: "desc" };
    this.activeMainTab = "dashboard";
    this.compareTags = ["#G890J9JC", "#JYQRP2C2", "#Q0U22YGQ"];
    this.compareClansData = [];
    this.hasCompareLoaded = false;
    
    // 영구 로컬스토리지 기반 배틀로그 캐시 로드 (첫 접속 시에도 기록 없음 방지)
    this.battleLogCache = this.loadBattleLogCache();

    // Chart.js 인스턴스
    this.charts = { activity: null, compareDonations: null };
    
    // DOM 캐싱 (성능 최적화)
    this.elements = {};

    this.currentProgress = 0;
    this.lastSyncTime = 0;
    this.syncThrottleMs = 15000;
    this.loadingStartTime = Date.now();

    this.init();
  }

  // 로컬스토리지에서 배틀로그 캐시 복원
  loadBattleLogCache() {
    try {
      const saved = localStorage.getItem("cr_clan_battle_cache_v5");
      if (saved) {
        const obj = JSON.parse(saved);
        return new Map(Object.entries(obj));
      }
    } catch (e) {}
    return new Map();
  }

  // 배틀로그 캐시를 로컬스토리지에 영구 저장
  saveBattleLogCache() {
    try {
      const obj = Object.fromEntries(this.battleLogCache);
      localStorage.setItem("cr_clan_battle_cache_v5", JSON.stringify(obj));
    } catch (e) {}
  }



  init() {
    this.loadingStartTime = Date.now();
    // 12종 공식 인게임 이모트 중 랜덤 3인방 병렬 프리로드 프로미스 등록
    this.emotesReadyPromise = this.renderRandomLoadingEmotes();

    // iOS Safari 및 모바일 웹킷 브라우저 :active 터치 탄성 강제 활성화
    try {
      document.addEventListener("touchstart", () => {}, { passive: true });
    } catch (e) {}

    this.cacheDOM();
    this.bindEvents();

    // 구버전 캐시 키만 정리
    try {
      localStorage.removeItem("cr_manager_clan_cache_v1");
      localStorage.removeItem("cr_manager_settings_v1");
      localStorage.removeItem("cr_manager_cache_ver");
      localStorage.removeItem("cr_clan_donation_cache_v1");
      localStorage.removeItem("cr_clan_battle_cache_v2");
      localStorage.removeItem("cr_clan_battle_cache_v3");
      localStorage.removeItem("cr_clan_battle_cache_v4"); // v4 캐시 정리
    } catch (e) {}

    // 갤클 비교 프리셋 데이터 사전 로드
    if (window.crApi && typeof window.crApi.getGalleryClansPreset === "function") {
      this.compareClansData = window.crApi.getGalleryClansPreset();
    }

    if (window.lucide) window.lucide.createIcons();

    // 초기 상태: 0%에서 실제 수신 대기
    this.animateProgress(0, "서버 연결 및 데이터 요청 중...");

    // 접속 즉시 실시간 동기화 실행
    this.autoSyncLive(true);
    this.syncCompareLive();

    // 20초 주기 자동 최신 동기화 타이머 (초고속 실시간 모니터링)
    setInterval(() => {
      if (document.visibilityState === 'visible') {
        this.autoSyncLive(false);
        this.syncCompareLive();
      }
    }, 20000);

    // 화면 탭 활성화 시 즉각 동기화 (30초 쿨타운 적용)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.autoSyncLive(false);
        this.syncCompareLive();
      }
    });

    // 1분 주기 상대 시간 자동 리렌더링 (네트워크 비용 0)
    setInterval(() => {
      if (document.visibilityState === 'visible' && this.currentData) {
        this.renderMobileList();
        this.renderDesktopTable();
      }
    }, 60000);

    // 화면 회전 및 리사이즈 대응
    window.addEventListener('resize', () => {
      if (this.currentData && window.innerWidth >= 1024) {
        this.renderDesktopTable();
      }
    });
  }

  cacheDOM() {
    this.elements = {
      initialSyncProgressContainer: document.getElementById("initial-sync-progress-container"),
      initialSyncProgressBar: document.getElementById("initial-sync-progress-bar"),
      initialSyncPercent: document.getElementById("initial-sync-percent"),
      initialSyncStatusMsg: document.getElementById("initial-sync-status-msg"),
      initialSyncModal: document.getElementById("initial-sync-modal"),
      searchInput: document.getElementById("search-input"),
      sortKeySelect: document.getElementById("sort-key-select"),
      btnSortOrder: document.getElementById("btn-sort-order"),
      btnThemeToggle: document.getElementById("btn-theme-toggle"),
      sortOrderText: document.getElementById("sort-order-text"),
      sortOrderIcon: document.getElementById("sort-order-icon"),
      sortOrderIconWrapper: document.getElementById("sort-order-icon-wrapper"),
      
      viewDashboard: document.getElementById("view-dashboard"),
      viewCompare: document.getElementById("view-compare"),
      tabBtnDashboard: document.getElementById("tab-btn-dashboard"),
      tabBtnCompare: document.getElementById("tab-btn-compare"),
      tabContextHint: document.getElementById("tab-context-hint"),
      btnQuickCompare: document.getElementById("btn-quick-compare"),
      syncDot: document.getElementById("sync-dot"),
      clanName: document.getElementById("clan-name"),
      clanTag: document.getElementById("clan-tag"),
      clanDesc: document.getElementById("clan-desc"),
      statTotalMembers: document.getElementById("stat-total-members"),
      statMemberVacant: document.getElementById("stat-member-vacant"),
      statTotalDonations: document.getElementById("stat-total-donations"),
      statAvgDonations: document.getElementById("stat-avg-donations"),
      statDormantCount: document.getElementById("stat-dormant-count"),
      chipCountAll: document.getElementById("chip-count-all"),
      chipCountDormant: document.getElementById("chip-count-dormant"),
      chipCountLow: document.getElementById("chip-count-low"),
      podiumContainer: document.getElementById("podium-container"),
      podiumRunnersContainer: document.getElementById("podium-runners-container"),
      chartActivity: document.getElementById("chart-activity"),
      chartCompareDonations: document.getElementById("chart-compare-donations"),
      compareSummaryList: document.getElementById("compare-summary-list"),
      memberTableBody: document.getElementById("member-table-body"),
      emptyState: document.getElementById("empty-state"),
      memberMobileList: document.getElementById("member-mobile-list")
    };
  }

  updateInitialProgress(percent, msg) {
    this.animateProgress(percent, msg, 350);
  }

  async renderRandomLoadingEmotes() {
    const container = document.getElementById("loading-emotes-container");
    if (!container) return;

    // 12종 공식 인게임 이모트 풀에서 3개 비복원 무작위 추출
    const shuffled = [...CR_EMOTES_POOL].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, 3);

    // 1. 레이아웃 덜컹거림(CLS) 방지: 3개 슬롯(w-16 h-16 / w-20 h-20)의 투명 자리부터 고정 예약
    container.innerHTML = selected.map((_, idx) => `
      <div class="relative w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center shrink-0" id="emote-slot-${idx}"></div>
    `).join("");

    // 2. Promise.all로 3장의 이미지를 브라우저 메모리에 병렬 동시 프리로드 (최대 300ms 타임아웃 안전망)
    const preloadPromises = selected.map((emote, idx) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.src = emote.url;
        img.onload = () => resolve({ emote, idx, img });
        img.onerror = () => resolve({ emote, idx, img });
      });
    });

    const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 300));
    await Promise.race([Promise.all(preloadPromises), timeoutPromise]);

    // 3. 3장의 이미지가 모두 준비된 바로 그 순간, 1프레임에 동시에 화면에 일괄 주입!
    container.innerHTML = selected.map((emote, idx) => `
      <div class="relative w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center shrink-0">
        <img src="${emote.url}" 
             alt="${emote.name}" 
             class="w-16 h-16 sm:w-20 sm:h-20 object-contain drop-shadow-[0_8px_20px_rgba(0,0,0,0.6)] emote-bounce emote-delay-${idx} loading-emote-item pointer-events-none select-none" />
      </div>
    `).join("");

    // 4. 이모트 3장이 화면에 나타나는 바로 그 순간, 하단 로딩바도 동시에 노출 (선노출 방지)
    const progressContainer = document.getElementById("initial-sync-progress-container");
    if (progressContainer) {
      progressContainer.style.opacity = "1";
    }

    // 5. 세 이모트가 모두 화면에 완벽히 등장한 바로 그 시점부터 0.85초 최소 노출 타이머 카운트 시작!
    this.loadingStartTime = Date.now();
  }

  animateProgress(targetPercent, msg, duration = 350) {
    const startPercent = this.currentProgress || 0;
    const clampedTarget = Math.min(100, Math.max(0, Math.round(targetPercent)));
    this.currentProgress = clampedTarget;

    const { initialSyncProgressBar: bar, initialSyncPercent: percentEl, initialSyncStatusMsg: msgEl } = this.elements;
    if (bar) bar.style.width = `${clampedTarget}%`;
    if (msgEl && msg) msgEl.textContent = msg;

    if (percentEl) {
      const startTime = performance.now();
      const step = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const currentVal = Math.round(startPercent + (clampedTarget - startPercent) * easeOut);
        percentEl.textContent = `${currentVal}%`;
        if (progress < 1) {
          requestAnimationFrame(step);
        } else {
          percentEl.textContent = `${clampedTarget}%`;
        }
      };
      requestAnimationFrame(step);
    }
  }

  async hideInitialSyncModal() {
    const modal = this.elements.initialSyncModal;
    if (!modal || modal.dataset.dismissed) return;
    modal.dataset.dismissed = "true";

    // 1. 데이터 로드 완료 즉시 3개 이모지 다같이 동시 점프 발동!
    const container = document.getElementById("loading-emotes-container");
    if (container) {
      const items = container.querySelectorAll(".loading-emote-item");
      items.forEach((item) => {
        // 기존 개별 웨이브 애니메이션 및 딜레이 클래스 완전 제거
        item.classList.remove("emote-bounce", "emote-delay-0", "emote-delay-1", "emote-delay-2", "emotes-complete-pop");
        // 강제 리플로우(reflow)로 애니메이션 동시 시작 보장
        void item.offsetWidth;
        // 3개 동시 점프 클래스 추가
        item.classList.add("emotes-together-jump");
      });
    }

    // 2. 세 이모지가 다같이 힘차게 점프하고 착지하는 시점(약 480ms)에 로딩창 페이드아웃 시작
    await new Promise((resolve) => setTimeout(resolve, 480));

    modal.style.transition = "opacity 0.28s ease, visibility 0.28s ease";
    modal.style.opacity = "0";
    modal.style.pointerEvents = "none";

    // 모달이 걷히며 본 화면이 드러나는 바로 그 순간 시상대 솟아오름 및 파이차트 회전·확장 애니메이션 동시 발동!
    if (this.currentData?.memberList) {
      this.renderPodium(this.currentData.memberList, true);
      this.renderActivityDonut(this.currentData.memberList, true);
      setTimeout(() => {
        this.elements.podiumContainer?.classList.remove("podium-animate");
        this.elements.podiumRunnersContainer?.classList.remove("podium-animate");
      }, 850);
    }

    setTimeout(() => {
      modal.classList.add("hidden");
    }, 290);
  }

  bindEvents() {
    const { searchInput, sortKeySelect, btnSortOrder } = this.elements;
    
    if (searchInput) {
      let searchTimeout;
      searchInput.addEventListener("input", (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          this.searchQuery = e.target.value.trim().toLowerCase();
          this.applyFilterAndRender();
        }, 300);
      });
    }

    if (sortKeySelect) {
      sortKeySelect.addEventListener("change", (e) => {
        this.sorting.key = e.target.value;
        this.applyFilterAndRender();
      });
    }

    if (btnSortOrder) {
      btnSortOrder.addEventListener("click", () => this.toggleSortOrder());
    }

    if (this.elements.btnThemeToggle) {
      this.elements.btnThemeToggle.addEventListener("click", (e) => this.toggleTheme(e));
    }




  }

toggleTheme(e) {
    const isDark = document.documentElement.classList.contains("dark");
    const nextTheme = isDark ? "light" : "dark";

    // 1. 버튼 중심 좌표 획득 (원형 파동 발원점)
    let x = window.innerWidth - 36;
    let y = 36;
    const btn = this.elements.btnThemeToggle || document.getElementById("btn-theme-toggle");
    if (btn) {
      const rect = btn.getBoundingClientRect();
      x = Math.round(rect.left + rect.width / 2);
      y = Math.round(rect.top + rect.height / 2);
    } else if (e && typeof e.clientX === "number") {
      x = Math.round(e.clientX);
      y = Math.round(e.clientY);
    }

    // 2. 화면 전체 모서리까지 덮는 최대 반경 계산
    const endRadius = Math.ceil(Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    ));

    // CSS 변수 주입 (Safari 18 및 Chromium View Transitions API 연동)
    document.documentElement.style.setProperty("--theme-x", `${x}px`);
    document.documentElement.style.setProperty("--theme-y", `${y}px`);
    document.documentElement.style.setProperty("--theme-r", `${endRadius}px`);

    // 3. 원형 리플 테마 전환 실행 (120fps 단일 Web Animations API 엔진, 440ms 실키 확장)
    if (typeof document.startViewTransition === "function") {
      const transition = document.startViewTransition(() => {
        this.applyTheme(nextTheme);
      });

      if (transition.ready && typeof document.documentElement.animate === "function") {
        transition.ready.then(() => {
          try {
            document.documentElement.animate(
              {
                clipPath: [
                  `circle(0px at ${x}px ${y}px)`,
                  `circle(${endRadius}px at ${x}px ${y}px)`
                ]
              },
              {
                duration: 440,
                easing: "cubic-bezier(0.16, 1, 0.3, 1)",
                pseudoElement: "::view-transition-new(root)"
              }
            );
          } catch (err) {
            // Safe fallback
          }
        });
      }
    } else {
      // 4. Fallback: View Transitions 미지원 환경용 부드러운 파동
      this.triggerFallbackRipple(x, y, endRadius, nextTheme);
      this.applyTheme(nextTheme);
    }
  }

  triggerFallbackRipple(x, y, radius, theme) {
    const ring = document.createElement("div");
    ring.style.position = "fixed";
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    ring.style.width = "10px";
    ring.style.height = "10px";
    ring.style.borderRadius = "50%";
    ring.style.transform = "translate(-50%, -50%) scale(1)";
    ring.style.border = theme === "light" ? "3px solid rgba(245, 158, 11, 0.6)" : "3px solid rgba(99, 102, 241, 0.6)";
    ring.style.boxShadow = theme === "light" 
      ? "0 0 35px 15px rgba(245, 158, 11, 0.25)" 
      : "0 0 35px 15px rgba(99, 102, 241, 0.25)";
    ring.style.pointerEvents = "none";
    ring.style.zIndex = "999999";
    ring.style.transition = "transform 0.44s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.44s ease-out";
    ring.style.opacity = "1";
    document.body.appendChild(ring);

    requestAnimationFrame(() => {
      ring.style.transform = `translate(-50%, -50%) scale(${radius / 5})`;
      ring.style.opacity = "0";
    });

    setTimeout(() => {
      ring.remove();
    }, 450);
  }

  applyTheme(theme) {
    const isDark = theme === "dark";
    if (isDark) {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
    }

    try {
      localStorage.setItem("cr_theme", theme);
    } catch (e) {}

    const isLight = !isDark;

    // 1. 도넛 차트 테마 색상(테두리, 범례 텍스트, 툴팁) 즉시 완벽 동기화 (다크 모드 시 어두운 텍스트 묻힘 버그 해결)
    if (this.charts.activity) {
      const donutChart = this.charts.activity;
      donutChart.data.datasets[0].borderColor = isLight ? "#ffffff" : "#0f121a";
      if (donutChart.options.plugins?.legend?.labels) {
        donutChart.options.plugins.legend.labels.color = isLight ? "#0f172a" : "#94a3b8";
      }
      if (donutChart.options.plugins?.tooltip) {
        donutChart.options.plugins.tooltip.backgroundColor = isLight ? "#ffffff" : "#171b26";
        donutChart.options.plugins.tooltip.titleColor = isLight ? "#0f172a" : "#f8fafc";
        donutChart.options.plugins.tooltip.bodyColor = isLight ? "#334155" : "#94a3b8";
        donutChart.options.plugins.tooltip.borderColor = isLight ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.1)";
      }
      donutChart.update('none');
    }

    // 2. 비교 막대 차트 테마 색상 즉시 동기화
    if (this.charts.compareDonations) {
      const compareChart = this.charts.compareDonations;
      if (compareChart.options.scales?.y?.ticks) {
        compareChart.options.scales.y.ticks.color = isLight ? "#475569" : "#94a3b8";
        compareChart.options.scales.y.grid.color = isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.05)";
      }
      if (compareChart.options.scales?.x?.ticks) {
        compareChart.options.scales.x.ticks.color = isLight ? "#0f172a" : "#94a3b8";
      }
      compareChart.update('none');
    }

    // 3. 멤버 리스트 및 통계 UI 재렌더링
    this.applyFilterAndRender();
  }

  toggleSortOrder() {
    this.sorting.order = this.sorting.order === "desc" ? "asc" : "desc";
    this.updateSortOrderUI();
    this.applyFilterAndRender();
  }

  updateSortOrderUI() {
    const { sortOrderText: textEl, sortOrderIconWrapper: iconWrapper, sortOrderIcon: iconEl } = this.elements;
    const isDesc = this.sorting.order === "desc";
    
    if (textEl) {
      textEl.textContent = isDesc ? "내림차순" : "오름차순";
    }
    const target = iconWrapper || document.getElementById("sort-order-icon-wrapper") || iconEl || document.getElementById("sort-order-icon");
    if (target) {
      target.style.transition = "transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)";
      target.style.transform = isDesc ? "rotate(0deg)" : "rotate(180deg)";
    }
  }

  switchMainTab(tabName) {
    this.activeMainTab = tabName;
    const { viewDashboard, viewCompare, tabBtnDashboard, tabBtnCompare, tabContextHint: tabHint, btnQuickCompare: quickCompareBtn } = this.elements;

    if (tabName === "compare") {
      if (viewDashboard) viewDashboard.classList.add("hidden");
      if (viewCompare) viewCompare.classList.remove("hidden");
      
      if (tabBtnDashboard) tabBtnDashboard.classList.remove("active");
      if (tabBtnCompare) tabBtnCompare.classList.add("active");
      
      if (quickCompareBtn) quickCompareBtn.classList.add("opacity-50", "pointer-events-none");
      
      if (tabHint) {
        tabHint.innerHTML = `<span class="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400"></span><span>디시 갤러리 클랜 3자 비교 뷰</span>`;
      }

      this.renderComparisonView(true);

      if (!this.hasCompareLoaded) {
        this.syncCompareLive();
      }
    } else {
      if (viewCompare) viewCompare.classList.add("hidden");
      if (viewDashboard) viewDashboard.classList.remove("hidden");
      
      if (tabBtnCompare) tabBtnCompare.classList.remove("active");
      if (tabBtnDashboard) tabBtnDashboard.classList.add("active");
      
      if (quickCompareBtn) quickCompareBtn.classList.remove("opacity-50", "pointer-events-none");
      
      if (tabHint) {
        tabHint.innerHTML = `<span class="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400"></span><span>Good Fellas 단독 뷰</span>`;
      }

      // 타 갤클 비교 탭에서 대시보드로 복귀할 때 시상대 솟아오름 및 파이차트 회전·확장 애니메이션 동시 재생!
      if (this.currentData?.memberList) {
        this.renderPodium(this.currentData.memberList, true);
        this.renderActivityDonut(this.currentData.memberList, true);
        setTimeout(() => {
          this.elements.podiumContainer?.classList.remove("podium-animate");
          this.elements.podiumRunnersContainer?.classList.remove("podium-animate");
        }, 850);
      }
    }

    if (tabName === "dashboard" && this.charts.activity) {
      this.charts.activity.resize();
    }
    if (window.lucide) window.lucide.createIcons();
    if (typeof window.scrollTo === "function") { window.scrollTo({ top: 0, behavior: "smooth" }); }
  }

  // 플레이어 1인의 최근 배틀 로그 조회 (프록시 다각화 및 403/429 재시도)
  // 플레이어 1인의 최근 배틀 로그 안전 조회 (스트림 1회 단일 소비로 'Body is disturbed or locked' 원천 차단)
  async fetchPlayerBattleLog(playerTag, retries = 1) {
    if (!playerTag) return null;
    const normalized = encodeURIComponent(window.crApi ? window.crApi.normalizeTag(playerTag) : playerTag);
    const proxy = window.crApi?.settings?.workerUrl || window.crApi?.workerUrl || "https://green-disk-88a6.marble593812345.workers.dev";
    // 실시간 캐시 버스터(_t) 강제 부착하여 중간 프록시/브라우저 캐시 무효화
    const url = `${proxy}/v1/players/${normalized}/battlelog?_t=${Date.now()}`;

    for (let i = 0; i <= retries; i++) {
      try {
        const res = await fetch(url, {
          cache: "no-store",
          headers: { "Pragma": "no-cache", "Cache-Control": "no-cache" }
        });
        
        if ((res.status === 429 || res.status === 403) && i < retries) {
          await new Promise((r) => setTimeout(r, 150));
          continue;
        }

        if (!res.ok) return null;
        
        // 스트림을 텍스트로 딱 1회만 안전하게 읽음
        const rawText = await res.text();
        if (!rawText) return null;

        const data = JSON.parse(rawText);
        return Array.isArray(data) ? data : null;
      } catch (e) {
        if (i < retries) {
          await new Promise((r) => setTimeout(r, 100));
          continue;
        }
        return null;
      }
    }
    return null;
  }

  // 캐시된 배틀로그 지능형 바인딩: 캐시가 멤버의 기존 배틀시간보다 더 최신일 때만 반영 (서버 최신값 보호)
  bindCachedBattleLogs(members) {
    if (!Array.isArray(members)) return;
    members.forEach((m) => {
      if (this.battleLogCache.has(m.tag)) {
        const c = this.battleLogCache.get(m.tag);
        if (c.time === "none") {
          m._noBattles = true;
          return;
        }
        if (!m.lastBattleTime) {
          m.lastBattleTime = c.time;
          m.lastBattleType = c.type;
          m._fromCache = true;
        } else {
          const memberDate = this.parseDateSafe(m.lastBattleTime);
          const cachedDate = this.parseDateSafe(c.time);
          if (cachedDate && (!memberDate || cachedDate.getTime() > memberDate.getTime())) {
            m.lastBattleTime = c.time;
            m.lastBattleType = c.type;
            m._fromCache = true;
          }
        }
      }
    });
  }

  // 클랜원 전체 50명의 마지막 배틀로그 비동기 분할 수집 + 캐시 영구 보존 (기록 없음 완전 해결)
  async fetchAllMembersBattleLogs(members) {
    if (!Array.isArray(members) || members.length === 0) return;

    let hasNewData = false;
    const chunkSize = 10; // 10명씩 부드럽게 분할 수집

    for (let i = 0; i < members.length; i += chunkSize) {
      const chunk = members.slice(i, i + chunkSize);

      const chunkPromises = chunk.map(async (m) => {
        // 1. 기존 캐시 기록 바인딩
        if (this.battleLogCache.has(m.tag)) {
          const cached = this.battleLogCache.get(m.tag);
          if (!m.lastBattleTime || cached.time > m.lastBattleTime) {
            m.lastBattleTime = cached.time;
            m.lastBattleType = cached.type;
          }
        }

        // 2. 서버 최신 배틀로그 비동기 조회
        const battlelog = await this.fetchPlayerBattleLog(m.tag);
        if (Array.isArray(battlelog) && battlelog.length > 0) {
          const newTime = battlelog[0].battleTime;
          const newType = battlelog[0].type || "Battle";
          if (m.lastBattleTime !== newTime) {
            m.lastBattleTime = newTime;
            m.lastBattleType = newType;
            this.battleLogCache.set(m.tag, {
              time: newTime,
              type: newType
            });
            hasNewData = true;
          }
        } else if (Array.isArray(battlelog) && battlelog.length === 0) {
          // 배틀 이력이 없는 멤버는 sentinel 기록하여 매 20초 재호출 방지
          if (!this.battleLogCache.has(m.tag) || this.battleLogCache.get(m.tag).time !== "none") {
            this.battleLogCache.set(m.tag, { time: "none", type: "None" });
            m._noBattles = true;
            hasNewData = true;
          }
        }
      });

      await Promise.allSettled(chunkPromises);

      // 10명 단위 청크 완료 시마다 UI 즉시 갱신 (사용자가 기다릴 필요 없음)
      if (hasNewData) {
        this.saveBattleLogCache();
        this.applyFilterAndRender();
        this.updateStats(this.currentData);
      }

      if (i + chunkSize < members.length) {
        await new Promise((r) => setTimeout(r, 40));
      }
    }
  }

  async autoSyncLive(isManual = false) {
    const now = Date.now();
    // 30초 쿨타운 적용 (수동 클릭 시는 쿨타운 완전 무시하고 즉각 강제 동기화)
    if (!isManual && (now - this.lastSyncTime < this.syncThrottleMs)) {
      return;
    }
    this.lastSyncTime = now;

    const { syncDot: dot } = this.elements;
    if (dot) dot.className = "status-dot amber live-pulse";
    

    const isInitial = !this.elements.initialSyncModal?.dataset?.dismissed;
    const tag = window.crApi?.settings?.clanTag || "#G890J9JC";

    try {
      // 수동 클릭 시 force=true를 전달하여 서버 및 브라우저 캐시 강제 우회 (데이터 패치는 지연 없이 즉시 병렬 시작)
      const dataFetchPromise = window.crApi.fetchClanFullData(tag, (partialData) => {
        if (partialData?.memberList) {
          this.bindCachedBattleLogs(partialData.memberList);
        }
        this.renderClan(partialData);
      }, isManual);

      // 초기 로딩인 경우: 이모트 3장 프리로드가 완료되어 화면에 노출될 때까지 대기 (로딩바 선노출 방지)
      if (isInitial && this.emotesReadyPromise) {
        await this.emotesReadyPromise;
        // 이모트가 화면에 나타난 직후 게이지 35%로 부드럽게 전진
        this.animateProgress(35, "서버 연결 완료 · 클랜 정보 요청 중...");
      }

      const liveData = await dataFetchPromise;

      if (liveData && liveData.memberList) {
        // 1. 서버 원본 기준으로 배틀로그가 누락된 멤버 선별 (캐시 바인딩 전에 먼저 추출하여 보충 조회 보장)
        // 서버에서 배틀로그를 주지 못했거나 캐시로부터만 바인딩된 멤버 선별 (배틀 이력 없음 확인된 멤버 제외)
        const missingBattleMembers = liveData.memberList.filter((m) => (!m.lastBattleTime || m._fromCache) && !m._noBattles);

        // 2. 서버 요약에서 수신된 최신 배틀로그를 로컬 캐시에 즉시 동기화
        let hasCacheUpdated = false;
        liveData.memberList.forEach((m) => {
          if (m.lastBattleTime) {
            const existing = this.battleLogCache.get(m.tag);
            if (!existing || existing.time !== m.lastBattleTime) {
              this.battleLogCache.set(m.tag, {
                time: m.lastBattleTime,
                type: m.lastBattleType || "Battle"
              });
              hasCacheUpdated = true;
            }
          }
        });
        if (hasCacheUpdated) {
          this.saveBattleLogCache();
        }

        // 3. 서버에 배틀시간이 비어있던 멤버에게만 보충 바인딩
        this.bindCachedBattleLogs(liveData.memberList);

        // 수동 새로고침일 때만 차트 솟아오름 애니메이션 적용 (초기 진입은 모달 해제 시 발동, 자동 갱신은 정적 유지)
        const shouldAnimateManual = isManual && !isInitial;
        this.renderClan(liveData, shouldAnimateManual);
        if (shouldAnimateManual) {
          setTimeout(() => {
            this.elements.podiumContainer?.classList.remove("podium-animate");
            this.elements.podiumRunnersContainer?.classList.remove("podium-animate");
          }, 850);
        }

        if (isInitial) {
          // 최소 850ms(0.85초) 동안 이모트 3마리의 통-통-통 1사이클 웨이브 바운스를 완주 보장!
          const elapsed = Date.now() - (this.loadingStartTime || Date.now());
          const minDisplayTime = 850;
          const waitTime = Math.max(0, minDisplayTime - elapsed);
          
          // 하단 초슬림 게이지 바를 웨이브 완주 시점에 맞춰 100%까지 부드럽게 채움
          this.animateProgress(100, "", Math.max(200, waitTime));

          setTimeout(() => {
            this.hideInitialSyncModal();
          }, waitTime);
        }

        if (dot) dot.className = "status-dot green live-pulse";

        // 4. 배틀로그 누락 멤버가 있다면 백그라운드에서 개별 핀포인트 수집
        if (missingBattleMembers.length > 0) {
          this.fetchAllMembersBattleLogs(missingBattleMembers);
        }
      }
    } catch (err) {
      console.error("실시간 최신 동기화 실패:", err.message);
      if (dot) dot.className = "status-dot red";

      if (!this.currentData) {
        this.renderEmptyState(err.message);
        this.showErrorModal(err);
      } else if (isManual) {
        alert(`데이터 갱신 실패: ${err.message}`);
      }
    } finally {
      if (isInitial && (!this.currentData || !this.currentData.memberList)) {
        const elapsed = Date.now() - (this.loadingStartTime || Date.now());
        const minDisplayTime = 850;
        const waitTime = Math.max(0, minDisplayTime - elapsed);
        setTimeout(() => {
          this.hideInitialSyncModal();
        }, waitTime);
      }
    }
  }

  // 타 갤클 비교 데이터 백그라운드 프리페치 및 실시간 동기화
  async syncCompareLive() {
    
    try {
      if (window.crApi && typeof window.crApi.fetchMultipleClans === "function") {
        const liveClans = await window.crApi.fetchMultipleClans(this.compareTags);
        if (Array.isArray(liveClans) && liveClans.length > 0) {
          this.compareClansData = liveClans;
          this.hasCompareLoaded = true;
        }
      }
    } catch (e) {
      console.warn("갤클 비교 실시간 조회 오류 (프리셋 유지):", e.message);
    } finally {
      
      if (this.activeMainTab === "compare") {
        this.renderComparisonView(false);
      }
    }
  }

  // 에러 모달 표시 메서드
  showErrorModal(err) {
    const modal = document.getElementById("sync-error-modal");
    if (!modal) return;

    const titleEl = document.getElementById("error-modal-title");
    const msgEl = document.getElementById("error-modal-message");
    const btnRetry = document.getElementById("btn-error-retry");
    const btnClose = document.getElementById("btn-error-close");

    const errStr = (err?.message || "").toLowerCase();

    if (errStr.includes("403") || errStr.includes("401") || errStr.includes("key")) {
      titleEl.textContent = "API 인증 실패";
      msgEl.textContent = "Supercell API 키가 만료되었거나 IP 접근 제한/Cloudflare Worker 설정이 올바르지 않습니다.";
    } else if (errStr.includes("404")) {
      titleEl.textContent = "클랜 정보 없음";
      msgEl.textContent = "지정된 클랜 태그(#G890J9JC)를 Supercell API에서 조회할 수 없습니다.";
    } else if (errStr.includes("429")) {
      titleEl.textContent = "요청 횟수 초과";
      msgEl.textContent = "API 요청 한도를 초과했습니다. 1~2분 후 다시 시도해주세요.";
    } else {
      titleEl.textContent = "데이터 동기화 실패";
      msgEl.textContent = `서버와 통신할 수 없습니다: ${err?.message || "네트워크 상태를 확인해주세요."}`;
    }

    if (btnRetry) {
      btnRetry.onclick = () => {
        this.closeErrorModal();
        this.autoSyncLive();
      };
    }

    if (btnClose) {
      btnClose.onclick = () => this.closeErrorModal();
    }

    modal.classList.remove("hidden");
    if (window.lucide) window.lucide.createIcons();
  }

  closeErrorModal() {
    const modal = document.getElementById("sync-error-modal");
    if (modal) modal.classList.add("hidden");
  }

  renderEmptyState(reason) {
    const mobileList = this.elements.memberMobileList;
    const desktopTbody = this.elements.memberTableBody;
    const emptyState = this.elements.emptyState;
    const podium = this.elements.podiumContainer;

    if (podium) {
      podium.innerHTML = `<div class="text-center py-8 text-xs text-slate-500">데이터를 불러오지 못했습니다.</div>`;
    }

    const emptyHtml = `
      <div class="py-12 px-4 text-center">
        <div class="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-2 text-red-400">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p class="text-xs font-semibold text-slate-300">클랜 데이터를 불러올 수 없습니다</p>
        <p class="text-[11px] text-slate-500 mt-1 max-w-xs mx-auto">${this.escapeHtml(reason || "API 서버 응답 실패")}</p>
        <button onclick="window.app.autoSyncLive()" class="mt-3 px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.1] text-xs text-slate-200 rounded-lg border border-white/[0.08] transition inline-flex items-center gap-1.5">
          <i data-lucide="rotate-cw" class="w-3.5 h-3.5"></i>
          <span>다시 시도</span>
        </button>
      </div>
    `;

    if (mobileList) mobileList.innerHTML = emptyHtml;
    if (desktopTbody) {
      desktopTbody.innerHTML = `<tr><td colspan="4" class="py-10 text-center text-xs text-slate-500">${this.escapeHtml(reason || "데이터 수신 실패")}</td></tr>`;
    }
    if (emptyState) emptyState.classList.add("hidden");

    if (window.lucide) window.lucide.createIcons();
  }

  renderClan(clanData, triggerAnimation = false) {
    this.currentData = clanData;
    const { clanName: nameEl, clanTag: tagEl, clanDesc: descEl } = this.elements;

    if (nameEl) nameEl.textContent = clanData.name || "Good Fellas";
    if (tagEl) tagEl.textContent = clanData.tag || "#G890J9JC";
    if (descEl && clanData.description) descEl.textContent = clanData.description;

    const gfInCompare = (this.compareClansData || []).find((c) => (c.tag || "").toUpperCase() === "#G890J9JC");
    if (gfInCompare) {
      gfInCompare.name = clanData.name || gfInCompare.name;
      gfInCompare.members = clanData.memberList ? clanData.memberList.length : (clanData.members || 47);
      if (typeof clanData.donationsPerWeek === "number") gfInCompare.donationsPerWeek = clanData.donationsPerWeek;
      if (clanData.clanScore) gfInCompare.clanScore = clanData.clanScore;
      if (clanData.clanWarTrophies) gfInCompare.clanWarTrophies = clanData.clanWarTrophies;
      if (clanData.description) gfInCompare.description = clanData.description;

      if (this.activeMainTab === "compare") {
        this.renderComparisonView(false);
      }
    }

    this.updateStats(clanData);
    this.renderCharts(clanData.memberList || [], triggerAnimation);
    this.applyFilterAndRender();
  }

  animateNumber(element, targetVal, duration = 650, suffix = "", prefix = "") {
    if (!element) return;
    const hasPrevious = element.dataset.currentValue !== undefined;
    const startVal = parseInt(element.dataset.currentValue, 10) || 0;
    if (hasPrevious && startVal === targetVal && element.textContent) return;
    element.dataset.currentValue = targetVal;
    
    const startTime = performance.now();
    const step = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      // easeOutExpo 곡선
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const current = Math.round(startVal + (targetVal - startVal) * ease);
      element.textContent = `${prefix}${current.toLocaleString()}${suffix}`;
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        element.textContent = `${prefix}${targetVal.toLocaleString()}${suffix}`;
      }
    };
    requestAnimationFrame(step);
  }

  updateStats(clanData) {
    const members = Array.isArray(clanData) ? clanData : (clanData?.memberList || []);
    const totalMembers = members.length;
    let dormantCount = 0;
    let lowDonationCount = 0;
    const now = Date.now();

    members.forEach((m) => {
      const don = m.donations || 0;
      if (don < 50) lowDonationCount++;

      const effectiveDate = this.getEffectiveActiveDate(m.lastSeen, m.lastBattleTime);
      if (effectiveDate) {
        const daysAgo = (now - effectiveDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysAgo >= 3) dormantCount++;
      } else {
        dormantCount++;
      }
    });

    const officialWeeklyDonations = (clanData && typeof clanData.donationsPerWeek === "number")
      ? clanData.donationsPerWeek
      : members.reduce((sum, m) => sum + (m.donations || 0), 0);

    const avgDonations = Math.round(officialWeeklyDonations / (totalMembers || 1));

    const { statTotalMembers, statMemberVacant, statTotalDonations, statAvgDonations, statDormantCount, chipCountAll, chipCountDormant, chipCountLow } = this.elements;

    if (statTotalMembers) this.animateNumber(statTotalMembers, totalMembers, 600, " / 50");
    if (statMemberVacant) statMemberVacant.textContent = `여유 자리: ${50 - totalMembers}석`;
    if (statTotalDonations) this.animateNumber(statTotalDonations, officialWeeklyDonations, 700);
    if (statAvgDonations) statAvgDonations.textContent = `1인 평균 ${avgDonations.toLocaleString()}개`;
    if (statDormantCount) this.animateNumber(statDormantCount, dormantCount, 500, "명");
    
    if (chipCountAll) this.animateNumber(chipCountAll, totalMembers, 400);
    if (chipCountDormant) this.animateNumber(chipCountDormant, dormantCount, 400);
    if (chipCountLow) this.animateNumber(chipCountLow, lowDonationCount, 400);
  }

  renderCharts(members, triggerAnimation = false) {
    if (members.length === 0) return;
    this.renderPodium(members, triggerAnimation);
    this.renderActivityDonut(members, triggerAnimation);
  }

  renderPodium(members, triggerAnimation = false) {
    const { podiumContainer, podiumRunnersContainer: runnersContainer } = this.elements;
    if (!podiumContainer) return;

    const sorted = [...members].sort((a, b) => (b.donations || 0) - (a.donations || 0)).slice(0, 7);
    if (sorted.length < 3) {
      podiumContainer.innerHTML = `<div class="text-center py-6 text-xs text-slate-500">표시할 클랜원이 부족합니다.</div>`;
      if (runnersContainer) runnersContainer.innerHTML = "";
      return;
    }

    const first = sorted[0];
    const second = sorted[1];
    const third = sorted[2];
    const runners = sorted.slice(3);

    // triggerAnimation이 true일 때만 podium-animate 클래스를 부여하여 상향 솟아오름 애니메이션 발동
    const basePodiumClasses = "flex items-end justify-center gap-2 pt-4 pb-0 px-1 min-h-[140px]";
    podiumContainer.className = triggerAnimation ? `${basePodiumClasses} podium-animate` : basePodiumClasses;

    podiumContainer.innerHTML = `
      <!-- 2등 은메달 (은빛 왕관 유지, 이름/개수는 기본 텍스트 색상) -->
      <div class="flex-1 max-w-[130px] flex flex-col items-center">
        <div class="podium-header text-center mb-1.5 w-full px-1" style="animation-delay: 0.06s">
          <div class="flex items-center justify-center mb-1">
            <svg class="w-4 h-4 text-slate-300 drop-shadow-[0_0_6px_rgba(203,213,225,0.4)]" style="width: 16px; height: 16px;" viewBox="0 0 24 24" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/>
            </svg>
          </div>
          <div class="text-xs text-white font-bold truncate" title="${this.escapeHtml(second.name)}">${this.escapeHtml(second.name)}</div>
          <div class="text-[11px] font-bold text-slate-300 mt-0.5">${(second.donations || 0).toLocaleString()}개</div>
        </div>
        <div class="podium-step podium-2nd w-full h-20 sm:h-24">
          <span class="text-xl sm:text-2xl font-black text-slate-300/80 font-mono mb-2">2</span>
        </div>
      </div>
      <!-- 1등 금메달 (금빛 왕관 유지, 이름/개수는 기본 텍스트 색상) -->
      <div class="flex-1 max-w-[145px] flex flex-col items-center">
        <div class="podium-header text-center mb-1.5 w-full px-1">
          <div class="flex items-center justify-center mb-1">
            <svg class="crown-aura-glow w-5 h-5 text-amber-400" style="width: 20px; height: 20px;" viewBox="0 0 24 24" fill="currentColor" fill-opacity="0.35" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/>
            </svg>
          </div>
          <div class="text-xs sm:text-sm text-white font-bold truncate" title="${this.escapeHtml(first.name)}">${this.escapeHtml(first.name)}</div>
          <div class="text-xs font-bold text-slate-300 mt-0.5">${(first.donations || 0).toLocaleString()}개</div>
        </div>
        <div class="podium-step podium-1st w-full h-28 sm:h-32">
          <span class="text-2xl sm:text-3xl font-black text-amber-400/90 font-mono mb-2">1</span>
        </div>
      </div>
      <!-- 3등 동메달 (동빛 왕관 유지, 이름/개수는 기본 텍스트 색상) -->
      <div class="flex-1 max-w-[130px] flex flex-col items-center">
        <div class="podium-header text-center mb-1.5 w-full px-1" style="animation-delay: 0.12s">
          <div class="flex items-center justify-center mb-1">
            <svg class="w-4 h-4 text-amber-600 drop-shadow-[0_0_6px_rgba(217,119,6,0.4)]" style="width: 16px; height: 16px;" viewBox="0 0 24 24" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/>
            </svg>
          </div>
          <div class="text-xs text-white font-bold truncate" title="${this.escapeHtml(third.name)}">${this.escapeHtml(third.name)}</div>
          <div class="text-[11px] font-bold text-slate-300 mt-0.5">${(third.donations || 0).toLocaleString()}개</div>
        </div>
        <div class="podium-step podium-3rd w-full h-14 sm:h-16">
          <span class="text-lg sm:text-xl font-black text-amber-600/80 font-mono mb-1">3</span>
        </div>
      </div>
    `;

    if (runnersContainer) {
      const baseRunnerClasses = "grid grid-cols-2 gap-1.5 pt-3 mt-3 border-t border-white/[0.04]";
      runnersContainer.className = triggerAnimation ? `${baseRunnerClasses} podium-animate` : baseRunnerClasses;

      runnersContainer.innerHTML = runners.map((m, idx) => `
        <div class="podium-runner-item flex items-center justify-between p-1.5 rounded bg-white/[0.02] border border-white/[0.04]" style="${triggerAnimation ? `animation-delay: ${0.18 + idx * 0.05}s` : ''}">
          <div class="flex items-center gap-1 min-w-0">
            <span class="text-[10px] font-mono text-slate-500 w-3">${idx + 4}</span>
            <span class="text-[11px] text-slate-300 font-medium truncate">${this.escapeHtml(m.name)}</span>
          </div>
          <span class="text-[11px] font-bold text-slate-400 shrink-0 ml-1">${(m.donations || 0).toLocaleString()}</span>
        </div>
      `).join("");
    }
  }

  renderActivityDonut(members, triggerAnimation = false) {
    if (!window.Chart) return;

    let seenToday = 0;
    let seen1to2d = 0;
    let seenDormant = 0;
    const now = Date.now();

    members.forEach((m) => {
      const activeDate = this.getEffectiveActiveDate(m.lastSeen, m.lastBattleTime);
      if (!activeDate) {
        seenDormant++;
        return;
      }
      const daysAgo = (now - activeDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysAgo < 1) seenToday++;
      else if (daysAgo < 3) seen1to2d++;
      else seenDormant++;
    });

    const activityCanvas = this.elements.chartActivity;
    if (!activityCanvas) return;

    const chartData = [seenToday, seen1to2d, seenDormant];

    // Chart.js의 doughnut animateRotate & animateScale은 초기 마운트 시에만 발동하므로,
    // triggerAnimation이 true(처음 진입 및 탭 복귀)일 때는 기존 차트를 destroy하고 새로 생성하여
    // 100% 확실하게 회전 및 스케일 확장 애니메이션이 눈앞에서 재생되도록 보장
    if (triggerAnimation && this.charts.activity) {
      this.charts.activity.destroy();
      this.charts.activity = null;
    }

    if (this.charts.activity) {
      // 20초 주기 백그라운드 자동 갱신 시에는 화면 흔들림 없이 데이터만 정적으로 업데이트
      this.charts.activity.data.datasets[0].data = chartData;
      this.charts.activity.update('none');
    } else {
      const ctx = activityCanvas.getContext("2d");
      this.charts.activity = new Chart(ctx, {
        type: "doughnut",
        data: {
          labels: ["오늘 접속", "1~2일 전", "3일+ 미접속"],
          datasets: [{
            data: chartData,
            backgroundColor: ["rgba(16, 185, 129, 0.85)", "rgba(59, 130, 246, 0.85)", "rgba(244, 63, 94, 0.85)"],
            borderColor: document.documentElement.classList.contains("light") ? "#ffffff" : "#0f121a",
            borderWidth: 2,
            hoverOffset: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: {
            animateRotate: true,
            animateScale: true,
            duration: 750,
            easing: 'easeOutQuart'
          },
          plugins: {
            legend: { 
              position: "bottom", 
              labels: { 
                color: document.documentElement.classList.contains("light") ? "#0f172a" : "#94a3b8", 
                boxWidth: 8, 
                padding: 10, 
                font: { size: 10, weight: "bold" } 
              } 
            },
            tooltip: {
              backgroundColor: document.documentElement.classList.contains("light") ? "#ffffff" : "#171b26", 
              titleColor: document.documentElement.classList.contains("light") ? "#0f172a" : "#f8fafc", 
              bodyColor: document.documentElement.classList.contains("light") ? "#334155" : "#94a3b8",
              borderColor: document.documentElement.classList.contains("light") ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.1)", 
              borderWidth: 1, 
              padding: 8, 
              displayColors: true,
              callbacks: { label: (c) => ` ${c.label}: ${c.raw}명` }
            }
          },
          cutout: "68%"
        }
      });
    }
  }

  handleCustomClanAdd() {
    const input = this.elements.inputCustomClanTag;
    if (!input) return;
    const rawVal = input.value.trim();
    if (!rawVal) return;

    const normalized = window.crApi ? window.crApi.normalizeTag(rawVal) : (rawVal.startsWith("#") ? rawVal : "#" + rawVal);
    if (!this.compareTags.includes(normalized)) {
      this.compareTags.push(normalized);
      input.value = "";
      this.syncCompareLive();
    } else {
      alert("이미 비교 목록에 등록된 클랜 태그입니다.");
    }
  }

  renderComparisonView(triggerAnimation = false) {
    let clans = this.compareClansData;
    if (!Array.isArray(clans) || clans.length === 0) {
      clans = window.crApi?.getGalleryClansPreset() || [];
      this.compareClansData = clans;
    }

    const enriched = clans.map((c) => {
      const isHome = (c.tag || "").toUpperCase() === "#G890J9JC" || c.isHome === true;
      const membersCount = typeof c.members === "number" ? c.members : (c.memberList?.length || 0);
      const donationsWeekly = typeof c.donationsPerWeek === "number" ? c.donationsPerWeek : 0;
      const score = typeof c.clanScore === "number" ? c.clanScore : 0;
      return { ...c, isHome, membersCount, donationsWeekly, score };
    });

    const sortedByDonations = [...enriched].sort((a, b) => b.donationsWeekly - a.donationsWeekly);
    sortedByDonations.forEach((c, idx) => { c.donationRank = idx + 1; });

    this.renderCompareCharts(sortedByDonations, triggerAnimation);
    this.renderCompareSummaryList(sortedByDonations, triggerAnimation);

    if (window.lucide) window.lucide.createIcons();
  }

  renderCompareCharts(clans, triggerAnimation = false) {
    if (!window.Chart) return;

    const labels = clans.map((c) => c.name);
    const donationData = clans.map((c) => c.donationsWeekly);
    const backgroundColors = clans.map((c) => c.isHome ? "rgba(99, 102, 241, 0.85)" : (c.name || "").includes("Vandros") ? "rgba(16, 185, 129, 0.85)" : "rgba(244, 63, 94, 0.85)");
    const borderColors = clans.map((c) => c.isHome ? "#6366f1" : (c.name || "").includes("Vandros") ? "#10b981" : "#f43f5e");

    const donationCanvas = this.elements.chartCompareDonations;
    if (!donationCanvas) return;

    if (this.charts.compareDonations) {
      const chart = this.charts.compareDonations;
      const isLight = document.documentElement.classList.contains("light");
      chart.data.labels = labels;
      chart.data.datasets[0].data = donationData;
      chart.data.datasets[0].backgroundColor = backgroundColors;
      chart.data.datasets[0].borderColor = borderColors;
      
      // 테마별 눈금 및 그리드 색상 동적 반영
      if (chart.options.scales?.y?.ticks) {
        chart.options.scales.y.ticks.color = isLight ? "#475569" : "#94a3b8";
        chart.options.scales.y.grid.color = isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.05)";
      }
      if (chart.options.scales?.x?.ticks) {
        chart.options.scales.x.ticks.color = isLight ? "#0f172a" : "#94a3b8";
      }
      chart.resize();

      if (triggerAnimation) {
        chart.reset();
        chart.update({
          duration: 550,
          easing: 'easeOutQuart'
        });
      } else {
        chart.update('none');
      }
    } else {
      const barDataLabelsPlugin = {
        id: "barDataLabels",
        afterDatasetsDraw(chart, args, options) {
          const { ctx } = chart;
          ctx.save();
          chart.data.datasets.forEach((dataset, i) => {
            const meta = chart.getDatasetMeta(i);
            if (meta.hidden) return;
            meta.data.forEach((element, index) => {
              const rawVal = dataset.data[index];
              if (rawVal === undefined || rawVal === null) return;
              ctx.font = "bold 12px Pretendard, -apple-system, sans-serif";
              ctx.textAlign = "center";
              ctx.textBaseline = "bottom";
              ctx.fillStyle = document.documentElement.classList.contains("light") ? "#0f172a" : "#ffffff";
              const suffix = options?.suffix || "";
              const text = `${typeof rawVal === "number" ? rawVal.toLocaleString() : rawVal}${suffix}`;
              ctx.fillText(text, element.x, element.y - 6);
            });
          });
          ctx.restore();
        }
      };

      const ctx = donationCanvas.getContext("2d");
      this.charts.compareDonations = new Chart(ctx, {
        type: "bar",
        data: {
          labels,
          datasets: [{
            label: "주간 총 지원량", data: donationData,
            backgroundColor: backgroundColors, borderColor: borderColors,
            borderWidth: 1.5, borderRadius: 6
          }]
        },
        plugins: [barDataLabelsPlugin],
        options: {
          animation: {
            duration: 550,
            easing: 'easeOutQuart'
          },
          responsive: true, maintainAspectRatio: false, layout: { padding: { top: 24 } },
          scales: {
            y: {
              beginAtZero: true, ticks: { color: "#94a3b8", font: { size: 10 } },
              grid: { color: "rgba(255,255,255,0.05)" },
              title: { display: false },
              grace: "18%"
            },
            x: { ticks: { color: "#f8fafc", font: { size: 11, weight: "bold" } }, grid: { display: false } }
          },
          plugins: {
            barDataLabels: { suffix: "개" }, legend: { display: false },
            tooltip: {
              backgroundColor: "#171b26", titleColor: "#f8fafc", bodyColor: "#94a3b8",
              borderColor: "rgba(255,255,255,0.1)", borderWidth: 1,
              callbacks: { label: (ctx) => ` 주간 총 지원량: ${ctx.raw.toLocaleString()}개` }
            }
          }
        }
      });
    }
  }

  renderCompareSummaryList(clans, triggerAnimation = false) {
    const container = this.elements.compareSummaryList;
    if (!container) return;

    const homeClan = clans.find((c) => c.isHome) || clans[0];
    const homeDonations = homeClan?.donationsWeekly || 0;

    let html = "";
    clans.forEach((c, idx) => {
      const isHome = c.isHome;
      const diffDonations = c.donationsWeekly - homeDonations;

      const popClass = triggerAnimation ? "badge-pop" : "";
      const animStyle = triggerAnimation ? `style="animation-delay: ${0.12 + idx * 0.08}s"` : "";

      let diffBadge = `<span class="${popClass} text-slate-500 font-mono text-[11px] font-medium bg-white/[0.04] px-1.5 py-0.5 rounded inline-block" ${animStyle}>기준</span>`;
      if (!isHome) {
        if (diffDonations > 0) {
          diffBadge = `<span class="${popClass} text-emerald-400 font-mono text-[11px] font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 inline-block" ${animStyle}>+${diffDonations.toLocaleString()}개</span>`;
        } else if (diffDonations < 0) {
          diffBadge = `<span class="${popClass} text-rose-400 font-mono text-[11px] font-bold bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20 inline-block" ${animStyle}>${diffDonations.toLocaleString()}개</span>`;
        } else {
          diffBadge = `<span class="${popClass} text-slate-400 font-mono text-[11px] font-medium bg-white/[0.04] px-1.5 py-0.5 rounded inline-block" ${animStyle}>0개</span>`;
        }
      }

      const rankEmoji = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}`;

      html += `
        <div class="p-3.5 sm:p-4 flex items-center justify-between gap-3 hover:bg-white/[0.02] transition ${isHome ? 'bg-indigo-950/20' : ''}">
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="text-sm font-bold w-6 text-center shrink-0 ${idx === 0 ? 'text-amber-400' : 'text-slate-400'}">${rankEmoji}</span>
            <div class="min-w-0">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="font-bold text-white text-sm sm:text-base tracking-tight truncate">${this.escapeHtml(c.name)}</span>
                ${isHome ? '<span class="px-1.5 py-0.2 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shrink-0">내 클랜</span>' : ''}
              </div>
              <div class="text-[11px] font-mono text-slate-500 mt-0.5 flex items-center gap-1.5">
                <span>${this.escapeHtml(c.tag)}</span>
                <span class="text-slate-600">·</span>
                <span class="text-slate-400 font-sans">${c.membersCount}<span class="text-slate-500 font-normal">/50명</span></span>
              </div>
            </div>
          </div>
          <div class="text-right shrink-0">
            <div class="text-[10px] text-slate-500">주간 지원량</div>
            <div class="text-xs sm:text-sm font-black text-amber-400 font-mono mt-0.5">${c.donationsWeekly.toLocaleString()}개</div>
            <div class="mt-1">${diffBadge}</div>
          </div>
        </div>
      `;
    });
    container.innerHTML = html;
  }

  setFilterTab(filterType, element) {
    this.activeFilter = filterType;
    document.querySelectorAll(".filter-chip").forEach((btn) => btn.classList.remove("active"));
    if (element) element.classList.add("active");
    this.applyFilterAndRender();
  }

  setQuickFilter(filterType) {
    const targetBtn = document.querySelector(`.filter-chip[data-filter="${filterType}"]`);
    if (targetBtn) this.setFilterTab(filterType, targetBtn);
  }

  toggleSort(key) {
    if (this.sorting.key === key) {
      this.sorting.order = this.sorting.order === "desc" ? "asc" : "desc";
    } else {
      this.sorting.key = key;
      this.sorting.order = "desc";
    }
    if (this.elements.sortKeySelect) this.elements.sortKeySelect.value = this.sorting.key;
    this.updateSortOrderUI();
    this.applyFilterAndRender();
  }

  // 날짜 문자열 안전 파싱
  parseDateSafe(dateStr) {
    if (!dateStr) return null;
    if (window.crApi && typeof window.crApi.parseApiDate === "function") {
      const d = window.crApi.parseApiDate(dateStr);
      if (d && !isNaN(d.getTime())) return d;
    }
    try {
      const y = dateStr.slice(0, 4), m = dateStr.slice(4, 6), d = dateStr.slice(6, 8);
      const h = dateStr.slice(9, 11), min = dateStr.slice(11, 13), s = dateStr.slice(13, 15);
      const parsed = new Date(Date.UTC(y, m - 1, d, h, min, s));
      return isNaN(parsed.getTime()) ? null : parsed;
    } catch (e) {
      return null;
    }
  }

  // 슈퍼셀 공식 접속 시각(lastSeen) 및 최근 배틀 시각(lastBattleTime) 2중 검증 중 최신 시간 판정
  getEffectiveActiveDate(lastSeenStr, lastBattleStr) {
    const seenDate = this.parseDateSafe(lastSeenStr);
    const battleDate = this.parseDateSafe(lastBattleStr);

    let latest = seenDate;
    if (battleDate && (!latest || battleDate.getTime() > latest.getTime())) {
      latest = battleDate;
    }
    return latest || null;
  }

  // 3분(180초) 기준 '접속 중' 판정 (lastSeen 및 최근 배틀로그 2중 검증)
  getOnlineStatus(lastSeenStr, lastBattleStr) {
    const effectiveDate = this.getEffectiveActiveDate(lastSeenStr, lastBattleStr);
    if (!effectiveDate) {
      return { isOnline: false, text: "기록 없음", dotColor: "slate", isPulse: false, textColor: "text-slate-500" };
    }

    const diffSeconds = Math.max(0, Math.floor((Date.now() - effectiveDate.getTime()) / 1000));
    const diffMinutes = Math.floor(diffSeconds / 60);

    // 1. 3분(180초) 이내 활동 감지 시 -> '🟢 접속 중'
    if (diffSeconds <= 180) {
      return {
        isOnline: true,
        text: "접속 중",
        dotColor: "green",
        isPulse: true,
        textColor: "text-emerald-400 font-bold"
      };
    }

    // 2. 5분 초과 ~ 60분 미만 -> 'N분 전'
    if (diffMinutes < 60) {
      return {
        isOnline: false,
        text: `${diffMinutes}분 전`,
        dotColor: "green",
        isPulse: false,
        textColor: "text-slate-300 font-medium"
      };
    }

    // 3. 1시간 이상 ~ 24시간 미만
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return {
        isOnline: false,
        text: `${diffHours}시간 전`,
        dotColor: "amber",
        isPulse: false,
        textColor: "text-amber-300 font-medium"
      };
    }

    // 4. 1일 이상 (3일 이상은 미접속 경고)
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays >= 3) {
      return {
        isOnline: false,
        text: `${diffDays}일 전`,
        dotColor: "rose",
        isPulse: false,
        textColor: "text-rose-400 font-bold"
      };
    }

    return {
      isOnline: false,
      text: `${diffDays}일 전`,
      dotColor: "amber",
      isPulse: false,
      textColor: "text-amber-300 font-medium"
    };
  }

  // 상대 시간 포맷팅 도우미 (마지막 배틀용 - 150초 기준)
  formatRelativeTime(dateStr) {
    const date = this.parseDateSafe(dateStr);
    if (!date) return "기록 없음";

    const diffSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    const diffMinutes = Math.floor(diffSeconds / 60);

    if (diffSeconds <= 180) return "방금 전";
    if (diffMinutes < 60) return `${diffMinutes}분 전`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}시간 전`;

    const diffDays = Math.floor(diffHours / 24);
    // 7일(일주일) 이상 지난 경우 '7일+ 전'으로 직관적 표기
    if (diffDays >= 7) return "7일+ 전";
    return `${diffDays}일 전`;
  }

  applyFilterAndRender() {
    if (!this.currentData || !this.currentData.memberList) return;

    let list = [...this.currentData.memberList];
    const now = Date.now();

    if (this.searchQuery) {
      list = list.filter((m) =>
        (m.name && m.name.toLowerCase().includes(this.searchQuery)) ||
        (m.tag && m.tag.toLowerCase().includes(this.searchQuery))
      );
    }

    if (this.activeFilter === "dormant") {
      list = list.filter((m) => {
        const effectiveDate = this.getEffectiveActiveDate(m.lastSeen, m.lastBattleTime);
        if (!effectiveDate) return true; // 활동 기록 없는 멤버도 상단 통계와 일관되게 미접속자로 포함
        return (now - effectiveDate.getTime()) / (1000 * 60 * 60 * 24) >= 3;
      });
    } else if (this.activeFilter === "low-donations") {
      list = list.filter((m) => (m.donations || 0) < 50);
    }

    const { key, order } = this.sorting;

    // 정렬 성능 최적화: O(N log N) 비교 시 반복되는 Date 생성 및 파싱을 O(N)으로 1회 사전 연산
    if (key === "lastSeen" || key === "lastBattle") {
      list.forEach((m) => {
        if (key === "lastSeen") {
          const effectiveDate = this.getEffectiveActiveDate(m.lastSeen, m.lastBattleTime);
          m._sortTime = effectiveDate ? effectiveDate.getTime() : 0;
        } else {
          const battleDate = this.parseDateSafe(m.lastBattleTime);
          m._sortTime = battleDate ? battleDate.getTime() : 0;
        }
      });

      list.sort((a, b) => {
        return order === "desc" ? b._sortTime - a._sortTime : a._sortTime - b._sortTime;
      });
    } else {
      list.sort((a, b) => {
        const valA = a[key] || 0;
        const valB = b[key] || 0;
        return order === "desc" ? valB - valA : valA - valB;
      });
    }

    this.filteredMembers = list;
    this.renderDesktopTable();
    this.renderMobileList();

    if (window.lucide) window.lucide.createIcons();
  }

  getRoleBadge(role) {
    switch (role) {
      case "leader": return `<span class="badge-role badge-leader">대표</span>`;
      case "coLeader": return `<span class="badge-role badge-coleader">공동대표</span>`;
      case "elder": return `<span class="badge-role badge-elder">장로</span>`;
      default: return `<span class="badge-role badge-member">멤버</span>`;
    }
  }

  renderDesktopTable() {
    const tbody = this.elements.memberTableBody;
    const emptyState = this.elements.emptyState;
    if (!tbody) return;

    // 데스크톱 테이블 뷰가 CSS hidden 상태이면 불필요한 DOM 조작 생략
    const tableWrapper = tbody.closest('.hidden');
    if (tableWrapper && window.innerWidth < 1024) return;

    if (this.filteredMembers.length === 0) {
      tbody.innerHTML = "";
      if (emptyState) emptyState.classList.remove("hidden");
      return;
    }

    if (emptyState) emptyState.classList.add("hidden");

    let rowsHtml = "";

    this.filteredMembers.forEach((member, idx) => {
      const status = this.getOnlineStatus(member.lastSeen, member.lastBattleTime);
      const relativeBattle = this.formatRelativeTime(member.lastBattleTime);

      const effectiveDate = this.getEffectiveActiveDate(member.lastSeen, member.lastBattleTime);
      const exactSeen = effectiveDate ? effectiveDate.toLocaleString("ko-KR") : "기록 없음";

      const donations = member.donations || 0;
      const received = member.donationsReceived || 0;

      rowsHtml += `
        <tr>
          <td class="text-center font-mono text-xs text-slate-500">${member.clanRank || idx + 1}</td>
          <td>
            <div class="flex items-center gap-1.5">
              <span class="font-semibold text-white tracking-tight">${this.escapeHtml(member.name)}</span>
              ${this.getRoleBadge(member.role)}
            </div>
            <div class="flex items-center gap-2 text-[11px] text-slate-400 font-mono mt-0.5">
              <span>${this.escapeHtml(member.tag)}</span>
              <span class="text-amber-400/90 font-sans">🏆 ${(member.trophies || 0).toLocaleString()}</span>
            </div>
          </td>
          <td class="text-center">
            <div class="inline-flex items-center gap-1.5" title="${exactSeen}">
              <span class="status-dot ${status.dotColor} ${status.isPulse ? 'live-pulse' : ''}"></span>
              <span class="${status.textColor} text-xs">${status.text}</span>
            </div>
            <div class="text-[10px] text-indigo-300/80 font-mono mt-0.5">
              배틀: ${relativeBattle}
            </div>
          </td>
          <td class="text-right">
            <div class="font-bold text-sm ${donations >= 300 ? "text-amber-400" : donations === 0 ? "text-rose-400" : "text-slate-100"}">${donations.toLocaleString()}</div>
            <div class="text-[10px] text-slate-400 font-mono">받음: ${received.toLocaleString()}</div>
          </td>
        </tr>
      `;
    });
    tbody.innerHTML = rowsHtml;
  }

  renderMobileList() {
    const container = this.elements.memberMobileList;
    if (!container) return;
    if (this.filteredMembers.length === 0) {
      container.innerHTML = `
        <div class="py-14 text-center text-slate-500">
          <p class="text-xs font-medium">일치하는 클랜원이 없습니다.</p>
        </div>
      `;
      return;
    }

    const now = Date.now();
    let cardsHtml = "";

    this.filteredMembers.forEach((member, idx) => {
      // 상호 보정된 접속 상태
      const status = this.getOnlineStatus(member.lastSeen, member.lastBattleTime);
      const relativeBattle = this.formatRelativeTime(member.lastBattleTime);

      // 마지막 배틀 텍스트 색상 구분
      let battleTextColor = "text-slate-300";
      const battleDate = this.parseDateSafe(member.lastBattleTime);
      if (battleDate) {
        const battleSecsAgo = Math.floor((now - battleDate.getTime()) / 1000);
        if (battleSecsAgo <= 180) battleTextColor = "text-emerald-400 font-bold";
        else if (battleSecsAgo < 86400) battleTextColor = "text-indigo-300 font-semibold";
        else if (battleSecsAgo >= 604800) battleTextColor = "text-rose-400 font-bold";
        else if (battleSecsAgo >= 259200) battleTextColor = "text-rose-400/80 font-medium";
      }

      const donations = member.donations || 0;
      const received = member.donationsReceived || 0;

      cardsHtml += `
        <div class="mobile-member-card card-stagger-in" style="animation-delay: ${Math.min(idx * 0.035, 0.45)}s">
          <!-- 상단: 순위 + 닉네임 + 직급 & 우측 트로피 점수 -->
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="font-mono text-xs text-slate-500 w-4 shrink-0">${member.clanRank || idx + 1}</span>
              <span class="font-bold text-white text-[13px] truncate">${this.escapeHtml(member.name)}</span>
              ${this.getRoleBadge(member.role)}
            </div>
            <span class="text-xs font-semibold text-amber-400 shrink-0">🏆 ${(member.trophies || 0).toLocaleString()}</span>
          </div>

          <!-- 하단: 3열 균등 분할 [접속 상태 | 최근 배틀 | 주간 지원량] (디자인 안 1번) -->
          <div class="grid grid-cols-3 gap-1 pt-2.5 mt-2 border-t border-white/[0.03] items-center">
            <!-- 1열: 접속 상태 (좌측 정렬) -->
            <div class="text-left">
              <div class="text-[10px] text-slate-500 font-medium">접속 상태</div>
              <div class="text-xs ${status.textColor} mt-0.5 font-medium flex items-center gap-1 truncate">
                <span class="status-dot ${status.dotColor} ${status.isPulse ? 'live-pulse' : ''}"></span>
                <span class="truncate">${status.text}</span>
              </div>
            </div>

            <!-- 2열: 최근 배틀 (중앙 정렬) -->
            <div class="text-center">
              <div class="text-[10px] text-slate-500 font-medium">최근 배틀</div>
              <div class="text-xs ${battleTextColor} mt-0.5 font-medium flex items-center justify-center gap-1 truncate">
                <i data-lucide="swords" class="w-3 h-3 text-slate-500 shrink-0"></i>
                <span class="truncate">${relativeBattle}</span>
              </div>
            </div>

            <!-- 3열: 주간 지원량 (우측 정렬) -->
            <div class="text-right">
              <div class="text-[10px] text-slate-500 font-medium">주간 지원량</div>
              <div class="text-xs font-bold ${donations >= 300 ? 'text-amber-400' : donations === 0 ? 'text-rose-400' : 'text-slate-100'} mt-0.5 font-mono truncate">
                ${donations.toLocaleString()}<span class="text-[10px] font-normal text-slate-500 ml-0.5">/ ${received}</span>
              </div>
            </div>
          </div>
        </div>
      `;
    });
    container.innerHTML = cardsHtml;
  }

  escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

window.ClanManagerApp = ClanManagerApp;
if (typeof module !== "undefined" && module.exports) module.exports = ClanManagerApp;

document.addEventListener("DOMContentLoaded", () => {
  window.app = new ClanManagerApp();
});
