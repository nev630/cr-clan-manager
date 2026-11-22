/**
 * Good Fellas Clan Manager - Core Application Logic (v2.0.0 Hall of Fame Edition)
 * - 클래시 로얄 '명예의 전당' 3D 석상 시상대 (assets/podium/*.png 지원 + 고품질 SVG 폴백)
 * - 상위 3위 황금 프레임 & 4~7위 & 전체 클랜원 카드 디자인 100% 통일
 */

const CR_EMOTES_POOL = [
  { name: "웃는 킹", url: "https://static.wikia.nocookie.net/clashroyale/images/8/84/HeHeHeHa.png/revision/latest?cb=20230915211717", offsetY: 0 },
  { name: "우는 킹", url: "https://static.wikia.nocookie.net/clashroyale/images/a/af/Crying_King.png/revision/latest?cb=20230915211808", offsetY: 0 },
  { name: "비명 호그라이더", url: "https://static.wikia.nocookie.net/clashroyale/images/b/b6/Hog_Rider_Scream.png/revision/latest?cb=20230922123136", offsetY: 0 },
  { name: "이마 짚는 고블린", url: "https://static.wikia.nocookie.net/clashroyale/images/d/dc/Facepalm_Goblin.png/revision/latest?cb=20180918084628", offsetY: 2 },
  { name: "브이 프린세스", url: "https://static.wikia.nocookie.net/clashroyale/images/0/0f/Peace_Princess.png/revision/latest?cb=20230920123025", offsetY: -3 },
  { name: "따봉 일렉트로 마법사", url: "https://static.wikia.nocookie.net/clashroyale/images/3/37/Electro_Wizard_Thumbs-Up.png/revision/latest?cb=20181027033128", offsetY: -2 },
  { name: "우는 해골", url: "https://static.wikia.nocookie.net/clashroyale/images/7/73/Crying_Skeleton.png/revision/latest?cb=20180921183431", offsetY: 3 },
  { name: "고기 뜯는 자이언트", url: "https://static.wikia.nocookie.net/clashroyale/images/b/bb/Eating_Giant.png/revision/latest?cb=20230920123020", offsetY: 0 }
];

// assets/podium/ 폴더에 PNG를 업로드하면 자동으로 로드되고, 없으면 인라인 SVG 석상으로 폴백
const PODIUM_BUST_ASSETS = {
  gold: "assets/podium/king-gold.png",
  silver: "assets/podium/king-silver.png",
  bronze: "assets/podium/king-bronze.png"
};

function createKingBustSvgDataUri(tier) {
  const palettes = {
    gold: {
      crownTop: "#ffe97d", crownMain: "#fbbf24", crownDark: "#d97706",
      face: "#fcd34d", beard: "#f59e0b", beardDark: "#b45309", gem: "#fffbeb", stroke: "#78350f"
    },
    silver: {
      crownTop: "#ffffff", crownMain: "#e2e8f0", crownDark: "#94a3b8",
      face: "#f1f5f9", beard: "#cbd5e1", beardDark: "#64748b", gem: "#ffffff", stroke: "#334155"
    },
    bronze: {
      crownTop: "#fed7aa", crownMain: "#ea580c", crownDark: "#9a3412",
      face: "#fdba74", beard: "#c2410c", beardDark: "#7c2d12", gem: "#ffedd5", stroke: "#431407"
    }
  };
  const p = palettes[tier] || palettes.gold;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 130">
    <defs>
      <linearGradient id="g-${tier}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${p.crownTop}"/>
        <stop offset="55%" stop-color="${p.crownMain}"/>
        <stop offset="100%" stop-color="${p.crownDark}"/>
      </linearGradient>
    </defs>
    <!-- 어깨 흉상 -->
    <path d="M16 126 C18 98, 42 88, 70 88 C98 88, 122 98, 124 126 Z" fill="url(#g-${tier})" stroke="${p.stroke}" stroke-width="2.5"/>
    <path d="M28 106 L112 106 L118 122 L22 122 Z" fill="${p.crownDark}" opacity="0.5"/>
    <!-- 턱수염 -->
    <path d="M34 62 L106 62 L102 96 C88 108, 52 108, 38 96 Z" fill="${p.beard}" stroke="${p.stroke}" stroke-width="2.5"/>
    <!-- 얼굴 -->
    <rect x="42" y="42" width="56" height="34" rx="8" fill="${p.face}" stroke="${p.stroke}" stroke-width="2.2"/>
    <!-- 짙은 눈썹 -->
    <rect x="41" y="45" width="24" height="8" rx="2" fill="${p.crownTop}" stroke="${p.stroke}" stroke-width="2"/>
    <rect x="75" y="45" width="24" height="8" rx="2" fill="${p.crownTop}" stroke="${p.stroke}" stroke-width="2"/>
    <!-- 코 & 콧수염 -->
    <ellipse cx="70" cy="59" rx="8" ry="6" fill="${p.crownTop}" stroke="${p.stroke}" stroke-width="2"/>
    <path d="M32 72 C44 62, 64 63, 70 68 C76 63, 96 62, 108 72 C98 78, 80 76, 70 71 C60 76, 42 78, 32 72 Z" fill="${p.crownTop}" stroke="${p.stroke}" stroke-width="2.2"/>
    <!-- 왕관 -->
    <path d="M38 44 L36 16 L52 26 L70 10 L88 26 L104 16 L102 44 Z" fill="url(#g-${tier})" stroke="${p.stroke}" stroke-width="2.5" stroke-linejoin="round"/>
    <polygon points="70,22 77,30 70,38 63,30" fill="${p.gem}" stroke="${p.stroke}" stroke-width="1.8"/>
  </svg>`;
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
}

const FALLBACK_BUST_URIS = {
  gold: createKingBustSvgDataUri("gold"),
  silver: createKingBustSvgDataUri("silver"),
  bronze: createKingBustSvgDataUri("bronze")
};

// 직책별 방패 엠블럼 SVG (명예의 전당 카드 좌측 방패 배지)
function getRoleShieldSvg(role) {
  let fillTop = "#64748b";
  let fillBot = "#475569";
  let icon = `<circle cx="14" cy="14" r="3.5" fill="#e2e8f0"/>`;

  if (role === "leader") {
    fillTop = "#f59e0b";
    fillBot = "#b45309";
    icon = `<path d="M8 18 L9.5 11 L14 14.5 L18.5 11 L20 18 Z" fill="#fef08a"/>`;
  } else if (role === "coLeader") {
    fillTop = "#a855f7";
    fillBot = "#6b21a8";
    icon = `<path d="M15 8 L10 15.5 H14 L13 21 L18 13.5 H14 Z" fill="#ffffff"/>`;
  } else if (role === "elder") {
    fillTop = "#3b82f6";
    fillBot = "#1d4ed8";
    icon = `<path d="M14 8 L17.5 14 L14 20 L10.5 14 Z" fill="#ffffff"/>`;
  }

  return `<svg class="w-full h-full" viewBox="0 0 28 32" fill="none">
    <path d="M3 4.5 C3 3.7 3.7 3 4.5 3 H23.5 C24.3 3 25 3.7 25 4.5 V15.5 C25 22.2 14 28.5 14 28.5 C14 28.5 3 22.2 3 15.5 V4.5 Z" fill="${fillBot}" stroke="#1e293b" stroke-width="2"/>
    <path d="M5 5 H23 V15 C23 20.5 14 26 14 26 C14 26 5 20.5 5 15 V5 Z" fill="${fillTop}"/>
    ${icon}
  </svg>`;
}

// 카드 우측 보라 리본 + 금메달 SVG
const MEDAL_RIBBON_SVG = `
  <span class="hof-medal-icon">
    <svg class="w-3 h-3 text-[#78350f]" viewBox="0 0 24 24" fill="currentColor">
      <path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/>
    </svg>
  </span>
`;

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
    this.activeFilter = "all";
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

    this.pendingClanData = null;
    this.pendingFlushTimer = null;

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
        const memberModal = this.elements.memberDetailModal || document.getElementById("member-detail-modal");
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
      }
    }, 60000);
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
      podiumTop3Cards: document.getElementById("podium-top3-cards"),
      podiumRunnersContainer: document.getElementById("podium-runners-container"),
      chartActivity: document.getElementById("chart-activity"),
      compareBarsStage: document.getElementById("compare-bars-stage"),
      compareChartContainer: document.getElementById("compare-chart-container"),
      compareChartTitle: document.getElementById("compare-chart-title"),
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

  isAnyModalOpen() {
    const modals = [
      this.elements.memberDetailModal || document.getElementById("member-detail-modal"),
      this.elements.dormantMembersModal || document.getElementById("dormant-members-modal"),
      this.elements.syncErrorModal || document.getElementById("sync-error-modal")
    ];
    return modals.some((m) => m && m.classList.contains("is-open"));
  }

  openModalSmooth(modalEl) {
    if (!modalEl) return;
    if (this.pendingFlushTimer) {
      clearTimeout(this.pendingFlushTimer);
      this.pendingFlushTimer = null;
    }
    modalEl.setAttribute("aria-hidden", "false");
    modalEl.classList.add("is-open");
  }

  closeModalSmooth(modalEl) {
    if (!modalEl) return;
    modalEl.setAttribute("aria-hidden", "true");
    modalEl.classList.remove("is-open");

    if (!this.isAnyModalOpen()) {
      document.body.style.overflow = "";
      if (this.pendingClanData) {
        if (this.pendingFlushTimer) clearTimeout(this.pendingFlushTimer);
        this.pendingFlushTimer = setTimeout(() => {
          this.pendingFlushTimer = null;
          if (!this.isAnyModalOpen() && this.pendingClanData) {
            const { liveData, shouldAnimate } = this.pendingClanData;
            this.pendingClanData = null;
            this.processIncomingClanData(liveData, shouldAnimate);
          }
        }, 160);
      }
    }
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

    await Promise.race([Promise.all(preloadPromises), new Promise((r) => setTimeout(r, 1500))]);

    const loopItems = [...CR_EMOTES_POOL, ...CR_EMOTES_POOL];
    const itemsHtml = loopItems.map((item) => `
      <div class="slot-item w-16 h-16 sm:w-20 sm:h-20 shrink-0 flex items-center justify-center">
        <div class="w-full h-full flex items-center justify-center" style="transform: translateY(${item.offsetY || 0}px);">
          <img src="${item.url}" alt="${item.name}" class="w-16 h-16 sm:w-20 sm:h-20 object-contain pointer-events-none select-none" />
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
  }

  stopSlotReel(slotIdx, targetEmote) {
    const reelEl = document.getElementById(`slot-reel-${slotIdx}`);
    const windowEl = document.getElementById(`slot-window-${slotIdx}`);
    if (!reelEl || !windowEl) return;

    const pool = CR_EMOTES_POOL.filter((e) => e.name !== targetEmote.name);
    const dummies = [];
    for (let i = 0; i < 4; i++) {
      dummies.push(pool[Math.floor(Math.random() * pool.length)]);
    }
    const decelItems = [...dummies, targetEmote];

    reelEl.className = "slot-reel-strip absolute top-0 left-0 w-full flex flex-col items-center slot-stopping";
    reelEl.innerHTML = decelItems.map((item) => `
      <div class="slot-item w-16 h-16 sm:w-20 sm:h-20 shrink-0 flex items-center justify-center">
        <div class="w-full h-full flex items-center justify-center" style="transform: translateY(${item.offsetY || 0}px);">
          <img src="${item.url}" alt="${item.name}" class="w-16 h-16 sm:w-20 sm:h-20 object-contain pointer-events-none select-none" />
        </div>
      </div>
    `).join("");

    setTimeout(() => windowEl.classList.add("slot-locked"), 420);
  }

  async triggerSlotStopSequence() {
    if (this.slotStopTriggered) return;
    this.slotStopTriggered = true;

    const elapsed = Date.now() - (this.loadingStartTime || Date.now());
    if (elapsed < 550) {
      await new Promise((r) => setTimeout(r, 550 - elapsed));
    }

    const targets = this.targetEmotes || CR_EMOTES_POOL.slice(0, 3);
    this.stopSlotReel(0, targets[0]);
    await new Promise((r) => setTimeout(r, 180));
    this.stopSlotReel(1, targets[1]);
    await new Promise((r) => setTimeout(r, 180));
    this.stopSlotReel(2, targets[2]);

    await new Promise((r) => setTimeout(r, 680));
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
      }, 900);
    }

    setTimeout(() => {
      modal.classList.add("hidden");
      const emotesContainer = document.getElementById("loading-emotes-container");
      if (emotesContainer) emotesContainer.innerHTML = "";
    }, 290);
  }

  bindEvents() {
    const {
      searchInput,
      btnSearchClear,
      sortKeySelect,
      btnSortOrder,
      memberMobileList,
      podiumContainer,
      podiumTop3Cards,
      podiumRunnersContainer,
      dormantModalList
    } = this.elements;

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

    const delegateMemberOpen = (container) => {
      if (!container) return;
      container.addEventListener("click", (e) => {
        const targetEl = e.target.closest("[data-member-tag]");
        if (!targetEl) return;
        const tag = targetEl.getAttribute("data-member-tag");
        if (tag) this.openMemberModal(tag);
      });
    };

    delegateMemberOpen(memberMobileList);
    delegateMemberOpen(podiumContainer);
    delegateMemberOpen(podiumTop3Cards);
    delegateMemberOpen(podiumRunnersContainer);

    if (dormantModalList) {
      dormantModalList.addEventListener("click", (e) => {
        const targetEl = e.target.closest("[data-dormant-tag]");
        if (!targetEl) return;
        const tag = targetEl.getAttribute("data-dormant-tag");
        if (tag) this.switchFromDormantToMember(tag);
      });
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
      this.applyTheme(nextTheme, false);
    }
  }

  applyTheme(theme, shouldStagger = false) {
    const isDark = theme === "dark";
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.classList.toggle("light", !isDark);

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
    if (textEl) textEl.textContent = isDesc ? "내림차순" : "오름차순";
    const target = iconWrapper || iconEl;
    if (target) {
      target.style.transition = "transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)";
      target.style.transform = isDesc ? "rotate(0deg)" : "rotate(180deg)";
    }
  }

  switchMainTab(tabName) {
    if (this.activeMainTab === tabName) return;
    this.activeMainTab = tabName;
    this.lastTabSwitchTime = Date.now();

    const { viewDashboard, viewCompare, tabBtnDashboard, tabBtnCompare, mainTabPill } = this.elements;
    if (mainTabPill) mainTabPill.classList.toggle("slide-right", tabName === "compare");
    if (tabBtnDashboard) tabBtnDashboard.classList.toggle("active", tabName !== "compare");
    if (tabBtnCompare) tabBtnCompare.classList.toggle("active", tabName === "compare");

    if (tabName === "compare") {
      viewDashboard?.classList.add("hidden");
      viewCompare?.classList.remove("hidden");
      viewCompare?.classList.add("tab-view-enter");
      requestAnimationFrame(() => setTimeout(() => this.renderComparisonView(true), 60));
      if (!this.hasCompareLoaded || Date.now() - this.lastCompareSyncTime > this.compareThrottleMs) {
        this.syncCompareLive(false);
      }
    } else {
      viewCompare?.classList.add("hidden");
      viewDashboard?.classList.remove("hidden");
      viewDashboard?.classList.add("tab-view-enter");
      requestAnimationFrame(() => {
        if (this.currentData?.memberList) {
          this.renderPodium(this.currentData.memberList, true);
          this.renderActivityDonut(this.currentData.memberList, true);
        }
      });
    }
  }

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
    if (this.elements.compareListTitle) this.elements.compareListTitle.textContent = meta.listTitle;
    requestAnimationFrame(() => this.renderComparisonView(true));
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
    if (!window.crApi || typeof window.crApi.fetchPlayerBattleLog !== "function") return;

    let hasNewData = false;
    const chunkSize = 10;

    for (let i = 0; i < members.length; i += chunkSize) {
      const chunk = members.slice(i, i + chunkSize);
      const chunkPromises = chunk.map(async (m) => {
        const battlelog = await window.crApi.fetchPlayerBattleLog(m.tag, 1);
        if (Array.isArray(battlelog) && battlelog.length > 0) {
          const newTime = battlelog[0].battleTime;
          const newType = battlelog[0].type || "Battle";
          const curDate = this.parseDateSafe(m.lastBattleTime);
          const newDate = this.parseDateSafe(newTime);
          if (newDate && (!curDate || newDate.getTime() !== curDate.getTime())) {
            m.lastBattleTime = newTime;
            m.lastBattleType = newType;
            m._fromCache = false;
            m._noBattles = false;
            this.battleLogCache.set(m.tag, { time: newTime, type: newType });
            hasNewData = true;
          }
        } else if (Array.isArray(battlelog) && battlelog.length === 0) {
          this.battleLogCache.set(m.tag, { time: "none", type: "None" });
          m._noBattles = true;
          hasNewData = true;
        }
      });

      await Promise.allSettled(chunkPromises);
      if (i + chunkSize < members.length) {
        await new Promise((r) => setTimeout(r, 40));
      }
    }

    if (hasNewData && this.currentData) {
      this.saveBattleLogCache();
      if (!this.isAnyModalOpen()) {
        this.applyFilterAndRender(false);
        this.updateStats(this.currentData);
        this.renderActivityDonut(this.currentData.memberList || [], false);
      }
    }
  }

  processIncomingClanData(liveData, shouldAnimate = false) {
    if (!liveData || !liveData.memberList) return;
    if (this.isAnyModalOpen()) {
      this.pendingClanData = { liveData, shouldAnimate };
      return;
    }

    const missingBattleMembers = liveData.memberList.filter((m) => (!m.lastBattleTime || m._fromCache) && !m._noBattles);

    let hasCacheUpdated = false;
    liveData.memberList.forEach((m) => {
      if (m.lastBattleTime) {
        const existing = this.battleLogCache.get(m.tag);
        if (!existing || existing.time !== m.lastBattleTime) {
          this.battleLogCache.set(m.tag, { time: m.lastBattleTime, type: m.lastBattleType || "Battle" });
          hasCacheUpdated = true;
        }
      }
    });
    if (hasCacheUpdated) this.saveBattleLogCache();

    this.bindCachedBattleLogs(liveData.memberList);
    this.renderClan(liveData, shouldAnimate, shouldAnimate);

    if (shouldAnimate) {
      setTimeout(() => {
        this.elements.podiumContainer?.classList.remove("podium-animate");
      }, 850);
    }

    if (missingBattleMembers.length > 0) {
      this.fetchAllMembersBattleLogs(missingBattleMembers);
    }
  }

  async autoSyncLive(isManual = false) {
    const now = Date.now();
    if (!isManual && (now - this.lastSyncTime < this.syncThrottleMs)) return;
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

      if (isInitial && this.emotesReadyPromise) await this.emotesReadyPromise;

      const timeoutFallback = new Promise((resolve) => setTimeout(() => resolve("TIMEOUT"), 2500));
      const raceResult = isInitial ? await Promise.race([dataFetchPromise, timeoutFallback]) : await dataFetchPromise;

      if (raceResult === "TIMEOUT") {
        resolvedAfterTimeout = true;
        if (!this.currentData) {
          const presets = window.crApi?.getGalleryClansPreset() || [];
          const homeClan = presets.find((p) => p.isHome) || presets[0];
          if (homeClan) this.renderClan({ ...homeClan, memberList: [] }, false, false);
        }
      } else if (raceResult && raceResult.memberList) {
        this.processIncomingClanData(raceResult, isManual && !isInitial);
      }

      if (isInitial) await this.triggerSlotStopSequence();
    } catch (err) {
      if (!this.currentData) {
        const presets = window.crApi?.getGalleryClansPreset() || [];
        const homeClan = presets.find((p) => p.isHome) || presets[0];
        if (homeClan) this.renderClan({ ...homeClan, memberList: [] }, false, false);
        this.renderEmptyState(err.message);
        this.showErrorModal(err);
      } else if (isManual) {
        this.showToast(`데이터 갱신 실패: ${err.message}`, "error");
      }
    } finally {
      if (isInitial) await this.triggerSlotStopSequence();
    }
  }

  async syncCompareLive(force = false) {
    const now = Date.now();
    if (!force && (now - this.lastCompareSyncTime < this.compareThrottleMs)) return;
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

    titleEl.textContent = "데이터 동기화 실패";
    msgEl.textContent = `서버와 통신할 수 없습니다: ${err?.message || "네트워크 상태를 확인해주세요."}`;
    if (btnRetry) btnRetry.onclick = () => { this.closeErrorModal(); this.autoSyncLive(true); };
    if (btnClose) btnClose.onclick = () => this.closeErrorModal();
    this.openModalSmooth(modal);
  }

  closeErrorModal() {
    this.closeModalSmooth(this.elements.syncErrorModal || document.getElementById("sync-error-modal"));
  }

  renderEmptyState(reason) {
    const { memberMobileList: mobileList, emptyState, podiumContainer: podium } = this.elements;
    if (podium) {
      podium.innerHTML = `<div class="text-center py-10 text-xs text-white font-bold cr-outline-text">데이터를 불러오지 못했습니다.</div>`;
    }
    if (mobileList) {
      mobileList.innerHTML = `
        <div class="py-10 px-4 text-center">
          <p class="cr-outline-text text-xs font-bold text-white">클랜 데이터를 불러올 수 없습니다</p>
          <p class="text-[11px] text-purple-200/80 mt-1">${this.escapeHtml(reason || "API 서버 응답 실패")}</p>
          <button onclick="window.app.autoSyncLive(true)" class="mt-3 px-3.5 py-1.5 rounded-xl bg-gradient-to-b from-[#a855f7] to-[#7e22ce] text-white border border-purple-300/40 text-xs font-bold">
            <span class="cr-outline-text">다시 시도</span>
          </button>
        </div>
      `;
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
      const progress = Math.min(1, (now - startTime) / duration);
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const current = Math.round(startVal + (targetVal - startVal) * ease);
      element.textContent = `${prefix}${current.toLocaleString()}${suffix}`;
      if (progress < 1) requestAnimationFrame(step);
      else element.textContent = `${prefix}${targetVal.toLocaleString()}${suffix}`;
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
      if ((m.donations || 0) < 50) lowDonationCount++;
      const effectiveDate = this.getEffectiveActiveDate(m.lastSeen, m.lastBattleTime);
      if (!effectiveDate || (now - effectiveDate.getTime()) / 86400000 >= 3) dormantCount++;
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

  /**
   * 명예의 전당(Hall of Fame) 공통 랭킹 카드 HTML 빌더
   * - 시상대 Top 7 카드와 하단 전체 멤버 목록 카드가 100% 동일한 디자인을 공유
   */
  buildHallOfFameCardHtml(member, options = {}) {
    const {
      rankNum = 1,
      rankTier = "default", // '1' | '2' | '3' | 'default'
      subTextHtml = "",
      scoreText = "0",
      staggerClass = "",
      staggerStyle = ""
    } = options;

    const rankClass = rankTier === "1" ? "rank-1" : rankTier === "2" ? "rank-2" : rankTier === "3" ? "rank-3" : "rank-default";

    return `
      <div class="hof-rank-card ${staggerClass}" ${staggerStyle} data-member-tag="${this.escapeHtml(member.tag)}">
        <div class="flex items-center gap-2 min-w-0 flex-1">
          <!-- 좌측 순위 사각 뱃지 -->
          <div class="hof-rank-num-box ${rankClass}">
            <span class="cr-outline-text">${rankNum}</span>
          </div>

          <!-- 직책 방패 엠블럼 -->
          <div class="hof-shield-emblem">
            ${getRoleShieldSvg(member.role)}
          </div>

          <!-- 닉네임(흰색+검정 외곽선) + 직책 뱃지 + 하단 보조 텍스트 -->
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="cr-outline-text text-[13px] font-black text-white truncate" title="${this.escapeHtml(member.name)}">
                ${this.escapeHtml(member.name)}
              </span>
              ${this.getRoleBadge(member.role)}
            </div>
            <div class="hof-card-subtext truncate mt-0.5 flex items-center gap-1.5">
              ${subTextHtml}
            </div>
          </div>
        </div>

        <!-- 우측 금메달 + 지원량 알약 배지 -->
        <div class="hof-score-pill">
          ${MEDAL_RIBBON_SVG}
          <span class="cr-outline-text text-xs font-black text-white tabular-nums">${scoreText}</span>
        </div>
      </div>
    `;
  }

  renderPodium(members, triggerAnimation = false) {
    const { podiumContainer, podiumTop3Cards, podiumRunnersContainer } = this.elements;
    if (!podiumContainer) return;

    const sorted = [...members].sort((a, b) => (b.donations || 0) - (a.donations || 0)).slice(0, 7);
    if (sorted.length < 3) {
      podiumContainer.innerHTML = `<div class="text-center py-8 text-xs text-white font-bold cr-outline-text">표시할 클랜원이 부족합니다.</div>`;
      if (podiumTop3Cards) podiumTop3Cards.innerHTML = "";
      if (podiumRunnersContainer) podiumRunnersContainer.innerHTML = "";
      return;
    }

    const first = sorted[0];
    const second = sorted[1];
    const third = sorted[2];
    const runners = sorted.slice(3);

    podiumContainer.className = triggerAnimation ? "hof-podium-stage podium-animate" : "hof-podium-stage";

    const buildBustColumn = (member, rankNum, tier, crestHtml) => `
      <div class="hof-podium-col rank-${rankNum}" data-member-tag="${this.escapeHtml(member.tag)}">
        <div class="hof-bust-wrap">
          <img
            src="${PODIUM_BUST_ASSETS[tier]}"
            onerror="this.onerror=null; this.src='${FALLBACK_BUST_URIS[tier]}';"
            alt="${rankNum}위 석상"
            class="hof-bust-img"
          />
        </div>
        <div class="hof-pedestal">
          <div class="hof-plaque">
            <div class="hof-crest-gem ${tier}">${crestHtml}</div>
            <div class="hof-plaque-name" title="${this.escapeHtml(member.name)}">${this.escapeHtml(member.name)}</div>
            <div class="hof-plaque-score">${(member.donations || 0).toLocaleString()}개</div>
          </div>
          <div class="hof-battlement ${tier}"></div>
          <div class="hof-pillar">
            <div class="hof-tapestry"></div>
          </div>
        </div>
      </div>
    `;

    const crownMiniSvg = `<svg class="w-3 h-3 text-[#78350f]" viewBox="0 0 24 24" fill="currentColor"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/></svg>`;

    podiumContainer.innerHTML =
      buildBustColumn(second, 2, "silver", "") +
      buildBustColumn(first, 1, "gold", crownMiniSvg) +
      buildBustColumn(third, 3, "bronze", "");

    // 상위 3위 황금 프레임 내부 카드 (멤버 목록과 100% 동일 디자인)
    if (podiumTop3Cards) {
      podiumTop3Cards.innerHTML = [first, second, third].map((m, idx) => {
        const rankNum = idx + 1;
        const status = this.getOnlineStatus(m.lastSeen, m.lastBattleTime);
        const subText = `
          <span>${this.escapeHtml(m.tag)}</span>
          <span>·</span>
          <span>${status.text}</span>
        `;
        return this.buildHallOfFameCardHtml(m, {
          rankNum,
          rankTier: String(rankNum),
          subTextHtml: subText,
          scoreText: (m.donations || 0).toLocaleString()
        });
      }).join("");
    }

    // 4~7위 카드 리스트 (상위 3위 및 멤버 목록과 100% 동일 디자인)
    if (podiumRunnersContainer) {
      podiumRunnersContainer.innerHTML = runners.map((m, idx) => {
        const rankNum = idx + 4;
        const status = this.getOnlineStatus(m.lastSeen, m.lastBattleTime);
        const subText = `
          <span>${this.escapeHtml(m.tag)}</span>
          <span>·</span>
          <span>${status.text}</span>
        `;
        return this.buildHallOfFameCardHtml(m, {
          rankNum,
          rankTier: "default",
          subTextHtml: subText,
          scoreText: (m.donations || 0).toLocaleString()
        });
      }).join("");
    }
  }

  renderActivityDonut(members, triggerAnimation = false) {
    if (!window.Chart) return;
    let seenToday = 0, seen1to2d = 0, seenDormant = 0;
    const now = Date.now();

    members.forEach((m) => {
      const activeDate = this.getEffectiveActiveDate(m.lastSeen, m.lastBattleTime);
      if (!activeDate) { seenDormant++; return; }
      const daysAgo = (now - activeDate.getTime()) / 86400000;
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
            borderColor: isLight ? "#ffffff" : "#0f121a",
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: "bottom",
              labels: { color: isLight ? "#0f172a" : "#94a3b8", boxWidth: 8, padding: 10, font: { size: 10, weight: "bold" } }
            },
            tooltip: { callbacks: { label: (c) => ` ${c.label}: ${c.raw}명` } }
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
      return { ...c, isHome, membersCount, donationsWeekly, donationsAvg };
    });

    const sortedClans = [...enriched].sort((a, b) => (b[metricKey] || 0) - (a[metricKey] || 0));
    this.renderCompareCharts(sortedClans, metricKey, triggerAnimation);
    this.renderCompareSummaryList(sortedClans, metricKey, triggerAnimation);
  }

  renderCompareCharts(clans, metricKey = "donationsWeekly", triggerAnimation = false) {
    const stage = this.elements?.compareBarsStage;
    if (!stage) return;

    const meta = COMPARE_METRICS_META[metricKey] || COMPARE_METRICS_META.donationsWeekly;
    const isDonation = metricKey === "donationsWeekly";
    const values = clans.map((c) => c[metricKey] || 0);
    const maxVal = Math.max(...values, 1);

    let tickMax = Math.ceil(maxVal * 1.15);
    tickMax = isDonation ? Math.max(5000, Math.ceil(tickMax / 5000) * 5000) : Math.max(50, Math.ceil(tickMax / 50) * 50);

    const tickSteps = [
      { val: tickMax, percent: 100 },
      { val: Math.round(tickMax * 0.75), percent: 75 },
      { val: Math.round(tickMax * 0.5), percent: 50 },
      { val: Math.round(tickMax * 0.25), percent: 25 },
      { val: 0, percent: 0 }
    ];

    let html = `
      <div class="absolute left-11 sm:left-12 right-2.5 sm:right-3.5 top-6 sm:top-7 bottom-7 sm:bottom-7">
        <div class="absolute inset-0 pointer-events-none z-0">
          ${tickSteps.map((t) => `
            <div class="absolute left-0 right-0 border-b ${t.percent === 0 ? 'border-white/[0.14] compare-baseline' : 'border-white/[0.05]'} compare-grid-line" style="bottom: ${t.percent}%;">
              <span class="absolute right-full mr-2 text-[10px] font-mono text-slate-400 compare-tick-text" style="top: 0; transform: translateY(-50%);">${t.val.toLocaleString()}</span>
            </div>
          `).join("")}
        </div>
        <div id="compare-bars-wrapper" class="absolute inset-0 flex items-end justify-between px-1.5 sm:px-5 pointer-events-none z-10 ${triggerAnimation ? 'compare-animate' : ''}">
    `;

    clans.forEach((c, idx) => {
      const val = c[metricKey] || 0;
      const barHeightPercent = Math.max(3.5, Math.min(100, (val / tickMax) * 100));
      let barClasses = "bg-gradient-to-t from-[#d41f45] to-[#eb3a60] border-t border-x border-white/20";
      if (c.isHome) barClasses = "bg-gradient-to-t from-[#3d4ac6] to-[#4f5ddb] border-t border-x border-white/20";
      else if ((c.name || "").includes("Vandros")) barClasses = "bg-gradient-to-t from-[#059669] to-[#10b981] border-t border-x border-white/20";

      html += `
        <div class="flex-1 max-w-[95px] h-full flex flex-col justify-end items-center relative pointer-events-auto">
          <div class="w-[74%] max-w-[76px] relative flex justify-center" style="height: ${barHeightPercent.toFixed(2)}%;">
            <div class="compare-bar-header compare-bar-header-${idx} absolute bottom-full mb-1 left-1/2 -translate-x-1/2 whitespace-nowrap">
              <span class="text-xs font-bold text-white compare-header-num">${val.toLocaleString()}${meta.suffix}</span>
            </div>
            <div class="compare-bar compare-bar-${idx} w-full h-full rounded-t-xl ${barClasses}"></div>
          </div>
          <div class="compare-clan-name absolute top-full pt-1.5 w-full text-center text-xs font-bold text-white truncate">${this.escapeHtml(c.name)}</div>
        </div>
      `;
    });

    html += `</div></div>`;
    stage.innerHTML = html;
  }

  renderCompareSummaryList(clans, metricKey = "donationsWeekly", triggerAnimation = false) {
    const container = this.elements.compareSummaryList;
    if (!container) return;

    const meta = COMPARE_METRICS_META[metricKey] || COMPARE_METRICS_META.donationsWeekly;
    const homeClan = clans.find((c) => c.isHome) || clans[0];
    const homeValue = homeClan?.[metricKey] || 0;

    container.innerHTML = clans.map((c, idx) => {
      const isHome = c.isHome;
      const currentVal = c[metricKey] || 0;
      const diffVal = currentVal - homeValue;
      const popClass = triggerAnimation ? "badge-pop" : "";

      let diffBadge = `<span class="${popClass} text-slate-500 font-mono text-[11px] bg-white/[0.04] px-1.5 py-0.5 rounded">기준</span>`;
      if (!isHome) {
        if (diffVal > 0) diffBadge = `<span class="${popClass} text-emerald-400 font-mono text-[11px] font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">+${diffVal.toLocaleString()}${meta.suffix}</span>`;
        else if (diffVal < 0) diffBadge = `<span class="${popClass} text-rose-400 font-mono text-[11px] font-bold bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">${diffVal.toLocaleString()}${meta.suffix}</span>`;
        else diffBadge = `<span class="${popClass} text-slate-400 font-mono text-[11px] bg-white/[0.04] px-1.5 py-0.5 rounded">0${meta.suffix}</span>`;
      }

      const rankEmoji = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}`;
      return `
        <div class="p-3.5 flex items-center justify-between gap-3 ${isHome ? 'bg-indigo-950/20' : ''}">
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="text-sm font-bold w-6 text-center shrink-0">${rankEmoji}</span>
            <div class="min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="font-bold text-white text-sm truncate">${this.escapeHtml(c.name)}</span>
                ${isHome ? '<span class="px-1.5 py-0.2 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">내 클랜</span>' : ''}
              </div>
              <div class="text-[11px] font-mono text-slate-500 mt-0.5">${this.escapeHtml(c.tag)} · ${c.membersCount}/50명</div>
            </div>
          </div>
          <div class="text-right shrink-0">
            <div class="text-[10px] text-slate-500">${meta.label}</div>
            <div class="text-xs font-black text-amber-400 font-mono mt-0.5">${currentVal.toLocaleString()}${meta.suffix}</div>
            <div class="mt-1">${diffBadge}</div>
          </div>
        </div>
      `;
    }).join("");
  }

  setFilterTab(filterType, element) {
    if (this.activeFilter === filterType && element?.classList.contains("active")) return;
    this.activeFilter = filterType;
    document.querySelectorAll(".filter-chip").forEach((btn) => btn.classList.remove("active"));
    if (element) element.classList.add("active");
    this.applyFilterAndRender(true);
  }

  openDormantModal() {
    const modal = this.elements.dormantMembersModal;
    const listContainer = this.elements.dormantModalList;
    const countBadge = this.elements.dormantModalCount;
    if (!modal || !listContainer) return;

    const members = this.currentData?.memberList || [];
    const now = Date.now();
    const dormantMembers = members.filter((m) => {
      const effectiveDate = this.getEffectiveActiveDate(m.lastSeen, m.lastBattleTime);
      return !effectiveDate || (now - effectiveDate.getTime()) / 86400000 >= 3;
    });

    dormantMembers.sort((a, b) => {
      const dA = this.getEffectiveActiveDate(a.lastSeen, a.lastBattleTime);
      const dB = this.getEffectiveActiveDate(b.lastSeen, b.lastBattleTime);
      return (dA ? dA.getTime() : 0) - (dB ? dB.getTime() : 0);
    });

    if (countBadge) countBadge.textContent = `${dormantMembers.length}명`;

    if (dormantMembers.length === 0) {
      listContainer.innerHTML = `<div class="py-12 px-4 text-center text-xs font-semibold text-emerald-400">3일 이상 미접속한 클랜원이 없습니다</div>`;
    } else {
      listContainer.innerHTML = dormantMembers.map((member, idx) => {
        const status = this.getOnlineStatus(member.lastSeen, member.lastBattleTime);
        const relativeBattle = this.formatRelativeTime(member.lastBattleTime);
        return `
          <div class="p-3.5 hover:bg-white/[0.03] cursor-pointer flex items-center justify-between gap-2" data-dormant-tag="${this.escapeHtml(member.tag)}">
            <div class="min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="font-mono text-xs text-slate-500 w-4 shrink-0">${idx + 1}</span>
                <span class="font-bold text-white text-xs truncate">${this.escapeHtml(member.name)}</span>
                ${this.getRoleBadge(member.role)}
              </div>
              <div class="text-[11px] font-mono text-slate-500 mt-0.5 pl-5">${this.escapeHtml(member.tag)} · 지원 ${(member.donations || 0).toLocaleString()}개</div>
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
    this.closeModalSmooth(this.elements.dormantMembersModal);
  }

  switchFromDormantToMember(memberTag) {
    this.closeDormantModal();
    setTimeout(() => this.openMemberModal(memberTag), 140);
  }

  parseDateSafe(dateStr) {
    if (!dateStr) return null;
    if (window.crApi && typeof window.crApi.parseApiDate === "function") {
      return window.crApi.parseApiDate(dateStr);
    }
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  }

  getEffectiveActiveDate(lastSeenStr, lastBattleStr) {
    const seenDate = this.parseDateSafe(lastSeenStr);
    const battleDate = this.parseDateSafe(lastBattleStr);
    let latest = seenDate;
    if (battleDate && (!latest || battleDate.getTime() > latest.getTime())) latest = battleDate;
    return latest || null;
  }

  getOnlineStatus(lastSeenStr, lastBattleStr) {
    const effectiveDate = this.getEffectiveActiveDate(lastSeenStr, lastBattleStr);
    if (!effectiveDate) return { isOnline: false, text: "기록 없음", dotColor: "slate", isPulse: false, textColor: "text-slate-500" };

    const diffSeconds = Math.max(0, Math.floor((Date.now() - effectiveDate.getTime()) / 1000));
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffSeconds <= 180) return { isOnline: true, text: "접속 중", dotColor: "green", isPulse: true, textColor: "text-emerald-400 font-bold" };
    if (diffMinutes < 60) return { isOnline: false, text: `${diffMinutes}분 전`, dotColor: "green", isPulse: false, textColor: "text-slate-300 font-medium" };

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return { isOnline: false, text: `${diffHours}시간 전`, dotColor: "amber", isPulse: false, textColor: "text-amber-300 font-semibold" };

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays >= 3) return { isOnline: false, text: `${diffDays}일 전`, dotColor: "rose", isPulse: false, textColor: "text-rose-400 font-bold" };
    return { isOnline: false, text: `${diffDays}일 전`, dotColor: "amber", isPulse: false, textColor: "text-amber-300 font-semibold" };
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

  openMemberModal(memberTag) {
    if (!this.currentData?.memberList) return;
    const member = this.currentData.memberList.find((m) => m.tag === memberTag);
    if (!member) return;

    const modal = this.elements.memberDetailModal;
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

  closeMemberModal() {
    this.closeModalSmooth(this.elements.memberDetailModal);
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
        const d = key === "lastSeen"
          ? this.getEffectiveActiveDate(m.lastSeen, m.lastBattleTime)
          : this.parseDateSafe(m.lastBattleTime);
        m._sortTime = d ? d.getTime() : 0;
      });
      list.sort((a, b) => (order === "desc" ? b._sortTime - a._sortTime : a._sortTime - b._sortTime));
    } else {
      list.sort((a, b) => (order === "desc" ? (b[key] || 0) - (a[key] || 0) : (a[key] || 0) - (b[key] || 0)));
    }

    this.filteredMembers = list;
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

  /**
   * 하단 전체 클랜원 목록 렌더링
   * - 시상대 Top 7 카드(buildHallOfFameCardHtml)와 100% 동일한 명예의 전당 카드 디자인 적용
   */
  renderMobileList(shouldStagger = false) {
    const container = this.elements.memberMobileList;
    const emptyState = this.elements.emptyState;
    if (!container) return;

    if (this.filteredMembers.length === 0) {
      container.innerHTML = "";
      if (emptyState) emptyState.classList.remove("hidden");
      return;
    }
    if (emptyState) emptyState.classList.add("hidden");

    const cardsHtml = this.filteredMembers.map((member, idx) => {
      const status = this.getOnlineStatus(member.lastSeen, member.lastBattleTime);
      const relativeBattle = this.formatRelativeTime(member.lastBattleTime);
      const rankNum = member.clanRank || idx + 1;
      const rankTier = rankNum <= 3 ? String(rankNum) : "default";

      const animateCard = shouldStagger && idx < 14;
      const staggerClass = animateCard ? "card-stagger-in" : "";
      const staggerStyle = animateCard ? `style="animation-delay: ${(idx * 0.024).toFixed(3)}s"` : "";

      const subText = `
        <span class="inline-flex items-center gap-1">
          <span class="status-dot ${status.dotColor} ${status.isPulse ? 'live-pulse' : ''}"></span>
          <span>${status.text}</span>
        </span>
        <span>·</span>
        <span>배틀 ${relativeBattle}</span>
      `;

      return this.buildHallOfFameCardHtml(member, {
        rankNum,
        rankTier,
        subTextHtml: subText,
        scoreText: (member.donations || 0).toLocaleString(),
        staggerClass,
        staggerStyle
      });
    }).join("");

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
