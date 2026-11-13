/**
 * Good Fellas Clan Manager - Core Application Logic (v1.8.2)
 * Ultra-Smooth 120fps Animation Engine:
 * - 상단 메인 탭 & 타 갤클 비교 탭에 하드웨어 가속 슬라이딩 필(Segmented Pill) 및 탭 뷰 글라이드 트랜지션 탑재
 * - 팝업 모달(3일+ 미접속 대상자, 클랜원 상세, 동기화 에러) 상시 마운트 + 양방향(열기/닫기) 120fps 스프링 트랜지션 구현
 * - 시상대(Podium) 단상 애니메이션을 Layout Reflow 없는 scale3d(1, scaleY, 1) GPU 합성으로 전환
 * - 도넛 차트 탭 전환 시 캔버스 파괴(destroy) 대신 비파괴 reset()+update() 적용으로 프레임 드랍 원천 차단
 */

console.log('%c[Good Fellas App] v1.8.25-beta - 라이트 모드 룰렛 이모지 배경 흰색(#ffffff) 지원 및 팝업 스크롤 락 해제 & Zero-Scale Lock - RoyaleAPI 팝업 라이트모드 지원 & 감각적인 소프트 옵시디언 서피스 & 120fps 스프링 인터랙션 & 고대비 타이포그래피', 'color: #10b981; font-weight: bold; font-size: 14px;');

const CR_EMOTES_POOL = [
  { name: "웃는 킹", url: "https://static.wikia.nocookie.net/clashroyale/images/8/84/HeHeHeHa.png/revision/latest?cb=20230915211717", offsetY: 0 },
  { name: "우는 킹", url: "https://static.wikia.nocookie.net/clashroyale/images/a/af/Crying_King.png/revision/latest?cb=20230915211808", offsetY: 0 },
  { name: "비명 호그라이더", url: "https://static.wikia.nocookie.net/clashroyale/images/b/b6/Hog_Rider_Scream.png/revision/latest?cb=20230922123136", offsetY: 0 },
  { name: "이마 짚는 고블린", url: "https://static.wikia.nocookie.net/clashroyale/images/d/dc/Facepalm_Goblin.png/revision/latest?cb=20230918084628", offsetY: 2 },
  { name: "브이 프린세스", url: "https://static.wikia.nocookie.net/clashroyale/images/0/0f/Peace_Princess.png/revision/latest?cb=20230920123025", offsetY: -3 },
  { name: "따봉 일렉트로 마법사", url: "https://static.wikia.nocookie.net/clashroyale/images/3/37/Electro_Wizard_Thumbs-Up.png/revision/latest?cb=20181027033128", offsetY: -2 },
  { name: "우는 해골", url: "https://static.wikia.nocookie.net/clashroyale/images/7/73/Crying_Skeleton.png/revision/latest?cb=20180921183431", offsetY: 3 },
  { name: "고기 뜯는 자이언트", url: "https://static.wikia.nocookie.net/clashroyale/images/b/bb/Eating_Giant.png/revision/latest?cb=20230920123020", offsetY: 0 }
];

const SWORDS_INLINE_SVG = `<svg class="w-3 h-3 text-slate-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" x2="19" y1="19" y2="13"/><line x1="16" x2="20" y1="16" y2="20"/><line x1="19" x2="21" y1="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" x2="9" y1="14" y2="18"/><line x1="7" x2="4" y1="17" y2="20"/><line x1="3" x2="5" y1="19" y2="21"/></svg>`;

const COMPARE_METRICS_META = {
  donationsWeekly: {
    title: "주간 총 지원량 비교",
    listTitle: "클랜별 핵심 현황 및 지원량 격차",
    unitText: "단위: 개",
    suffix: "개",
    label: "주간 지원량"
  },
  donationsAvg: {
    title: "1인당 평균 주간 지원량 비교",
    listTitle: "클랜별 1인 평균 지원량 및 격차",
    unitText: "단위: 개/인",
    suffix: "개",
    label: "1인 평균 지원"
  }
};

class ClanManagerApp {
  constructor() {
    this.currentData = null;
    this.filteredMembers = [];
    this.activeFilter = "all"; // 'all' | 'low-donations'
    this.searchQuery = "";
    this.sorting = { key: "lastSeen", order: "desc" };
    this.activeMainTab = "dashboard";
    this.activeCompareMetric = "donationsWeekly";
    this.compareTags = ["#G890J9JC", "#JYQRP2C2", "#Q0U22YGQ"];
    this.compareClansData = [];
    this.hasCompareLoaded = false;

    this.battleLogCache = this.loadBattleLogCache();
    this.charts = { activity: null, compareDonations: null };
    this.elements = {};

    this.lastSyncTime = 0;
    this.lastCompareSyncTime = 0;
    this.syncThrottleMs = 15000;
    this.compareThrottleMs = 30000;
    this.loadingStartTime = Date.now();
    this.lastTabSwitchTime = 0;

    this.init();
  }

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

  saveBattleLogCache() {
    try {
      const obj = Object.fromEntries(this.battleLogCache);
      localStorage.setItem("cr_clan_battle_cache_v5", JSON.stringify(obj));
    } catch (e) {}
  }

  init() {
    this.loadingStartTime = Date.now();
    this.lastTabSwitchTime = 0;
    this.emotesReadyPromise = this.renderRandomLoadingEmotes();

    try {
      document.addEventListener("touchstart", () => {}, { passive: true });
    } catch (e) {}

    this.cacheDOM();
    this.restoreSavedTheme();
    this.bindEvents();

    try {
      localStorage.removeItem("cr_manager_clan_cache_v1");
      localStorage.removeItem("cr_manager_settings_v1");
      localStorage.removeItem("cr_manager_cache_ver");
      localStorage.removeItem("cr_clan_donation_cache_v1");
      localStorage.removeItem("cr_clan_battle_cache_v2");
      localStorage.removeItem("cr_clan_battle_cache_v3");
      localStorage.removeItem("cr_clan_battle_cache_v4");
    } catch (e) {}

    if (window.crApi && typeof window.crApi.getGalleryClansPreset === "function") {
      this.compareClansData = window.crApi.getGalleryClansPreset();
    }

    if (window.lucide) window.lucide.createIcons();

    this.autoSyncLive(true);
    this.syncCompareLive(true);

    setInterval(() => {
      if (document.visibilityState === "visible") {
        this.autoSyncLive(false);
        if (this.activeMainTab === "compare" || Date.now() - this.lastCompareSyncTime >= 60000) {
          this.syncCompareLive(false);
        }
      }
    }, 20000);

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        const memberModal = document.getElementById("member-detail-modal");
        if (memberModal && memberModal.getAttribute("aria-hidden") === "true") {
          memberModal.classList.remove("is-open");
        }
        this.autoSyncLive(false);
        if (this.activeMainTab === "compare") {
          this.syncCompareLive(false);
        }
      }
    });

    setInterval(() => {
      if (document.visibilityState === "visible" && this.currentData) {
        this.renderMobileList(false);
        this.renderDesktopTable();
      }
    }, 60000);

    window.addEventListener("resize", () => {
      if (this.currentData) {
        if (window.innerWidth >= 1024) {
          this.renderDesktopTable();
        } else {
          this.renderMobileList(false);
        }
      }
    });
  }

  cacheDOM() {
    this.elements = {
      initialSyncModal: document.getElementById("initial-sync-modal"),
      searchInput: document.getElementById("search-input"),
      btnSearchClear: document.getElementById("btn-search-clear"),
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
      mainTabPill: document.getElementById("main-tab-pill"),
      compareTabPill: document.getElementById("compare-tab-pill"),
      tabContextHint: document.getElementById("tab-context-hint"),
      btnQuickCompare: document.getElementById("btn-quick-compare"),
      clanName: document.getElementById("clan-name"),
      clanTag: document.getElementById("clan-tag"),
      clanDesc: document.getElementById("clan-desc"),
      statTotalMembers: document.getElementById("stat-total-members"),
      statMemberVacant: document.getElementById("stat-member-vacant"),
      statTotalDonations: document.getElementById("stat-total-donations"),
      statAvgDonations: document.getElementById("stat-avg-donations"),
      statDormantCount: document.getElementById("stat-dormant-count"),
      chipCountAll: document.getElementById("chip-count-all"),
      chipCountLow: document.getElementById("chip-count-low"),
      podiumContainer: document.getElementById("podium-container"),
      podiumRunnersContainer: document.getElementById("podium-runners-container"),
      chartActivity: document.getElementById("chart-activity"),
      chartCompareDonations: document.getElementById("chart-compare-donations"),
      compareBarsStage: document.getElementById("compare-bars-stage"),
      compareChartContainer: document.getElementById("compare-chart-container"),
      compareChartTitle: document.getElementById("compare-chart-title"),
      compareChartUnit: document.getElementById("compare-chart-unit"),
      compareListTitle: document.getElementById("compare-list-title"),
      compareSummaryList: document.getElementById("compare-summary-list"),
      memberTableBody: document.getElementById("member-table-body"),
      emptyState: document.getElementById("empty-state"),
      memberMobileList: document.getElementById("member-mobile-list"),
      memberDetailModal: document.getElementById("member-detail-modal"),
      dormantMembersModal: document.getElementById("dormant-members-modal"),
      dormantModalCount: document.getElementById("dormant-modal-count"),
      dormantModalList: document.getElementById("dormant-modal-list"),
      syncErrorModal: document.getElementById("sync-error-modal"),
      toastContainer: document.getElementById("toast-container")
    };
  }

  restoreSavedTheme() {
    try {
      const saved = localStorage.getItem("cr_theme");
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const initialTheme = saved === "light" || (!saved && !prefersDark) ? "light" : "dark";
      this.applyTheme(initialTheme, false);
    } catch (e) {}
  }

  // 상시 마운트된 모달을 레이아웃 스래싱 없이 120fps로 부드럽게 오픈
  openModalSmooth(modalEl) {
    if (!modalEl) return;
    modalEl.setAttribute("aria-hidden", "false");
    modalEl.classList.add("is-open");
  }

  // 모달 닫힘 애니메이션 후 비활성화
  closeModalSmooth(modalEl) {
    if (!modalEl) return;
    modalEl.setAttribute("aria-hidden", "true");
    modalEl.classList.remove("is-open");
    document.body.style.overflow = "";
  }

  async renderRandomLoadingEmotes() {
    const container = document.getElementById("loading-emotes-container");
    if (!container) return;

    const shuffled = [...CR_EMOTES_POOL].sort(() => Math.random() - 0.5);
    this.targetEmotes = shuffled.slice(0, 3);
    this.slotStopTriggered = false;

    container.innerHTML = this.targetEmotes.map((_, idx) => `
      <div class="slot-window relative w-16 h-16 sm:w-20 sm:h-20 shrink-0 overflow-hidden rounded-2xl border" id="slot-window-${idx}"></div>
    `).join("");

    const preloadPromises = CR_EMOTES_POOL.map((emote) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.src = emote.url;
        img.onload = () => resolve();
        img.onerror = () => resolve();
      });
    });

    const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 1500));
    await Promise.race([Promise.all(preloadPromises), timeoutPromise]);

    const loopItems = [...CR_EMOTES_POOL, ...CR_EMOTES_POOL];
    const itemsHtml = loopItems.map((item) => `
      <div class="slot-item w-16 h-16 sm:w-20 sm:h-20 shrink-0 flex items-center justify-center">
        <div class="w-full h-full flex items-center justify-center" style="transform: translateY(${item.offsetY || 0}px);">
          <img src="${item.url}" 
               alt="${item.name}" 
               class="w-16 h-16 sm:w-20 sm:h-20 object-contain pointer-events-none select-none" />
        </div>
      </div>
    `).join("");

    container.innerHTML = [0, 1, 2].map((slotIdx) => `
      <div class="slot-window relative w-16 h-16 sm:w-20 sm:h-20 shrink-0 overflow-hidden rounded-2xl border" id="slot-window-${slotIdx}">
        <div class="slot-reel-strip absolute top-0 left-0 w-full flex flex-col items-center slot-spin-infinite-${slotIdx}" id="slot-reel-${slotIdx}">
          ${itemsHtml}
        </div>
      </div>
    `).join("");

    this.loadingStartTime = Date.now();
    this.lastTabSwitchTime = 0;
  }

  stopSlotReel(slotIdx, targetEmote) {
    const reelEl = document.getElementById(`slot-reel-${slotIdx}`);
    const windowEl = document.getElementById(`slot-window-${slotIdx}`);
    if (!reelEl || !windowEl) return;

    const pool = CR_EMOTES_POOL.filter(e => e.name !== targetEmote.name);
    const dummies = [];
    for (let i = 0; i < 4; i++) {
      dummies.push(pool[Math.floor(Math.random() * pool.length)]);
    }
    const decelItems = [...dummies, targetEmote];

    const decelHtml = decelItems.map((item) => `
      <div class="slot-item w-16 h-16 sm:w-20 sm:h-20 shrink-0 flex items-center justify-center">
        <div class="w-full h-full flex items-center justify-center" style="transform: translateY(${item.offsetY || 0}px);">
          <img src="${item.url}" 
               alt="${item.name}" 
               class="w-16 h-16 sm:w-20 sm:h-20 object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.35)] pointer-events-none select-none" />
        </div>
      </div>
    `).join("");

    reelEl.className = "slot-reel-strip absolute top-0 left-0 w-full flex flex-col items-center slot-stopping";
    reelEl.innerHTML = decelHtml;

    setTimeout(() => {
      windowEl.classList.add("slot-locked");
    }, 420);
  }

  async triggerSlotStopSequence() {
    if (this.slotStopTriggered) return;
    this.slotStopTriggered = true;

    const elapsed = Date.now() - (this.loadingStartTime || Date.now());
    const minSpinDuration = 550;
    if (elapsed < minSpinDuration) {
      await new Promise(r => setTimeout(r, minSpinDuration - elapsed));
    }

    const targets = this.targetEmotes || CR_EMOTES_POOL.slice(0, 3);

    this.stopSlotReel(0, targets[0]);
    await new Promise(r => setTimeout(r, 180));
    this.stopSlotReel(1, targets[1]);
    await new Promise(r => setTimeout(r, 180));
    this.stopSlotReel(2, targets[2]);

    await new Promise(r => setTimeout(r, 420 + 260));
    await this.hideInitialSyncModal();
  }

  async hideInitialSyncModal() {
    const modal = this.elements.initialSyncModal;
    if (!modal || modal.dataset.dismissed) return;
    modal.dataset.dismissed = "true";

    for (let i = 0; i < 3; i++) {
      document.getElementById(`slot-window-${i}`)?.classList.add("slot-locked");
    }

    await new Promise((resolve) => setTimeout(resolve, 280));

    modal.style.transition = "opacity 0.28s ease, visibility 0.28s ease";
    modal.style.opacity = "0";
    modal.style.pointerEvents = "none";

    if (this.currentData?.memberList) {
      this.renderPodium(this.currentData.memberList, true);
      this.renderActivityDonut(this.currentData.memberList, true);
      setTimeout(() => {
        this.elements.podiumContainer?.classList.remove("podium-animate");
        this.elements.podiumRunnersContainer?.classList.remove("podium-animate");
      }, 900);
    }

    setTimeout(() => {
      modal.classList.add("hidden");
      const emotesContainer = document.getElementById("loading-emotes-container");
      if (emotesContainer) emotesContainer.innerHTML = "";
    }, 290);
  }

  bindEvents() {
    const { searchInput, btnSearchClear, sortKeySelect, btnSortOrder } = this.elements;

    if (searchInput) {
      let searchTimeout;
      searchInput.addEventListener("input", (e) => {
        const rawVal = e.target.value;
        if (btnSearchClear) {
          btnSearchClear.classList.toggle("hidden", !rawVal.trim());
          btnSearchClear.classList.toggle("flex", Boolean(rawVal.trim()));
        }
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          this.searchQuery = rawVal.trim().toLowerCase();
          this.applyFilterAndRender(true);
        }, 220);
      });
    }

    if (sortKeySelect) {
      sortKeySelect.addEventListener("change", (e) => {
        this.sorting.key = e.target.value;
        this.applyFilterAndRender(true);
      });
    }

    if (btnSortOrder) {
      btnSortOrder.addEventListener("click", () => this.toggleSortOrder());
    }

    if (this.elements.btnThemeToggle) {
      this.elements.btnThemeToggle.addEventListener("click", (e) => this.toggleTheme(e));
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.closeMemberModal();
        this.closeDormantModal();
        this.closeErrorModal();
      }
    });
  }

  clearSearch() {
    const { searchInput, btnSearchClear } = this.elements;
    if (searchInput) searchInput.value = "";
    if (btnSearchClear) {
      btnSearchClear.classList.add("hidden");
      btnSearchClear.classList.remove("flex");
    }
    if (this.searchQuery !== "") {
      this.searchQuery = "";
      this.applyFilterAndRender(true);
    }
  }

  resetFiltersAndSearch() {
    this.searchQuery = "";
    if (this.elements.searchInput) this.elements.searchInput.value = "";
    if (this.elements.btnSearchClear) {
      this.elements.btnSearchClear.classList.add("hidden");
      this.elements.btnSearchClear.classList.remove("flex");
    }
    const allChip = document.querySelector('.filter-chip[data-filter="all"]');
    this.setFilterTab("all", allChip);
    this.showToast("검색 및 필터 조건이 초기화되었습니다.");
  }

  showToast(message, type = "info") {
    const container = this.elements.toastContainer || document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = "toast-pill";
    const dotColor = type === "error" ? "bg-rose-400" : type === "success" ? "bg-emerald-400" : "bg-indigo-400";
    toast.innerHTML = `
      <span class="w-1.5 h-1.5 rounded-full ${dotColor} shrink-0"></span>
      <span>${this.escapeHtml(message)}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add("toast-leaving");
      setTimeout(() => toast.remove(), 220);
    }, 2200);
  }

  toggleTheme(e) {
    const isDark = document.documentElement.classList.contains("dark");
    const nextTheme = isDark ? "light" : "dark";

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

    const endRadius = Math.ceil(Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    ));

    document.documentElement.style.setProperty("--theme-x", `${x}px`);
    document.documentElement.style.setProperty("--theme-y", `${y}px`);
    document.documentElement.style.setProperty("--theme-r", `${endRadius}px`);

    if (typeof document.startViewTransition === "function") {
      const transition = document.startViewTransition(() => {
        this.applyTheme(nextTheme, false);
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
          } catch (err) {}
        });
      }
    } else {
      this.triggerFallbackRipple(x, y, endRadius, nextTheme);
      this.applyTheme(nextTheme, false);
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

  applyTheme(theme, shouldStagger = false) {
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
      donutChart.update("none");
    }

    if (this.activeMainTab === "compare") {
      this.renderComparisonView(false);
    }

    if (this.currentData) {
      this.applyFilterAndRender(shouldStagger);
    }
  }

  toggleSortOrder() {
    this.sorting.order = this.sorting.order === "desc" ? "asc" : "desc";
    this.updateSortOrderUI();
    this.applyFilterAndRender(true);
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

  // 120fps 슬라이딩 필 & 뷰 글라이드 기반 메인 탭 전환
  switchMainTab(tabName) {
    if (this.activeMainTab === tabName) return;
    this.activeMainTab = tabName;
    this.lastTabSwitchTime = Date.now();

    const { viewDashboard, viewCompare, tabBtnDashboard, tabBtnCompare, mainTabPill, tabContextHint: tabHint, btnQuickCompare: quickCompareBtn } = this.elements;

    // 1. 슬라이딩 필 즉시 이동 (GPU transform)
    if (mainTabPill) {
      mainTabPill.classList.toggle("slide-right", tabName === "compare");
    }

    if (tabBtnDashboard) tabBtnDashboard.classList.toggle("active", tabName !== "compare");
    if (tabBtnCompare) tabBtnCompare.classList.toggle("active", tabName === "compare");

    // smooth 스크롤과 탭 전환 애니메이션이 충돌하지 않도록 스크롤이 내려가 있을 때만 즉시 상단 정렬
    if (window.scrollY > 60) {
      window.scrollTo(0, 0);
    }

    if (tabName === "compare") {
      if (viewDashboard) {
        viewDashboard.classList.add("hidden");
        viewDashboard.classList.remove("tab-view-enter");
      }
      if (viewCompare) {
        viewCompare.classList.remove("hidden");
        viewCompare.classList.remove("tab-view-enter");
        void viewCompare.offsetWidth;
        viewCompare.classList.add("tab-view-enter");
      }

      if (quickCompareBtn) quickCompareBtn.classList.add("opacity-50", "pointer-events-none");
      if (tabHint) {
        tabHint.innerHTML = `<span class="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400"></span><span>디시 갤러리 클랜 3자 비교 뷰</span>`;
      }

      requestAnimationFrame(() => {
        setTimeout(() => {
          this.renderComparisonView(true);
        }, 60);
      });

      if (!this.hasCompareLoaded || Date.now() - this.lastCompareSyncTime > this.compareThrottleMs) {
        this.syncCompareLive(false);
      }
    } else {
      if (viewCompare) {
        viewCompare.classList.add("hidden");
        viewCompare.classList.remove("tab-view-enter");
      }
      if (viewDashboard) {
        viewDashboard.classList.remove("hidden");
        viewDashboard.classList.remove("tab-view-enter");
        void viewDashboard.offsetWidth;
        viewDashboard.classList.add("tab-view-enter");
      }

      if (quickCompareBtn) quickCompareBtn.classList.remove("opacity-50", "pointer-events-none");
      if (tabHint) {
        tabHint.innerHTML = `<span class="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400"></span><span>Good Fellas 단독 뷰</span>`;
      }

      requestAnimationFrame(() => {
        if (this.currentData?.memberList) {
          this.renderPodium(this.currentData.memberList, true);
          this.renderActivityDonut(this.currentData.memberList, true);
          setTimeout(() => {
            this.elements.podiumContainer?.classList.remove("podium-animate");
            this.elements.podiumRunnersContainer?.classList.remove("podium-animate");
          }, 700);
        }
      });
    }
  }

  // 120fps 슬라이딩 필 기반 비교 지표 전환 (총 지원량 ↔ 1인 평균)
  switchCompareMetric(metricKey, btnElement) {
    if (!COMPARE_METRICS_META[metricKey] || this.activeCompareMetric === metricKey) return;
    this.activeCompareMetric = metricKey;

    if (this.elements.compareTabPill) {
      this.elements.compareTabPill.classList.toggle("slide-right", metricKey === "donationsAvg");
    }

    document.querySelectorAll(".compare-metric-chip").forEach((el) => el.classList.remove("active"));
    if (btnElement) btnElement.classList.add("active");

    const meta = COMPARE_METRICS_META[metricKey];
    if (this.elements.compareChartTitle) this.elements.compareChartTitle.textContent = meta.title;
    if (this.elements.compareChartUnit) this.elements.compareChartUnit.textContent = meta.unitText;
    if (this.elements.compareListTitle) this.elements.compareListTitle.textContent = meta.listTitle;

    requestAnimationFrame(() => {
      this.renderComparisonView(true);
    });
  }

  async fetchPlayerBattleLog(playerTag, retries = 1) {
    if (!playerTag) return null;
    const normalized = encodeURIComponent(window.crApi ? window.crApi.normalizeTag(playerTag) : playerTag);
    const proxy = window.crApi?.settings?.workerUrl || window.crApi?.workerUrl || "https://green-disk-88a6.marble593812345.workers.dev";
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

  async fetchAllMembersBattleLogs(members) {
    if (!Array.isArray(members) || members.length === 0) return;

    let hasNewData = false;
    const chunkSize = 10;

    for (let i = 0; i < members.length; i += chunkSize) {
      const chunk = members.slice(i, i + chunkSize);

      const chunkPromises = chunk.map(async (m) => {
        if (this.battleLogCache.has(m.tag)) {
          const cached = this.battleLogCache.get(m.tag);
          if (!m.lastBattleTime || cached.time > m.lastBattleTime) {
            m.lastBattleTime = cached.time;
            m.lastBattleType = cached.type;
          }
        }

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
          if (!this.battleLogCache.has(m.tag) || this.battleLogCache.get(m.tag).time !== "none") {
            this.battleLogCache.set(m.tag, { time: "none", type: "None" });
            m._noBattles = true;
            hasNewData = true;
          }
        }
      });

      await Promise.allSettled(chunkPromises);

      if (hasNewData) {
        this.saveBattleLogCache();
        this.applyFilterAndRender(false);
        this.updateStats(this.currentData);
      }

      if (i + chunkSize < members.length) {
        await new Promise((r) => setTimeout(r, 40));
      }
    }
  }

  processIncomingClanData(liveData, shouldAnimate = false) {
    if (!liveData || !liveData.memberList) return;

    // 모달 팝업이 활성화되어 있는 동안 백그라운드 DOM 전면 재렌더링을 보류하여 팝업 레이아웃 요동/소폭 축소(Reflow) 완벽 방지
    const memberModal = this.elements.memberDetailModal || document.getElementById("member-detail-modal");
    const dormantModal = this.elements.dormantMembersModal || document.getElementById("dormant-members-modal");
    const isModalOpen = (memberModal && memberModal.classList.contains("is-open")) ||
                        (dormantModal && dormantModal.classList.contains("is-open"));
    if (isModalOpen) {
      this.pendingClanData = { liveData, shouldAnimate };
      return;
    }

    const missingBattleMembers = liveData.memberList.filter((m) => (!m.lastBattleTime || m._fromCache) && !m._noBattles);

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

    this.bindCachedBattleLogs(liveData.memberList);
    this.renderClan(liveData, shouldAnimate, shouldAnimate);

    if (shouldAnimate) {
      setTimeout(() => {
        this.elements.podiumContainer?.classList.remove("podium-animate");
        this.elements.podiumRunnersContainer?.classList.remove("podium-animate");
      }, 850);
    }

    if (missingBattleMembers.length > 0) {
      this.fetchAllMembersBattleLogs(missingBattleMembers);
    }
  }

  async autoSyncLive(isManual = false) {
    const now = Date.now();
    if (!isManual && (now - this.lastSyncTime < this.syncThrottleMs)) {
      return;
    }
    this.lastSyncTime = now;

    const isInitial = !this.elements.initialSyncModal?.dataset?.dismissed;
    const tag = window.crApi?.settings?.clanTag || "#G890J9JC";

    try {
      let resolvedAfterTimeout = false;

      const dataFetchPromise = window.crApi.fetchClanFullData(tag, null, isManual).then((liveData) => {
        if (resolvedAfterTimeout && liveData && liveData.memberList) {
          this.processIncomingClanData(liveData, false);
        }
        return liveData;
      });

      if (isInitial && this.emotesReadyPromise) {
        await this.emotesReadyPromise;
      }

      const timeoutFallback = new Promise((resolve) => setTimeout(() => resolve("TIMEOUT"), 2500));
      const raceResult = isInitial
        ? await Promise.race([dataFetchPromise, timeoutFallback])
        : await dataFetchPromise;

      if (raceResult === "TIMEOUT") {
        resolvedAfterTimeout = true;
        if (!this.currentData) {
          const presets = window.crApi?.getGalleryClansPreset() || [];
          const homeClan = presets.find(p => p.isHome) || presets[0];
          if (homeClan) {
            this.renderClan({ ...homeClan, memberList: [] }, false, false);
          }
        }
      } else if (raceResult && raceResult.memberList) {
        const shouldAnimateManual = isManual && !isInitial;
        this.processIncomingClanData(raceResult, shouldAnimateManual);
      }

      if (isInitial) {
        await this.triggerSlotStopSequence();
      }
    } catch (err) {
      console.error("실시간 최신 동기화 실패:", err.message);

      if (!this.currentData) {
        const presets = window.crApi?.getGalleryClansPreset() || [];
        const homeClan = presets.find(p => p.isHome) || presets[0];
        if (homeClan) {
          this.renderClan({ ...homeClan, memberList: [] }, false, false);
        }
        this.renderEmptyState(err.message);
        this.showErrorModal(err);
      } else if (isManual) {
        this.showToast(`데이터 갱신 실패: ${err.message}`, "error");
      }
    } finally {
      if (isInitial) {
        await this.triggerSlotStopSequence();
      }
    }
  }

  async syncCompareLive(force = false) {
    const now = Date.now();
    if (!force && (now - this.lastCompareSyncTime < this.compareThrottleMs)) {
      return;
    }
    this.lastCompareSyncTime = now;

    try {
      if (window.crApi && typeof window.crApi.fetchMultipleClans === "function") {
        const liveClans = await window.crApi.fetchMultipleClans(this.compareTags, this.currentData);
        if (Array.isArray(liveClans) && liveClans.length > 0) {
          this.compareClansData = liveClans;
          this.hasCompareLoaded = true;
        }
      }
    } catch (e) {
      console.warn("갤클 비교 실시간 조회 오류 (프리셋 유지):", e.message);
    } finally {
      if (this.activeMainTab === "compare" && (Date.now() - this.lastTabSwitchTime >= 1000)) {
        this.renderComparisonView(false);
      }
    }
  }

  showErrorModal(err) {
    const modal = this.elements.syncErrorModal || document.getElementById("sync-error-modal");
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
        this.autoSyncLive(true);
      };
    }

    if (btnClose) {
      btnClose.onclick = () => this.closeErrorModal();
    }

    this.openModalSmooth(modal);
    if (window.lucide) window.lucide.createIcons();
  }

  closeErrorModal() {
    const modal = this.elements.syncErrorModal || document.getElementById("sync-error-modal");
    this.closeModalSmooth(modal);
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
        <button onclick="window.app.autoSyncLive(true)" class="mt-3 px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.1] text-xs text-slate-200 rounded-lg border border-white/[0.08] transition inline-flex items-center gap-1.5">
          <span>다시 시도</span>
        </button>
      </div>
    `;

    if (mobileList) mobileList.innerHTML = emptyHtml;
    if (desktopTbody) {
      desktopTbody.innerHTML = `<tr><td colspan="4" class="py-10 text-center text-xs text-slate-500">${this.escapeHtml(reason || "데이터 수신 실패")}</td></tr>`;
    }
    if (emptyState) emptyState.classList.add("hidden");
  }

  renderClan(clanData, triggerAnimation = false, shouldStaggerList = false) {
    const isFirstRender = !this.currentData || !this.currentData.memberList || this.currentData.memberList.length === 0;
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

      if (this.activeMainTab === "compare" && (Date.now() - this.lastTabSwitchTime >= 1000)) {
        this.renderComparisonView(false);
      }
    }

    this.updateStats(clanData);
    this.renderCharts(clanData.memberList || [], triggerAnimation);
    this.applyFilterAndRender(isFirstRender || shouldStaggerList);
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

    const { statTotalMembers, statMemberVacant, statTotalDonations, statAvgDonations, statDormantCount, chipCountAll, chipCountLow } = this.elements;

    if (statTotalMembers) this.animateNumber(statTotalMembers, totalMembers, 600, " / 50");
    if (statMemberVacant) statMemberVacant.textContent = `여유 자리: ${50 - totalMembers}석`;
    if (statTotalDonations) this.animateNumber(statTotalDonations, officialWeeklyDonations, 700);
    if (statAvgDonations) statAvgDonations.textContent = `1인 평균 ${avgDonations.toLocaleString()}개`;
    if (statDormantCount) this.animateNumber(statDormantCount, dormantCount, 500, "명");

    if (chipCountAll) this.animateNumber(chipCountAll, totalMembers, 400);
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

    const basePodiumClasses = "flex items-end justify-center gap-2 pt-4 pb-0 px-1 min-h-[140px]";
    podiumContainer.className = triggerAnimation ? `${basePodiumClasses} podium-animate` : basePodiumClasses;

    podiumContainer.innerHTML = `
      <!-- 2등 은메달 -->
      <div class="flex-1 max-w-[130px] flex flex-col items-center" onclick="window.app.openMemberModal('${this.escapeHtml(second.tag)}')">
        <div class="podium-header text-center mb-1.5 w-full px-1 cursor-pointer" style="animation-delay: 0.06s">
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
      <!-- 1등 금메달 -->
      <div class="flex-1 max-w-[145px] flex flex-col items-center" onclick="window.app.openMemberModal('${this.escapeHtml(first.tag)}')">
        <div class="podium-header text-center mb-1.5 w-full px-1 cursor-pointer">
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
      <!-- 3등 동메달 -->
      <div class="flex-1 max-w-[130px] flex flex-col items-center" onclick="window.app.openMemberModal('${this.escapeHtml(third.tag)}')">
        <div class="podium-header text-center mb-1.5 w-full px-1 cursor-pointer" style="animation-delay: 0.12s">
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
        <div onclick="window.app.openMemberModal('${this.escapeHtml(m.tag)}')" class="podium-runner-item cursor-pointer hover:bg-white/[0.05] active:scale-[0.98] transition flex items-center justify-between p-1.5 rounded bg-white/[0.02] border border-white/[0.04]" style="${triggerAnimation ? `animation-delay: ${0.16 + idx * 0.045}s` : ''}">
          <div class="flex items-center gap-1 min-w-0">
            <span class="text-[10px] font-mono text-slate-500 w-3">${idx + 4}</span>
            <span class="text-[11px] text-slate-300 font-medium truncate">${this.escapeHtml(m.name)}</span>
          </div>
          <span class="text-[11px] font-bold text-slate-400 shrink-0 ml-1">${(m.donations || 0).toLocaleString()}</span>
        </div>
      `).join("");
    }
  }

  // 비파괴(Non-destructive) reset+update로 탭 전환 시 차트 재생성 끊김 현상 완전 제거
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

    if (this.charts.activity && triggerAnimation) {
      this.charts.activity.destroy();
      this.charts.activity = null;
    }

    if (this.charts.activity) {
      this.charts.activity.data.datasets[0].data = chartData;
      this.charts.activity.update("none");
    } else {
      const isLight = document.documentElement.classList.contains("light");
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
            duration: 680,
            easing: "easeOutQuart"
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

  renderComparisonView(triggerAnimation = false) {
    let clans = this.compareClansData;
    if (!Array.isArray(clans) || clans.length === 0) {
      clans = window.crApi?.getGalleryClansPreset() || [];
      this.compareClansData = clans;
    }

    const metricKey = COMPARE_METRICS_META[this.activeCompareMetric] ? this.activeCompareMetric : "donationsWeekly";

    const enriched = clans.map((c) => {
      const isHome = (c.tag || "").toUpperCase() === "#G890J9JC" || c.isHome === true;
      const membersCount = typeof c.members === "number" ? c.members : (c.memberList?.length || 0);
      const donationsWeekly = typeof c.donationsPerWeek === "number" ? c.donationsPerWeek : 0;
      const donationsAvg = Math.round(donationsWeekly / (membersCount || 1));
      return {
        ...c,
        isHome,
        membersCount,
        donationsWeekly,
        donationsAvg
      };
    });

    const sortedClans = [...enriched].sort((a, b) => (b[metricKey] || 0) - (a[metricKey] || 0));
    sortedClans.forEach((c, idx) => { c.metricRank = idx + 1; });

    this.renderCompareCharts(sortedClans, metricKey, triggerAnimation);
    this.renderCompareSummaryList(sortedClans, metricKey, triggerAnimation);
  }

  renderCompareCharts(clans, metricKey = "donationsWeekly", triggerAnimation = false) {
    const stage = this.elements?.compareBarsStage || document.getElementById("compare-bars-stage") || this.elements?.compareChartContainer || document.getElementById("compare-chart-container");
    if (!stage) return;

    const meta = COMPARE_METRICS_META[metricKey] || COMPARE_METRICS_META.donationsWeekly;
    const isDonation = metricKey === "donationsWeekly";
    const values = clans.map((c) => c[metricKey] || 0);
    const maxVal = Math.max(...values, 1);

    // 가로선 눈금 기준 계산 (총 지원량: 5,000단위, 1인 평균: 50단위 올림)
    let tickMax = Math.ceil(maxVal * 1.15);
    if (isDonation) {
      tickMax = Math.max(5000, Math.ceil(tickMax / 5000) * 5000);
    } else {
      tickMax = Math.max(50, Math.ceil(tickMax / 50) * 50);
    }

    const tickSteps = [
      { val: tickMax, percent: 100 },
      { val: Math.round(tickMax * 0.75), percent: 75 },
      { val: Math.round(tickMax * 0.5), percent: 50 },
      { val: Math.round(tickMax * 0.25), percent: 25 },
      { val: 0, percent: 0 }
    ];

    const isLight = document.documentElement.classList.contains("light");

    let html = `
      <!-- 단일 절대 좌표계 플롯 박스 (left: 44px, right: 10px, top: 26px, bottom: 28px) -->
      <div class="absolute left-11 sm:left-12 right-2.5 sm:right-3.5 top-6 sm:top-7 bottom-7 sm:bottom-7">
        
        <!-- 1. 정적 가로선 그리드 (플롯 박스의 bottom: 0% ~ 100%에 정확히 고정) -->
        <div class="absolute inset-0 pointer-events-none z-0">
          ${tickSteps.map((t) => `
            <div class="absolute left-0 right-0 border-b ${t.percent === 0 ? 'border-white/[0.14] compare-baseline' : 'border-white/[0.05]'} compare-grid-line" style="bottom: ${t.percent}%;">
              <span class="absolute right-full mr-2 sm:mr-2.5 text-[10px] sm:text-[11px] font-mono text-slate-400 compare-tick-text select-none text-right whitespace-nowrap" style="top: 0; transform: translateY(-50%);">${t.val.toLocaleString()}</span>
            </div>
          `).join("")}
        </div>

        <!-- 2. 플롯 박스와 동일한 좌표계를 공유하는 3대 클랜 막대 영역 -->
        <div id="compare-bars-wrapper" class="absolute inset-0 flex items-end justify-between px-1.5 sm:px-5 pointer-events-none z-10 ${triggerAnimation ? 'compare-animate' : ''}">
    `;

    clans.forEach((c, idx) => {
      const val = c[metricKey] || 0;
      // 0이어도 최소 3.5%는 표시되어 기준선 위에 살짝 보이도록 설정, 최대 100%
      const barHeightPercent = Math.max(3.5, Math.min(100, (val / tickMax) * 100));

      let barClasses = "bg-gradient-to-t from-[#d41f45] to-[#eb3a60] border-t border-x border-white/20 shadow-[0_4px_14px_rgba(0,0,0,0.25)]";

      if (c.isHome) {
        barClasses = "bg-gradient-to-t from-[#3d4ac6] to-[#4f5ddb] border-t border-x border-white/20 shadow-[0_4px_14px_rgba(0,0,0,0.25)]";
      } else if ((c.name || "").includes("Vandros")) {
        barClasses = "bg-gradient-to-t from-[#059669] to-[#10b981] border-t border-x border-white/20 shadow-[0_4px_14px_rgba(0,0,0,0.25)]";
      }

      html += `
        <div class="flex-1 max-w-[95px] sm:max-w-[130px] h-full flex flex-col justify-end items-center relative pointer-events-auto">
          <!-- 막대 본체 + 상단 수치 (레퍼런스 이미지 디자인 일치: w-[76%] sm:w-[72%] max-w-[72px] sm:max-w-[96px]) -->
          <div class="w-[76%] sm:w-[72%] max-w-[72px] sm:max-w-[96px] relative flex justify-center" style="height: ${barHeightPercent.toFixed(2)}%;">
            <div class="compare-bar-header compare-bar-header-${idx} absolute bottom-full mb-1 sm:mb-1.5 left-1/2 -translate-x-1/2 text-center pointer-events-none whitespace-nowrap">
              <span class="text-xs sm:text-[13px] font-bold tracking-tight text-white compare-header-num">${val.toLocaleString()}${meta.suffix}</span>
            </div>
            <div class="compare-bar compare-bar-${idx} w-full h-full rounded-t-xl ${barClasses}"></div>
          </div>
          <!-- 0선(바닥) 아래에 고정되는 클랜 이름 (레퍼런스 이미지 일치: 볼드 화이트) -->
          <div class="compare-clan-name absolute top-full pt-1.5 sm:pt-2 w-full text-center text-xs sm:text-[13px] font-bold text-white tracking-tight truncate select-none" title="${this.escapeHtml(c.name)}">
            ${this.escapeHtml(c.name)}
          </div>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;

    stage.innerHTML = html;

    if (triggerAnimation) {
      setTimeout(() => {
        const barsWrapper = document.getElementById("compare-bars-wrapper");
        if (barsWrapper) barsWrapper.classList.remove("compare-animate");
      }, 850);
    }
  }

  renderCompareSummaryList(clans, metricKey = "donationsWeekly", triggerAnimation = false) {
    const container = this.elements.compareSummaryList;
    if (!container) return;

    const meta = COMPARE_METRICS_META[metricKey] || COMPARE_METRICS_META.donationsWeekly;
    const homeClan = clans.find((c) => c.isHome) || clans[0];
    const homeValue = homeClan?.[metricKey] || 0;

    let html = "";
    clans.forEach((c, idx) => {
      const isHome = c.isHome;
      const currentVal = c[metricKey] || 0;
      const diffVal = currentVal - homeValue;

      const popClass = triggerAnimation ? "badge-pop" : "";
      const animStyle = triggerAnimation ? `style="animation-delay: ${0.08 + idx * 0.06}s"` : "";

      let diffBadge = `<span class="${popClass} text-slate-500 font-mono text-[11px] font-medium bg-white/[0.04] px-1.5 py-0.5 rounded inline-block" ${animStyle}>기준</span>`;
      if (!isHome) {
        if (diffVal > 0) {
          diffBadge = `<span class="${popClass} text-emerald-400 font-mono text-[11px] font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 inline-block" ${animStyle}>+${diffVal.toLocaleString()}${meta.suffix}</span>`;
        } else if (diffVal < 0) {
          diffBadge = `<span class="${popClass} text-rose-400 font-mono text-[11px] font-bold bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20 inline-block" ${animStyle}>${diffVal.toLocaleString()}${meta.suffix}</span>`;
        } else {
          diffBadge = `<span class="${popClass} text-slate-400 font-mono text-[11px] font-medium bg-white/[0.04] px-1.5 py-0.5 rounded inline-block" ${animStyle}>0${meta.suffix}</span>`;
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
            <div class="text-[10px] text-slate-500">${meta.label}</div>
            <div class="text-xs sm:text-sm font-black text-amber-400 font-mono mt-0.5">${currentVal.toLocaleString()}${meta.suffix}</div>
            <div class="mt-1">${diffBadge}</div>
          </div>
        </div>
      `;
    });
    container.innerHTML = html;
  }

  setFilterTab(filterType, element) {
    if (this.activeFilter === filterType && element?.classList.contains("active")) return;
    this.activeFilter = filterType;
    document.querySelectorAll(".filter-chip").forEach((btn) => btn.classList.remove("active"));
    if (element) element.classList.add("active");
    this.applyFilterAndRender(true);
  }

  // 3일+ 미접속 대상자 전용 팝업 모달 (상시 마운트 + 120fps 스프링 오픈)
  openDormantModal() {
    const modal = this.elements.dormantMembersModal || document.getElementById("dormant-members-modal");
    const listContainer = this.elements.dormantModalList || document.getElementById("dormant-modal-list");
    const countBadge = this.elements.dormantModalCount || document.getElementById("dormant-modal-count");
    if (!modal || !listContainer) return;

    const members = this.currentData?.memberList || [];
    const now = Date.now();

    const dormantMembers = members.filter((m) => {
      const effectiveDate = this.getEffectiveActiveDate(m.lastSeen, m.lastBattleTime);
      if (!effectiveDate) return true;
      return (now - effectiveDate.getTime()) / (1000 * 60 * 60 * 24) >= 3;
    });

    dormantMembers.sort((a, b) => {
      const dateA = this.getEffectiveActiveDate(a.lastSeen, a.lastBattleTime);
      const dateB = this.getEffectiveActiveDate(b.lastSeen, b.lastBattleTime);
      const timeA = dateA ? dateA.getTime() : 0;
      const timeB = dateB ? dateB.getTime() : 0;
      return timeA - timeB;
    });

    if (countBadge) {
      countBadge.textContent = `${dormantMembers.length}명`;
    }

    if (dormantMembers.length === 0) {
      listContainer.innerHTML = `
        <div class="py-12 px-4 text-center">
          <div class="text-xs font-semibold text-emerald-400">3일 이상 미접속한 클랜원이 없습니다</div>
          <p class="text-[11px] text-slate-500 mt-1">모든 클랜원이 최근 3일 이내 활동 중입니다.</p>
        </div>
      `;
    } else {
      listContainer.innerHTML = dormantMembers.map((member, idx) => {
        const status = this.getOnlineStatus(member.lastSeen, member.lastBattleTime);
        const relativeBattle = this.formatRelativeTime(member.lastBattleTime);
        const donations = member.donations || 0;

        return `
          <div class="p-3.5 hover:bg-white/[0.03] active:bg-white/[0.06] transition cursor-pointer flex items-center justify-between gap-2" onclick="window.app.switchFromDormantToMember('${this.escapeHtml(member.tag)}')">
            <div class="min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="font-mono text-xs text-slate-500 w-4 shrink-0">${idx + 1}</span>
                <span class="font-bold text-white text-xs sm:text-[13px] truncate">${this.escapeHtml(member.name)}</span>
                ${this.getRoleBadge(member.role)}
              </div>
              <div class="flex items-center gap-2 text-[11px] font-mono text-slate-500 mt-0.5 pl-5">
                <span>${this.escapeHtml(member.tag)}</span>
                <span>·</span>
                <span class="font-sans text-slate-400">지원 ${donations.toLocaleString()}개</span>
              </div>
            </div>
            <div class="text-right shrink-0">
              <div class="inline-flex items-center gap-1 text-xs ${status.textColor}">
                <span class="status-dot ${status.dotColor}"></span>
                <span>${status.text}</span>
              </div>
              <div class="text-[10px] text-slate-500 font-mono mt-0.5">배틀: ${relativeBattle}</div>
            </div>
          </div>
        `;
      }).join("");
    }

    this.openModalSmooth(modal);
  }

  closeDormantModal() {
    const modal = this.elements.dormantMembersModal || document.getElementById("dormant-members-modal");
    document.body.style.overflow = "";
    this.closeModalSmooth(modal);

    if (this.pendingClanData) {
      const { liveData, shouldAnimate } = this.pendingClanData;
      this.pendingClanData = null;
      setTimeout(() => {
        this.processIncomingClanData(liveData, shouldAnimate);
      }, 80);
    }
  }

  // 미접속 대상자 팝업에서 클랜원 클릭 시 끊김 없이 상세 팝업으로 부드럽게 교차 전환
  switchFromDormantToMember(memberTag) {
    this.closeDormantModal();
    setTimeout(() => {
      this.openMemberModal(memberTag);
    }, 140);
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
    this.applyFilterAndRender(true);
  }

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

  getEffectiveActiveDate(lastSeenStr, lastBattleStr) {
    const seenDate = this.parseDateSafe(lastSeenStr);
    const battleDate = this.parseDateSafe(lastBattleStr);

    let latest = seenDate;
    if (battleDate && (!latest || battleDate.getTime() > latest.getTime())) {
      latest = battleDate;
    }
    return latest || null;
  }

  getOnlineStatus(lastSeenStr, lastBattleStr) {
    const effectiveDate = this.getEffectiveActiveDate(lastSeenStr, lastBattleStr);
    if (!effectiveDate) {
      return { isOnline: false, text: "기록 없음", dotColor: "slate", isPulse: false, textColor: "text-slate-500" };
    }

    const diffSeconds = Math.max(0, Math.floor((Date.now() - effectiveDate.getTime()) / 1000));
    const diffMinutes = Math.floor(diffSeconds / 60);

    if (diffSeconds <= 180) {
      return {
        isOnline: true,
        text: "접속 중",
        dotColor: "green",
        isPulse: true,
        textColor: "text-emerald-400 font-bold"
      };
    }

    if (diffMinutes < 60) {
      return {
        isOnline: false,
        text: `${diffMinutes}분 전`,
        dotColor: "green",
        isPulse: false,
        textColor: "text-slate-300 font-medium"
      };
    }

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return {
        isOnline: false,
        text: `${diffHours}시간 전`,
        dotColor: "amber",
        isPulse: false,
        textColor: "text-amber-300 font-semibold"
      };
    }

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
      textColor: "text-amber-300 font-semibold"
    };
  }

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
    if (diffDays >= 7) return "7일+ 전";
    return `${diffDays}일 전`;
  }

  // 클랜원 상세 팝업 모달 (120fps 스프링 오픈)
  openMemberModal(memberTag) {
    if (!this.currentData?.memberList) return;
    const member = this.currentData.memberList.find((m) => m.tag === memberTag);
    if (!member) return;

    const modal = this.elements.memberDetailModal || document.getElementById("member-detail-modal");
    if (!modal) return;

    const nameEl = document.getElementById("modal-member-name");
    if (nameEl) nameEl.textContent = member.name || "클랜원";

    const royaleLink = document.getElementById("btn-royaleapi-link");
    if (royaleLink) {
      const cleanTag = String(member.tag || "").replace("#", "");
      royaleLink.href = `https://royaleapi.com/player/${encodeURIComponent(cleanTag)}`;
    }

    this.openModalSmooth(modal);
  }

  closeMemberModal(immediate = false) {
    const modal = this.elements.memberDetailModal || document.getElementById("member-detail-modal");
    if (!modal) return;
    document.body.style.overflow = "";
    if (immediate) {
      modal.setAttribute("aria-hidden", "true");
      modal.classList.remove("is-open");
    } else {
      this.closeModalSmooth(modal);
    }

    // 모달 닫힘 시점에 대기 중이던 최신 데이터 조용히 반영
    if (this.pendingClanData) {
      const { liveData, shouldAnimate } = this.pendingClanData;
      this.pendingClanData = null;
      setTimeout(() => {
        this.processIncomingClanData(liveData, shouldAnimate);
      }, 80);
    }
  }

  applyFilterAndRender(shouldStagger = false) {
    if (!this.currentData || !this.currentData.memberList) return;

    let list = [...this.currentData.memberList];

    if (this.searchQuery) {
      list = list.filter((m) =>
        (m.name && m.name.toLowerCase().includes(this.searchQuery)) ||
        (m.tag && m.tag.toLowerCase().includes(this.searchQuery))
      );
    }

    if (this.activeFilter === "low-donations") {
      list = list.filter((m) => (m.donations || 0) < 50);
    }

    const { key, order } = this.sorting;

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
    this.renderMobileList(shouldStagger);
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

    const tableWrapper = tbody.closest(".hidden");
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
        <tr onclick="window.app.openMemberModal('${this.escapeHtml(member.tag)}')">
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

  renderMobileList(shouldStagger = false) {
    const container = this.elements.memberMobileList;
    const emptyState = this.elements.emptyState;
    if (!container) return;

    if (window.innerWidth >= 1024 && this.elements.memberTableBody && !this.elements.memberTableBody.closest(".hidden")) {
      return;
    }

    if (this.filteredMembers.length === 0) {
      container.innerHTML = "";
      if (emptyState) emptyState.classList.remove("hidden");
      return;
    }

    if (emptyState) emptyState.classList.add("hidden");

    const now = Date.now();
    let cardsHtml = "";

    this.filteredMembers.forEach((member, idx) => {
      const status = this.getOnlineStatus(member.lastSeen, member.lastBattleTime);
      const relativeBattle = this.formatRelativeTime(member.lastBattleTime);

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

      // 뷰포트에 보이는 상위 14개 아이템에만 스태거 애니메이션을 적용해 GPU 과부하 방지
      const animateCard = shouldStagger && idx < 14;
      const staggerClass = animateCard ? "card-stagger-in" : "";
      const staggerStyle = animateCard ? `style="animation-delay: ${(idx * 0.024).toFixed(3)}s"` : "";

      cardsHtml += `
        <div class="mobile-member-card ${staggerClass}" ${staggerStyle} onclick="window.app.openMemberModal('${this.escapeHtml(member.tag)}')">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="font-mono text-xs text-slate-500 w-4 shrink-0">${member.clanRank || idx + 1}</span>
              <span class="font-bold text-white text-[13px] truncate">${this.escapeHtml(member.name)}</span>
              ${this.getRoleBadge(member.role)}
              <span class="text-[10px] font-mono text-slate-500 truncate hidden sm:inline">${this.escapeHtml(member.tag)}</span>
            </div>
            <span class="text-xs font-semibold text-amber-400 shrink-0">🏆 ${(member.trophies || 0).toLocaleString()}</span>
          </div>

          <div class="grid grid-cols-3 gap-1 pt-2.5 mt-2 border-t border-white/[0.03] items-center">
            <div class="text-left">
              <div class="text-[10px] text-slate-500 font-medium">접속 상태</div>
              <div class="text-xs ${status.textColor} mt-0.5 font-medium flex items-center gap-1 truncate">
                <span class="status-dot ${status.dotColor} ${status.isPulse ? 'live-pulse' : ''}"></span>
                <span class="truncate">${status.text}</span>
              </div>
            </div>

            <div class="text-center">
              <div class="text-[10px] text-slate-500 font-medium">최근 배틀</div>
              <div class="text-xs ${battleTextColor} mt-0.5 font-medium flex items-center justify-center gap-1 truncate">
                ${SWORDS_INLINE_SVG}
                <span class="truncate">${relativeBattle}</span>
              </div>
            </div>

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
