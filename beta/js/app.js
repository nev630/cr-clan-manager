/**
 * Good Fellas Clan Manager - Core Application Logic (v2.0.0)
 * - 슬림 상단 바 & 스켈레톤 초기 로딩
 * - 클랜원 카드 탭 시 RoyaleAPI 즉시 새 창 연결
 * - 배틀로그 캐시 TTL(1시간) 및 탈퇴 멤버 자동 정리
 * - 동기화 중복 실행 방지 가드(isSyncing / isCompareSyncing)
 */

const SWORDS_INLINE_SVG = `<svg class="w-3 h-3 text-slate-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" x2="19" y1="19" y2="13"/><line x1="16" x2="20" y1="16" y2="20"/><line x1="19" x2="21" y1="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" x2="9" y1="14" y2="18"/><line x1="7" x2="4" y1="17" y2="20"/><line x1="3" x2="5" y1="19" y2="21"/></svg>`;

const EXTERNAL_LINK_SVG = `<svg class="w-3 h-3 text-slate-500 group-hover:text-blue-400 transition-colors shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><path d="M7 7h10v10"/></svg>`;

const BATTLE_NONE_TTL_MS = 60 * 60 * 1000; // 배틀 미보유 캐시 TTL: 1시간

const COMPARE_METRICS_META = {
  donationsWeekly: {
    title: "주간 총 지원량 비교",
    listTitle: "클랜별 핵심 현황 및 지원량 격차",
    suffix: "개",
    label: "주간 지원량"
  },
  donationsAvg: {
    title: "1인당 평균 주간 지원량 비교",
    listTitle: "클랜별 1인 평균 지원량 및 격차",
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
    this.charts = { activity: null };
    this.elements = {};

    this.pendingClanData = null;
    this.pendingFlushTimer = null;

    this.isSyncing = false;
    this.isCompareSyncing = false;
    this.lastSyncTime = 0;
    this.lastCompareSyncTime = 0;
    this.syncThrottleMs = 15000;
    this.compareThrottleMs = 30000;

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

  pruneBattleLogCache(members) {
    if (!Array.isArray(members) || members.length === 0) return;
    const validTags = new Set(members.map((m) => m.tag));
    let removed = false;
    for (const tag of this.battleLogCache.keys()) {
      if (!validTags.has(tag)) {
        this.battleLogCache.delete(tag);
        removed = true;
      }
    }
    if (removed) {
      this.saveBattleLogCache();
    }
  }

  init() {
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
        this.autoSyncLive(false);
        if (this.activeMainTab === "compare") {
          this.syncCompareLive(false);
        }
      }
    });

    setInterval(() => {
      if (document.visibilityState === "visible" && this.currentData) {
        this.renderMobileList();
      }
    }, 60000);
  }

  cacheDOM() {
    this.elements = {
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
      clanName: document.getElementById("clan-name"),
      clanTag: document.getElementById("clan-tag"),
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
      compareBarsStage: document.getElementById("compare-bars-stage"),
      compareChartContainer: document.getElementById("compare-chart-container"),
      compareChartTitle: document.getElementById("compare-chart-title"),
      compareListTitle: document.getElementById("compare-list-title"),
      compareSummaryList: document.getElementById("compare-summary-list"),
      emptyState: document.getElementById("empty-state"),
      memberMobileList: document.getElementById("member-mobile-list"),
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
      this.applyTheme(initialTheme);
    } catch (e) {}
  }

  getRoyaleApiUrl(tag) {
    const cleanTag = String(tag || "").replace("#", "");
    return `https://royaleapi.com/player/${encodeURIComponent(cleanTag)}`;
  }

  isAnyModalOpen() {
    const modals = [
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
            const { liveData } = this.pendingClanData;
            this.pendingClanData = null;
            this.processIncomingClanData(liveData);
          }
        }, 160);
      }
    }
  }

  bindEvents() {
    const {
      searchInput,
      btnSearchClear,
      sortKeySelect,
      btnSortOrder
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
          this.applyFilterAndRender();
        }, 200);
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

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
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
      this.applyFilterAndRender();
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
    const dotColor = type === "error" ? "bg-rose-400" : type === "success" ? "bg-emerald-400" : "bg-blue-400";
    toast.innerHTML = `
      <span class="w-1.5 h-1.5 rounded-full ${dotColor} shrink-0"></span>
      <span>${this.escapeHtml(message)}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add("toast-leaving");
      setTimeout(() => toast.remove(), 200);
    }, 2200);
  }

  toggleTheme(e) {
    const isDark = document.documentElement.classList.contains("dark");
    const nextTheme = isDark ? "light" : "dark";

    let x = window.innerWidth - 36;
    let y = 34;
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
                duration: 360,
                easing: "cubic-bezier(0.22, 1, 0.36, 1)",
                pseudoElement: "::view-transition-new(root)"
              }
            );
          } catch (err) {}
        });
      }
    } else {
      this.applyTheme(nextTheme);
    }
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

    if (this.charts.activity) {
      const donutChart = this.charts.activity;
      donutChart.data.datasets[0].borderColor = isLight ? "#ffffff" : "#14171f";
      if (donutChart.options.plugins?.legend?.labels) {
        donutChart.options.plugins.legend.labels.color = isLight ? "#0f172a" : "#94a3b8";
      }
      if (donutChart.options.plugins?.tooltip) {
        donutChart.options.plugins.tooltip.backgroundColor = isLight ? "#ffffff" : "#1d222e";
        donutChart.options.plugins.tooltip.titleColor = isLight ? "#0f172a" : "#f8fafc";
        donutChart.options.plugins.tooltip.bodyColor = isLight ? "#334155" : "#94a3b8";
        donutChart.options.plugins.tooltip.borderColor = isLight ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.1)";
      }
      donutChart.update("none");
    }

    if (this.activeMainTab === "compare") {
      this.renderComparisonView();
    }

    if (this.currentData) {
      this.applyFilterAndRender();
    }
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
      target.style.transform = isDesc ? "rotate(0deg)" : "rotate(180deg)";
    }
  }

  switchMainTab(tabName) {
    if (this.activeMainTab === tabName) return;
    this.activeMainTab = tabName;

    const { viewDashboard, viewCompare, tabBtnDashboard, tabBtnCompare, mainTabPill } = this.elements;

    if (mainTabPill) {
      mainTabPill.classList.toggle("slide-right", tabName === "compare");
    }

    if (tabBtnDashboard) tabBtnDashboard.classList.toggle("active", tabName !== "compare");
    if (tabBtnCompare) tabBtnCompare.classList.toggle("active", tabName === "compare");

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

      this.renderComparisonView();

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

      if (this.currentData?.memberList) {
        this.renderPodium(this.currentData.memberList);
        this.renderActivityDonut(this.currentData.memberList);
      }
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

    this.renderComparisonView();
  }

  // 배틀 이력 캐시 바인딩 (time: "none"은 1시간 TTL 만료 후 재조회 허용)
  bindCachedBattleLogs(members) {
    if (!Array.isArray(members)) return;
    const now = Date.now();
    let cacheChanged = false;

    members.forEach((m) => {
      if (!this.battleLogCache.has(m.tag)) return;
      const c = this.battleLogCache.get(m.tag);

      if (c.time === "none") {
        if (c.checkedAt && now - c.checkedAt < BATTLE_NONE_TTL_MS) {
          m._noBattles = true;
        } else {
          this.battleLogCache.delete(m.tag);
          cacheChanged = true;
        }
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
    });

    if (cacheChanged) {
      this.saveBattleLogCache();
    }
  }

  async fetchAllMembersBattleLogs(members) {
    if (!Array.isArray(members) || members.length === 0) return;
    if (!window.crApi || typeof window.crApi.fetchPlayerBattleLog !== "function") return;

    let hasNewData = false;
    const chunkSize = 10;

    for (let i = 0; i < members.length; i += chunkSize) {
      if (window.crApi.isRateLimited?.()) break;

      const chunk = members.slice(i, i + chunkSize);

      const chunkPromises = chunk.map(async (m) => {
        if (window.crApi.isRateLimited?.()) return;

        const battlelog = await window.crApi.fetchPlayerBattleLog(m.tag);
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
            this.battleLogCache.set(m.tag, {
              time: newTime,
              type: newType,
              checkedAt: Date.now()
            });
            hasNewData = true;
          }
        } else if (Array.isArray(battlelog) && battlelog.length === 0) {
          this.battleLogCache.set(m.tag, {
            time: "none",
            type: "None",
            checkedAt: Date.now()
          });
          m._noBattles = true;
          hasNewData = true;
        }
      });

      await Promise.allSettled(chunkPromises);

      if (i + chunkSize < members.length && !window.crApi.isRateLimited?.()) {
        await new Promise((r) => setTimeout(r, 40));
      }
    }

    if (hasNewData && this.currentData) {
      this.saveBattleLogCache();
      if (!this.isAnyModalOpen()) {
        this.applyFilterAndRender();
        this.updateStats(this.currentData);
        this.renderActivityDonut(this.currentData.memberList || []);
      }
    }
  }

  processIncomingClanData(liveData) {
    if (!liveData || !liveData.memberList) return;

    if (this.isAnyModalOpen()) {
      this.pendingClanData = { liveData };
      return;
    }

    this.pruneBattleLogCache(liveData.memberList);
    this.bindCachedBattleLogs(liveData.memberList);

    const missingBattleMembers = liveData.memberList.filter(
      (m) => (!m.lastBattleTime || m._fromCache) && !m._noBattles
    );

    let hasCacheUpdated = false;
    liveData.memberList.forEach((m) => {
      if (m.lastBattleTime) {
        const existing = this.battleLogCache.get(m.tag);
        if (!existing || existing.time !== m.lastBattleTime) {
          this.battleLogCache.set(m.tag, {
            time: m.lastBattleTime,
            type: m.lastBattleType || "Battle",
            checkedAt: Date.now()
          });
          hasCacheUpdated = true;
        }
      }
    });
    if (hasCacheUpdated) {
      this.saveBattleLogCache();
    }

    this.renderClan(liveData);

    if (missingBattleMembers.length > 0) {
      this.fetchAllMembersBattleLogs(missingBattleMembers);
    }
  }

  async autoSyncLive(isManual = false) {
    if (this.isSyncing) return;

    const now = Date.now();
    if (!isManual && now - this.lastSyncTime < this.syncThrottleMs) {
      return;
    }

    this.isSyncing = true;
    this.lastSyncTime = now;
    const tag = window.crApi?.settings?.clanTag || "#G890J9JC";

    try {
      const liveData = await window.crApi.fetchClanFullData(tag, null, isManual);
      if (liveData && liveData.memberList) {
        this.processIncomingClanData(liveData);
      }
    } catch (err) {
      console.error("실시간 최신 동기화 실패:", err.message);

      if (!this.currentData) {
        this.renderEmptyState(err.message);
        this.showErrorModal(err);
      } else if (isManual) {
        this.showToast(`데이터 갱신 실패: ${err.message}`, "error");
      }
    } finally {
      this.isSyncing = false;
    }
  }

  async syncCompareLive(force = false) {
    if (this.isCompareSyncing) return;

    const now = Date.now();
    if (!force && now - this.lastCompareSyncTime < this.compareThrottleMs) {
      return;
    }

    this.isCompareSyncing = true;
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
      console.warn("갤클 비교 실시간 조회 오류:", e.message);
    } finally {
      this.isCompareSyncing = false;
      if (this.activeMainTab === "compare") {
        this.renderComparisonView();
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
    const emptyState = this.elements.emptyState;
    const podium = this.elements.podiumContainer;
    const runners = this.elements.podiumRunnersContainer;

    if (podium) {
      podium.innerHTML = `<div class="text-center py-8 text-xs text-slate-500">데이터를 불러오지 못했습니다.</div>`;
    }
    if (runners) {
      runners.innerHTML = "";
    }

    if (this.elements.statTotalMembers) this.elements.statTotalMembers.textContent = "- / 50";
    if (this.elements.statMemberVacant) this.elements.statMemberVacant.textContent = "조회 실패";
    if (this.elements.statTotalDonations) this.elements.statTotalDonations.textContent = "-";
    if (this.elements.statAvgDonations) this.elements.statAvgDonations.textContent = "-";
    if (this.elements.statDormantCount) this.elements.statDormantCount.textContent = "-";

    if (mobileList) {
      mobileList.innerHTML = `
        <div class="py-12 px-4 text-center">
          <p class="text-xs font-semibold text-slate-300">클랜 데이터를 불러올 수 없습니다</p>
          <p class="text-[11px] text-slate-500 mt-1 max-w-xs mx-auto">${this.escapeHtml(reason || "API 서버 응답 실패")}</p>
          <button onclick="window.app.autoSyncLive(true)" class="mt-3 px-3 py-1.5 bg-[#1d222e] hover:bg-white/[0.1] text-xs text-slate-200 rounded-lg border border-white/[0.08] transition-colors inline-flex items-center gap-1.5">
            <span>다시 시도</span>
          </button>
        </div>
      `;
    }
    if (emptyState) emptyState.classList.add("hidden");
  }

  renderClan(clanData) {
    this.currentData = clanData;
    const { clanName: nameEl, clanTag: tagEl } = this.elements;

    if (nameEl) nameEl.textContent = clanData.name || "Good Fellas";
    if (tagEl) tagEl.textContent = clanData.tag || "#G890J9JC";

    const gfInCompare = (this.compareClansData || []).find((c) => (c.tag || "").toUpperCase() === "#G890J9JC");
    if (gfInCompare) {
      gfInCompare.name = clanData.name || gfInCompare.name;
      gfInCompare.members = clanData.memberList ? clanData.memberList.length : (clanData.members ?? gfInCompare.members);
      if (typeof clanData.donationsPerWeek === "number") gfInCompare.donationsPerWeek = clanData.donationsPerWeek;

      if (this.activeMainTab === "compare") {
        this.renderComparisonView();
      }
    }

    this.updateStats(clanData);
    this.renderCharts(clanData.memberList || []);
    this.applyFilterAndRender();
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

    if (statTotalMembers) statTotalMembers.textContent = `${totalMembers} / 50`;
    if (statMemberVacant) statMemberVacant.textContent = `여유 자리: ${50 - totalMembers}석`;
    if (statTotalDonations) statTotalDonations.textContent = officialWeeklyDonations.toLocaleString();
    if (statAvgDonations) statAvgDonations.textContent = `1인 평균 ${avgDonations.toLocaleString()}개`;
    if (statDormantCount) statDormantCount.textContent = `${dormantCount}명`;

    if (chipCountAll) chipCountAll.textContent = totalMembers.toLocaleString();
    if (chipCountLow) chipCountLow.textContent = lowDonationCount.toLocaleString();
  }

  renderCharts(members) {
    if (members.length === 0) return;
    this.renderPodium(members);
    this.renderActivityDonut(members);
  }

  renderPodium(members) {
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

    podiumContainer.innerHTML = `
      <!-- 2위 -->
      <a href="${this.getRoyaleApiUrl(second.tag)}" target="_blank" rel="noopener noreferrer" class="flex-1 max-w-[130px] flex flex-col items-center group">
        <div class="text-center mb-1.5 w-full px-1">
          <div class="text-xs text-white font-semibold truncate group-hover:text-blue-400 transition-colors" title="${this.escapeHtml(second.name)}">${this.escapeHtml(second.name)}</div>
          <div class="text-[11px] font-mono text-slate-400 mt-0.5 tabular-nums">${(second.donations || 0).toLocaleString()}개</div>
        </div>
        <div class="podium-step podium-2nd w-full h-20 sm:h-24">
          <span class="text-xl sm:text-2xl font-bold text-slate-400 font-mono mb-2">2</span>
        </div>
      </a>
      <!-- 1위 -->
      <a href="${this.getRoyaleApiUrl(first.tag)}" target="_blank" rel="noopener noreferrer" class="flex-1 max-w-[145px] flex flex-col items-center group">
        <div class="text-center mb-1.5 w-full px-1">
          <div class="text-xs sm:text-sm text-white font-bold truncate group-hover:text-blue-400 transition-colors" title="${this.escapeHtml(first.name)}">${this.escapeHtml(first.name)}</div>
          <div class="text-xs font-mono font-semibold text-blue-400 mt-0.5 tabular-nums">${(first.donations || 0).toLocaleString()}개</div>
        </div>
        <div class="podium-step podium-1st w-full h-28 sm:h-32">
          <span class="text-2xl sm:text-3xl font-bold text-blue-400 font-mono mb-2">1</span>
        </div>
      </a>
      <!-- 3위 -->
      <a href="${this.getRoyaleApiUrl(third.tag)}" target="_blank" rel="noopener noreferrer" class="flex-1 max-w-[130px] flex flex-col items-center group">
        <div class="text-center mb-1.5 w-full px-1">
          <div class="text-xs text-white font-semibold truncate group-hover:text-blue-400 transition-colors" title="${this.escapeHtml(third.name)}">${this.escapeHtml(third.name)}</div>
          <div class="text-[11px] font-mono text-slate-400 mt-0.5 tabular-nums">${(third.donations || 0).toLocaleString()}개</div>
        </div>
        <div class="podium-step podium-3rd w-full h-14 sm:h-16">
          <span class="text-lg sm:text-xl font-bold text-slate-500 font-mono mb-1">3</span>
        </div>
      </a>
    `;

    if (runnersContainer) {
      runnersContainer.innerHTML = runners.map((m, idx) => `
        <a href="${this.getRoyaleApiUrl(m.tag)}" target="_blank" rel="noopener noreferrer" class="hover:bg-white/[0.04] transition-colors flex items-center justify-between p-1.5 rounded bg-white/[0.02]">
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="text-[10px] font-mono text-slate-500 w-3">${idx + 4}</span>
            <span class="text-[11px] text-slate-300 font-medium truncate">${this.escapeHtml(m.name)}</span>
          </div>
          <span class="text-[11px] font-mono font-semibold text-slate-400 shrink-0 ml-1 tabular-nums">${(m.donations || 0).toLocaleString()}</span>
        </a>
      `).join("");
    }
  }

  renderActivityDonut(members) {
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
            backgroundColor: ["#3b82f6", "#64748b", "#f43f5e"],
            borderColor: isLight ? "#ffffff" : "#14171f",
            borderWidth: 2,
            hoverOffset: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: {
            duration: 300
          },
          plugins: {
            legend: {
              position: "bottom",
              labels: {
                color: isLight ? "#0f172a" : "#94a3b8",
                boxWidth: 8,
                padding: 10,
                font: { size: 10, weight: "600" }
              }
            },
            tooltip: {
              backgroundColor: isLight ? "#ffffff" : "#1d222e",
              titleColor: isLight ? "#0f172a" : "#f8fafc",
              bodyColor: isLight ? "#334155" : "#94a3b8",
              borderColor: isLight ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.1)",
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

  renderComparisonView() {
    let clans = this.compareClansData;
    if (!Array.isArray(clans) || clans.length === 0) {
      clans = window.crApi?.getGalleryClansPreset() || [];
      this.compareClansData = clans;
    }

    const metricKey = COMPARE_METRICS_META[this.activeCompareMetric] ? this.activeCompareMetric : "donationsWeekly";

    const enriched = clans.map((c) => {
      const isHome = (c.tag || "").toUpperCase() === "#G890J9JC" || c.isHome === true;
      const membersCount = typeof c.members === "number" ? c.members : (c.memberList?.length ?? null);
      const donationsWeekly = typeof c.donationsPerWeek === "number" ? c.donationsPerWeek : null;
      const donationsAvg = (donationsWeekly !== null && membersCount)
        ? Math.round(donationsWeekly / membersCount)
        : null;

      return {
        ...c,
        isHome,
        membersCount,
        donationsWeekly,
        donationsAvg
      };
    });

    const sortedClans = [...enriched].sort((a, b) => (b[metricKey] ?? -1) - (a[metricKey] ?? -1));
    sortedClans.forEach((c, idx) => { c.metricRank = idx + 1; });

    this.renderCompareCharts(sortedClans, metricKey);
    this.renderCompareSummaryList(sortedClans, metricKey);
  }

  renderCompareCharts(clans, metricKey = "donationsWeekly") {
    const stage = this.elements?.compareBarsStage || document.getElementById("compare-bars-stage");
    if (!stage) return;

    const meta = COMPARE_METRICS_META[metricKey] || COMPARE_METRICS_META.donationsWeekly;
    const isDonation = metricKey === "donationsWeekly";
    const values = clans.map((c) => c[metricKey] ?? 0);
    const maxVal = Math.max(...values, 1);

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

    let html = `
      <div class="absolute left-11 sm:left-12 right-2.5 sm:right-3.5 top-6 sm:top-7 bottom-7 sm:bottom-7">
        <div class="absolute inset-0 pointer-events-none z-0">
          ${tickSteps.map((t) => `
            <div class="absolute left-0 right-0 border-b ${t.percent === 0 ? 'border-white/[0.14] compare-baseline' : 'border-white/[0.05]'} compare-grid-line" style="bottom: ${t.percent}%;">
              <span class="absolute right-full mr-2 sm:mr-2.5 text-[10px] sm:text-[11px] font-mono text-slate-400 compare-tick-text select-none text-right whitespace-nowrap" style="top: 0; transform: translateY(-50%);">${t.val.toLocaleString()}</span>
            </div>
          `).join("")}
        </div>
        <div class="absolute inset-0 flex items-end justify-between px-1.5 sm:px-5 pointer-events-none z-10">
    `;

    clans.forEach((c) => {
      const rawVal = c[metricKey];
      const hasVal = typeof rawVal === "number";
      const val = hasVal ? rawVal : 0;
      const barHeightPercent = hasVal ? Math.max(3.5, Math.min(100, (val / tickMax) * 100)) : 3.5;

      // 내 클랜은 단일 브랜드 블루, 비교 클랜은 뉴트럴 슬레이트 톤
      const barClasses = c.isHome
        ? "bg-blue-500"
        : "bg-slate-600/80";

      html += `
        <div class="flex-1 max-w-[95px] sm:max-w-[130px] h-full flex flex-col justify-end items-center relative pointer-events-auto">
          <div class="w-[72%] sm:w-[68%] max-w-[68px] sm:max-w-[90px] relative flex justify-center transition-all duration-300" style="height: ${barHeightPercent.toFixed(2)}%;">
            <div class="compare-bar-header absolute bottom-full mb-1 sm:mb-1.5 left-1/2 -translate-x-1/2 text-center pointer-events-none whitespace-nowrap">
              <span class="text-xs sm:text-[13px] font-bold tracking-tight ${c.isHome ? 'text-blue-400' : 'text-white'} compare-header-num">${hasVal ? `${val.toLocaleString()}${meta.suffix}` : "-"}</span>
            </div>
            <div class="w-full h-full rounded-t-lg ${barClasses}"></div>
          </div>
          <div class="compare-clan-name absolute top-full pt-1.5 sm:pt-2 w-full text-center text-xs sm:text-[13px] font-semibold text-white tracking-tight truncate select-none" title="${this.escapeHtml(c.name)}">
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
  }

  renderCompareSummaryList(clans, metricKey = "donationsWeekly") {
    const container = this.elements.compareSummaryList;
    if (!container) return;

    const meta = COMPARE_METRICS_META[metricKey] || COMPARE_METRICS_META.donationsWeekly;
    const homeClan = clans.find((c) => c.isHome) || clans[0];
    const homeValue = homeClan?.[metricKey];

    let html = "";
    clans.forEach((c, idx) => {
      const isHome = c.isHome;
      const currentVal = c[metricKey];
      const hasVal = typeof currentVal === "number" && typeof homeValue === "number";
      const diffVal = hasVal ? currentVal - homeValue : null;

      let diffBadge = `<span class="text-slate-400 font-mono text-[11px] font-medium bg-white/[0.04] px-1.5 py-0.5 rounded inline-block">기준</span>`;
      if (!isHome) {
        if (diffVal === null) {
          diffBadge = `<span class="text-slate-500 font-mono text-[11px]">-</span>`;
        } else if (diffVal > 0) {
          diffBadge = `<span class="text-emerald-400 font-mono text-[11px] font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded inline-block">+${diffVal.toLocaleString()}${meta.suffix}</span>`;
        } else if (diffVal < 0) {
          diffBadge = `<span class="text-rose-400 font-mono text-[11px] font-bold bg-rose-500/10 px-1.5 py-0.5 rounded inline-block">${diffVal.toLocaleString()}${meta.suffix}</span>`;
        } else {
          diffBadge = `<span class="text-slate-400 font-mono text-[11px] font-medium bg-white/[0.04] px-1.5 py-0.5 rounded inline-block">0${meta.suffix}</span>`;
        }
      }

      const memberLabel = typeof c.membersCount === "number" ? `${c.membersCount}/50명` : "집계 중";

      html += `
        <div class="p-3.5 sm:p-4 flex items-center justify-between gap-3 ${isHome ? 'bg-blue-950/20' : ''}">
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="text-xs font-mono font-bold w-5 text-center shrink-0 ${idx === 0 ? 'text-blue-400' : 'text-slate-500'}">${idx + 1}</span>
            <div class="min-w-0">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="font-bold text-white text-sm tracking-tight truncate">${this.escapeHtml(c.name)}</span>
                ${isHome ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500/15 text-blue-400 shrink-0">내 클랜</span>' : ''}
              </div>
              <div class="text-[11px] font-mono text-slate-500 mt-0.5 flex items-center gap-1.5">
                <span>${this.escapeHtml(c.tag)}</span>
                <span>·</span>
                <span class="text-slate-400 font-sans">${memberLabel}</span>
              </div>
            </div>
          </div>
          <div class="text-right shrink-0">
            <div class="text-[10px] text-slate-500">${meta.label}</div>
            <div class="text-xs sm:text-sm font-bold text-white font-mono mt-0.5 tabular-nums">${typeof currentVal === "number" ? `${currentVal.toLocaleString()}${meta.suffix}` : "-"}</div>
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
    this.applyFilterAndRender();
  }

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
          <a href="${this.getRoyaleApiUrl(member.tag)}" target="_blank" rel="noopener noreferrer" class="p-3.5 hover:bg-white/[0.04] transition-colors flex items-center justify-between gap-2 group">
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
                ${EXTERNAL_LINK_SVG}
              </div>
              <div class="text-[10px] text-slate-500 font-mono mt-0.5">배틀: ${relativeBattle}</div>
            </div>
          </a>
        `;
      }).join("");
    }

    this.openModalSmooth(modal);
  }

  closeDormantModal() {
    const modal = this.elements.dormantMembersModal || document.getElementById("dormant-members-modal");
    this.closeModalSmooth(modal);
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
        textColor: "text-slate-300 font-medium"
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
      textColor: "text-slate-300 font-medium"
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

  applyFilterAndRender() {
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
    this.renderMobileList();
  }

  getRoleBadge(role) {
    switch (role) {
      case "leader": return `<span class="badge-role badge-leader">대표</span>`;
      case "coLeader": return `<span class="badge-role badge-coleader">공동대표</span>`;
      case "elder": return `<span class="badge-role badge-elder">장로</span>`;
      default: return `<span class="badge-role badge-member">멤버</span>`;
    }
  }

  renderMobileList() {
    const container = this.elements.memberMobileList;
    const emptyState = this.elements.emptyState;
    if (!container) return;

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
        else if (battleSecsAgo < 86400) battleTextColor = "text-blue-400 font-semibold";
        else if (battleSecsAgo >= 259200) battleTextColor = "text-rose-400 font-semibold";
      }

      const donations = member.donations || 0;
      const received = member.donationsReceived || 0;

      cardsHtml += `
        <a href="${this.getRoyaleApiUrl(member.tag)}" target="_blank" rel="noopener noreferrer" class="mobile-member-card group">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="font-mono text-xs text-slate-500 w-4 shrink-0">${member.clanRank || idx + 1}</span>
              <span class="font-bold text-white text-[13px] truncate">${this.escapeHtml(member.name)}</span>
              ${this.getRoleBadge(member.role)}
              <span class="text-[10px] font-mono text-slate-500 truncate hidden sm:inline">${this.escapeHtml(member.tag)}</span>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <span class="text-xs font-mono font-semibold text-slate-300 tabular-nums">${(member.trophies || 0).toLocaleString()}</span>
              ${EXTERNAL_LINK_SVG}
            </div>
          </div>

          <div class="grid grid-cols-3 gap-1 pt-2 mt-2 border-t border-white/[0.05] items-center">
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
              <div class="text-xs font-bold ${donations >= 300 ? 'text-blue-400' : donations === 0 ? 'text-rose-400' : 'text-slate-100'} mt-0.5 font-mono truncate tabular-nums">
                ${donations.toLocaleString()}<span class="text-[10px] font-normal text-slate-500 ml-0.5">/ ${received}</span>
              </div>
            </div>
          </div>
        </a>
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
