/**
 * Good Fellas Clan Manager - Core Application Logic (v1.4.2)
 * Mobile Optimized, Visual Charts & Gallery Clan Comparison
 * - 3분(180초) 현실적 '접속 중' 판정 윈도우 적용
 * - 트로피 변동 감지 완전 제거 및 슈퍼셀 lastSeen + 배틀로그 2중 검증 체계 확립
 * - 서버 요약 배틀로그 누락 멤버 선별적 백그라운드 보충 수집 적용
 */

console.log('%c[Good Fellas App] v1.4.2 - 3분 접속 윈도우 & lastSeen + 배틀로그 2중 검증 적용', 'color: #10b981; font-weight: bold; font-size: 14px;');

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
    this.syncThrottleMs = 15000; // 15초 쿨타운 (초고속 실시간 동기화)

    this.init();
  }

  // 로컬스토리지에서 배틀로그 캐시 복원
  loadBattleLogCache() {
    try {
      const saved = localStorage.getItem("cr_clan_battle_cache_v2");
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
      localStorage.setItem("cr_clan_battle_cache_v2", JSON.stringify(obj));
    } catch (e) {}
  }



  init() {
    this.cacheDOM();
    this.bindEvents();

    // 구버전 캐시 키만 정리
    try {
      localStorage.removeItem("cr_manager_clan_cache_v1");
      localStorage.removeItem("cr_manager_settings_v1");
      localStorage.removeItem("cr_manager_cache_ver");
      localStorage.removeItem("cr_clan_donation_cache_v1"); // 잘못된 실시간 접속 왜곡 캐시 완전 제거
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

    // 1분 주기 자동 최신 동기화 타이머 (30초 쿨타운 적용)
    setInterval(() => {
      if (document.visibilityState === 'visible') {
        this.autoSyncLive(false);
        this.syncCompareLive();
      }
    }, 60000);

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
  }

  cacheDOM() {
    this.elements = {
      initialSyncProgressBar: document.getElementById("initial-sync-progress-bar"),
      initialSyncPercent: document.getElementById("initial-sync-percent"),
      initialSyncStatusMsg: document.getElementById("initial-sync-status-msg"),
      initialSyncModal: document.getElementById("initial-sync-modal"),
      searchInput: document.getElementById("search-input"),
      sortKeySelect: document.getElementById("sort-key-select"),
      btnSortOrder: document.getElementById("btn-sort-order"),
      sortOrderText: document.getElementById("sort-order-text"),
      sortOrderIcon: document.getElementById("sort-order-icon"),
      btnManualSync: document.getElementById("btn-manual-sync"),
      btnRefreshCompare: document.getElementById("btn-refresh-compare"),
      btnAddCompareClan: document.getElementById("btn-add-compare-clan"),
      inputCustomClanTag: document.getElementById("input-custom-clan-tag"),
      viewDashboard: document.getElementById("view-dashboard"),
      viewCompare: document.getElementById("view-compare"),
      tabBtnDashboard: document.getElementById("tab-btn-dashboard"),
      tabBtnCompare: document.getElementById("tab-btn-compare"),
      tabContextHint: document.getElementById("tab-context-hint"),
      btnQuickCompare: document.getElementById("btn-quick-compare"),
      syncDot: document.getElementById("sync-dot"),
      syncSpinIcon: document.getElementById("sync-spin-icon"),
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
      compareRefreshIcon: document.getElementById("compare-refresh-icon"),
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

  hideInitialSyncModal() {
    const modal = this.elements.initialSyncModal;
    if (!modal || modal.dataset.dismissed) return;
    modal.dataset.dismissed = "true";

    this.animateProgress(100, "동기화 완료!", 250);

    setTimeout(() => {
      modal.style.transition = "opacity 0.4s ease, visibility 0.4s ease";
      modal.style.opacity = "0";
      modal.style.pointerEvents = "none";
      setTimeout(() => {
        modal.classList.add("hidden");
      }, 400);
    }, 450);
  }

  bindEvents() {
    const { searchInput, sortKeySelect, btnSortOrder, btnManualSync, btnRefreshCompare, btnAddCompareClan, inputCustomClanTag } = this.elements;
    
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

    if (btnManualSync) {
      btnManualSync.addEventListener("click", () => this.autoSyncLive(true));
    }

    if (btnRefreshCompare) {
      btnRefreshCompare.addEventListener("click", () => this.syncCompareLive());
    }

    if (btnAddCompareClan && inputCustomClanTag) {
      btnAddCompareClan.addEventListener("click", () => this.handleCustomClanAdd());
      inputCustomClanTag.addEventListener("keydown", (e) => {
        if (e.key === "Enter") this.handleCustomClanAdd();
      });
    }
  }

  toggleSortOrder() {
    this.sorting.order = this.sorting.order === "desc" ? "asc" : "desc";
    this.updateSortOrderUI();
    this.applyFilterAndRender();
  }

  updateSortOrderUI() {
    const { sortOrderText: textEl, sortOrderIcon: iconEl } = this.elements;
    const isDesc = this.sorting.order === "desc";
    
    if (textEl) {
      textEl.textContent = isDesc ? "내림차순" : "오름차순";
    }
    if (iconEl) {
      iconEl.setAttribute("data-lucide", isDesc ? "arrow-down-wide-narrow" : "arrow-up-narrow-wide");
      if (window.lucide) window.lucide.createIcons();
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

  // 캐시된 배틀로그 즉시 바인딩 (기록 없음 방지)
  bindCachedBattleLogs(members) {
    if (!Array.isArray(members)) return;
    members.forEach((m) => {
      if (this.battleLogCache.has(m.tag)) {
        const c = this.battleLogCache.get(m.tag);
        m.lastBattleTime = c.time;
        m.lastBattleType = c.type;
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

    const { syncDot: dot, syncSpinIcon: spinIcon } = this.elements;
    if (dot) dot.className = "status-dot amber live-pulse";
    if (spinIcon && isManual) spinIcon.classList.add("animate-spin");

    const isInitial = !this.elements.initialSyncModal?.dataset?.dismissed;
    if (isInitial) {
      this.animateProgress(30, "서버 연결 완료 · 클랜 정보 요청 중...");
    }

    const tag = window.crApi?.settings?.clanTag || "#G890J9JC";

    try {
      const liveData = await window.crApi.fetchClanFullData(tag, (partialData) => {
        if (partialData?.memberList) {
          this.bindCachedBattleLogs(partialData.memberList);
        }
        this.renderClan(partialData);
      });

      if (liveData && liveData.memberList) {
        // A. 서버 요약에서 수신된 배틀로그 로컬 캐시 동기화
        liveData.memberList.forEach((m) => {
          if (m.lastBattleTime) {
            this.battleLogCache.set(m.tag, {
              time: m.lastBattleTime,
              type: m.lastBattleType || "Battle"
            });
          }
        });
        this.saveBattleLogCache();

        // 기존 캐시된 배틀로그를 아직 배틀시간이 비어있는 멤버에게 보충 바인딩
        this.bindCachedBattleLogs(liveData.memberList);

        this.renderClan(liveData);

        if (isInitial) {
          this.animateProgress(100, "동기화 완료!");
          setTimeout(() => {
            this.hideInitialSyncModal();
          }, 350);
        }

        if (dot) dot.className = "status-dot green live-pulse";

        // B. 서버에서 배틀로그가 누락된 멤버만 선별하여 백그라운드 추가 수집
        const missingBattleMembers = liveData.memberList.filter((m) => !m.lastBattleTime);
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
      if (spinIcon) spinIcon.classList.remove("animate-spin");
      if (isInitial) {
        this.hideInitialSyncModal();
      }
    }
  }

  // 타 갤클 비교 데이터 백그라운드 프리페치 및 실시간 동기화
  async syncCompareLive() {
    const icon = this.elements.compareRefreshIcon;
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
      if (icon) icon.classList.remove("animate-spin");
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

  renderClan(clanData) {
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

    const { statTotalMembers, statMemberVacant, statTotalDonations, statAvgDonations, statDormantCount, chipCountAll, chipCountDormant, chipCountLow } = this.elements;

    if (statTotalMembers) statTotalMembers.textContent = `${totalMembers} / 50`;
    if (statMemberVacant) statMemberVacant.textContent = `여유 자리: ${50 - totalMembers}석`;
    if (statTotalDonations) statTotalDonations.textContent = officialWeeklyDonations.toLocaleString();
    if (statAvgDonations) statAvgDonations.textContent = `1인 평균 ${avgDonations.toLocaleString()}개`;
    if (statDormantCount) statDormantCount.textContent = `${dormantCount}명`;
    
    if (chipCountAll) chipCountAll.textContent = totalMembers;
    if (chipCountDormant) chipCountDormant.textContent = dormantCount;
    if (chipCountLow) chipCountLow.textContent = lowDonationCount;
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
    if (sorted.length < 3) return;

    const first = sorted[0];
    const second = sorted[1];
    const third = sorted[2];
    const runners = sorted.slice(3);

    podiumContainer.innerHTML = `
      <!-- 2등 은메달 (좌측) -->
      <div class="flex-1 max-w-[130px] flex flex-col items-center">
        <div class="text-center mb-1 w-full px-1">
          <div class="text-xs text-slate-300 font-semibold truncate" title="${this.escapeHtml(second.name)}">${this.escapeHtml(second.name)}</div>
          <div class="text-[11px] font-bold text-slate-300">${(second.donations || 0).toLocaleString()}개</div>
        </div>
        <div class="podium-step podium-2nd w-full h-20 sm:h-24">
          <span class="text-xl sm:text-2xl font-black text-slate-300/80 font-mono mb-2">2</span>
        </div>
      </div>
      <!-- 1등 금메달 (중앙) -->
      <div class="flex-1 max-w-[145px] flex flex-col items-center">
        <div class="text-center mb-1 w-full px-1">
          <div class="inline-flex items-center gap-1 text-[11px] text-amber-400 font-semibold mb-0.5">
            <span>👑 1위</span>
          </div>
          <div class="text-xs sm:text-sm text-white font-bold truncate" title="${this.escapeHtml(first.name)}">${this.escapeHtml(first.name)}</div>
          <div class="text-xs font-black text-amber-400">${(first.donations || 0).toLocaleString()}개</div>
        </div>
        <div class="podium-step podium-1st w-full h-28 sm:h-32">
          <span class="text-2xl sm:text-3xl font-black text-amber-400/90 font-mono mb-2">1</span>
        </div>
      </div>
      <!-- 3등 동메달 (우측) -->
      <div class="flex-1 max-w-[130px] flex flex-col items-center">
        <div class="text-center mb-1 w-full px-1">
          <div class="text-xs text-amber-600/90 font-semibold truncate" title="${this.escapeHtml(third.name)}">${this.escapeHtml(third.name)}</div>
          <div class="text-[11px] font-bold text-amber-600">${(third.donations || 0).toLocaleString()}개</div>
        </div>
        <div class="podium-step podium-3rd w-full h-14 sm:h-16">
          <span class="text-lg sm:text-xl font-black text-amber-600/80 font-mono mb-1">3</span>
        </div>
      </div>
    `;

    if (runnersContainer) {
      runnersContainer.innerHTML = runners.map((m, idx) => `
        <div class="flex items-center justify-between p-1.5 rounded bg-white/[0.02] border border-white/[0.04]">
          <div class="flex items-center gap-1 min-w-0">
            <span class="text-[10px] font-mono text-slate-500 w-3">${idx + 4}</span>
            <span class="text-[11px] text-slate-300 font-medium truncate">${this.escapeHtml(m.name)}</span>
          </div>
          <span class="text-[11px] font-bold text-slate-400 shrink-0 ml-1">${(m.donations || 0).toLocaleString()}</span>
        </div>
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

    if (this.charts.activity) {
      this.charts.activity.data.datasets[0].data = [seenToday, seen1to2d, seenDormant];
      this.charts.activity.update();
    } else {
      const ctx = activityCanvas.getContext("2d");
      this.charts.activity = new Chart(ctx, {
        type: "doughnut",
        data: {
          labels: ["오늘 접속", "1~2일 전", "3일+ 미접속"],
          datasets: [{
            data: [seenToday, seen1to2d, seenDormant],
            backgroundColor: ["rgba(16, 185, 129, 0.8)", "rgba(59, 130, 246, 0.8)", "rgba(244, 63, 94, 0.85)"],
            borderColor: "#0f121a",
            borderWidth: 2,
            hoverOffset: 3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "bottom", labels: { color: "#94a3b8", boxWidth: 8, padding: 10, font: { size: 10 } } },
            tooltip: {
              backgroundColor: "#171b26", titleColor: "#f8fafc", bodyColor: "#94a3b8",
              borderColor: "rgba(255,255,255,0.1)", borderWidth: 1, padding: 8, displayColors: true,
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
    this.renderCompareSummaryList(sortedByDonations);

    if (window.lucide) window.lucide.createIcons();
  }

  renderCompareCharts(clans, triggerAnimation = false) {
    if (!window.Chart) return;

    const labels = clans.map((c) => c.name);
    const donationData = clans.map((c) => c.donationsWeekly);
    const backgroundColors = clans.map((c) => c.isHome ? "rgba(99, 102, 241, 0.85)" : c.name.includes("Vandros") ? "rgba(16, 185, 129, 0.85)" : "rgba(244, 63, 94, 0.85)");
    const borderColors = clans.map((c) => c.isHome ? "#6366f1" : c.name.includes("Vandros") ? "#10b981" : "#f43f5e");

    const donationCanvas = this.elements.chartCompareDonations;
    if (!donationCanvas) return;

    if (this.charts.compareDonations) {
      const chart = this.charts.compareDonations;
      chart.data.labels = labels;
      chart.data.datasets[0].data = donationData;
      chart.data.datasets[0].backgroundColor = backgroundColors;
      chart.data.datasets[0].borderColor = borderColors;
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
              ctx.fillStyle = "#ffffff";
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

  renderCompareSummaryList(clans) {
    const container = this.elements.compareSummaryList;
    if (!container) return;

    const homeClan = clans.find((c) => c.isHome) || clans[0];
    const homeDonations = homeClan?.donationsWeekly || 0;

    let html = "";
    clans.forEach((c, idx) => {
      const isHome = c.isHome;
      const diffDonations = c.donationsWeekly - homeDonations;

      let diffBadge = `<span class="text-slate-500 font-mono text-[11px] font-medium bg-white/[0.04] px-1.5 py-0.5 rounded">기준</span>`;
      if (!isHome) {
        if (diffDonations > 0) {
          diffBadge = `<span class="text-emerald-400 font-mono text-[11px] font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">+${diffDonations.toLocaleString()}개</span>`;
        } else if (diffDonations < 0) {
          diffBadge = `<span class="text-rose-400 font-mono text-[11px] font-bold bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">${diffDonations.toLocaleString()}개</span>`;
        } else {
          diffBadge = `<span class="text-slate-400 font-mono text-[11px] font-medium bg-white/[0.04] px-1.5 py-0.5 rounded">0개</span>`;
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
              <div class="text-[11px] font-mono text-slate-500 mt-0.5">${this.escapeHtml(c.tag)}</div>
            </div>
          </div>
          <div class="flex items-center gap-3 sm:gap-6 shrink-0">
            <div class="text-right">
              <div class="text-[10px] text-slate-500">인원수</div>
              <div class="text-xs sm:text-sm font-bold text-slate-200 font-mono mt-0.5">${c.membersCount}<span class="text-slate-500 font-normal">/50</span></div>
            </div>
            <div class="text-right hidden sm:block">
              <div class="text-[10px] text-slate-500">주간 지원량</div>
              <div class="text-sm sm:text-base font-black text-amber-400 font-mono mt-0.5">${c.donationsWeekly.toLocaleString()}개</div>
              <div class="mt-1">${diffBadge}</div>
            </div>
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

    if (diffSeconds <= 150) return "방금 전";
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
        if (!effectiveDate) return false;
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
      container.innerHTML = "";
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
        if (battleSecsAgo <= 150) battleTextColor = "text-emerald-400 font-bold";
        else if (battleSecsAgo < 86400) battleTextColor = "text-indigo-300 font-semibold";
        else if (battleSecsAgo >= 604800) battleTextColor = "text-rose-400 font-bold";
        else if (battleSecsAgo >= 259200) battleTextColor = "text-rose-400/80 font-medium";
      }

      const donations = member.donations || 0;
      const received = member.donationsReceived || 0;

      cardsHtml += `
        <div class="mobile-member-card">
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
