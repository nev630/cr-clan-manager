/**
 * Good Fellas Clan Manager - Core Application Logic
 * Mobile Optimized, Visual Charts & Gallery Clan Comparison
 * (Optimized Version)
 */

class ClanManagerApp {
  constructor() {
    this.currentData = null;
    this.filteredMembers = [];
    this.activeFilter = "all"; // 'all' | 'dormant' | 'low-donations'
    this.searchQuery = "";
    this.sorting = { key: "donations", order: "desc" };
    this.activeMainTab = "dashboard";
    this.compareTags = ["#G890J9JC", "#JYQRP2C2", "#Q0U22YGQ"];
    this.compareClansData = [];
    this.hasCompareLoaded = false;
    
    // Chart.js 인스턴스
    this.charts = { activity: null, compareDonations: null };
    
    // DOM 캐싱 (성능 최적화)
    this.elements = {};

    this.init();
  }

  init() {
    this.cacheDOM();
    this.bindEvents();

    // 이전 로컬스토리지 캐시 및 구버전 세팅 완전 정리
    try {
      localStorage.removeItem("cr_manager_clan_cache_v1");
      localStorage.removeItem("cr_manager_settings_v1");
      localStorage.removeItem("cr_manager_cache_ver");
    } catch (e) {}

    // 갤클 비교 프리셋 데이터 사전 로드 (오프라인/즉시 렌더링 지원)
    if (window.crApi && typeof window.crApi.getGalleryClansPreset === "function") {
      this.compareClansData = window.crApi.getGalleryClansPreset();
    }

    if (window.lucide) window.lucide.createIcons();

    // 초기 로딩바 서서히 차오르는 프로그레시브 애니메이션 시작
    this.initialProgress = 5;
    this.updateInitialProgress(this.initialProgress, "서버 연결 및 데이터 동기화 중...");
    this.progressInterval = setInterval(() => {
      if (this.initialProgress < 88) {
        const step = Math.max(2, Math.round((90 - this.initialProgress) / 4));
        this.initialProgress += step;
        let msg = "클랜원 지원량 및 접속 기록 동기화 중...";
        if (this.initialProgress > 60) msg = "시즌 트로피 및 랭킹 데이터 집계 중...";
        this.updateInitialProgress(this.initialProgress, msg);
      }
    }, 150);

    // 접속 즉시 무조건 실시간 최신 정보 동기화 실행
    this.autoSyncLive();

    // 5분 주기 자동 최신 동기화 타이머 (Page Visibility API 최적화 적용)
    setInterval(() => {
      if (document.visibilityState === 'visible') {
        this.autoSyncLive();
      }
    }, 1000 * 60 * 5);

    // 화면 탭 활성화 시 즉각 동기화 (Page Visibility API 최적화 적용)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.autoSyncLive();
        if (this.activeMainTab === 'compare') {
          this.syncCompareLive();
        }
      }
    });
  }

  cacheDOM() {
    // 자주 접근하는 DOM 요소를 한 번만 찾아서 캐싱
    this.elements = {
      initialSyncProgressBar: document.getElementById("initial-sync-progress-bar"),
      initialSyncPercent: document.getElementById("initial-sync-percent"),
      initialSyncStatusMsg: document.getElementById("initial-sync-status-msg"),
      initialSyncModal: document.getElementById("initial-sync-modal"),
      searchInput: document.getElementById("search-input"),
      sortSelect: document.getElementById("sort-select"),
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
      syncStatusText: document.getElementById("sync-status-text"),
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
    const { initialSyncProgressBar: bar, initialSyncPercent: percentEl, initialSyncStatusMsg: msgEl } = this.elements;
    const clamped = Math.min(100, Math.max(0, percent));
    if (bar) bar.style.width = `${clamped}%`;
    if (percentEl) percentEl.textContent = `${clamped}%`;
    if (msgEl && msg) msgEl.textContent = msg;
  }

  hideInitialSyncModal() {
    const modal = this.elements.initialSyncModal;
    if (!modal || modal.dataset.dismissed) return;
    modal.dataset.dismissed = "true";

    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }

    this.updateInitialProgress(100, "동기화 완료!");

    setTimeout(() => {
      modal.style.opacity = "0";
      modal.style.pointerEvents = "none";
      setTimeout(() => {
        modal.classList.add("hidden");
      }, 400);
    }, 300);
  }

  bindEvents() {
    const { searchInput, sortSelect, btnManualSync, btnRefreshCompare, btnAddCompareClan, inputCustomClanTag } = this.elements;
    
    // 1. 실시간 검색 인풋 (디바운싱 최적화 적용)
    if (searchInput) {
      let searchTimeout;
      searchInput.addEventListener("input", (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          this.searchQuery = e.target.value.trim().toLowerCase();
          this.applyFilterAndRender();
        }, 300); // 300ms 딜레이
      });
    }

    // 2. 정렬 드롭다운
    if (sortSelect) {
      sortSelect.addEventListener("change", (e) => {
        const [key, order] = e.target.value.split("-");
        this.sorting.key = key;
        this.sorting.order = order || "desc";
        this.applyFilterAndRender();
      });
    }

    // 3. 수동 동기화 보조 버튼 (데드 코드 파라미터 isManual 제거)
    if (btnManualSync) {
      btnManualSync.addEventListener("click", () => this.autoSyncLive());
    }

    // 4. 비교 탭 새로고침 버튼 (데드 코드 파라미터 isManual 제거)
    if (btnRefreshCompare) {
      btnRefreshCompare.addEventListener("click", () => this.syncCompareLive());
    }

    // 5. 커스텀 갤클 추가 버튼 및 엔터키 바인딩
    if (btnAddCompareClan && inputCustomClanTag) {
      btnAddCompareClan.addEventListener("click", () => this.handleCustomClanAdd());
      inputCustomClanTag.addEventListener("keydown", (e) => {
        if (e.key === "Enter") this.handleCustomClanAdd();
      });
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

      this.renderComparisonView();

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

  async autoSyncLive() {
    const { syncDot: dot, syncStatusText: statusText, syncSpinIcon: spinIcon } = this.elements;

    if (dot) dot.className = "status-dot amber live-pulse";
    if (statusText) statusText.textContent = "동기화 중";

    const tag = window.crApi?.settings?.clanTag || "#G890J9JC";

    try {
      const liveData = await window.crApi.fetchClanFullData(tag, (partialData) => {
        this.renderClan(partialData);
        this.hideInitialSyncModal();
        if (dot) dot.className = "status-dot green live-pulse";
        if (statusText) statusText.textContent = "실시간";
      });

      if (liveData && liveData.memberList) {
        this.renderClan(liveData);
        if (dot) dot.className = "status-dot green live-pulse";
        if (statusText) statusText.textContent = "실시간";
      }
    } catch (err) {
      console.warn("실시간 최신 동기화 알림 (프리셋 폴백 적용):", err.message);
      if (!this.currentData && window.DEMO_CLAN_DATA) {
        this.renderClan(window.DEMO_CLAN_DATA);
      }
      if (dot) dot.className = "status-dot green";
      if (statusText) statusText.textContent = "안정";
    } finally {
      if (spinIcon) spinIcon.classList.remove("animate-spin");
      this.hideInitialSyncModal();
    }
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

      const lastSeen = window.crApi.parseApiDate(m.lastSeen);
      if (lastSeen) {
        const daysAgo = (now - lastSeen.getTime()) / (1000 * 60 * 60 * 24);
        if (daysAgo >= 3) dormantCount++;
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
      const lastSeen = window.crApi.parseApiDate(m.lastSeen);
      if (!lastSeen) {
        seenDormant++;
        return;
      }
      const daysAgo = (now - lastSeen.getTime()) / (1000 * 60 * 60 * 24);
      if (daysAgo < 1) seenToday++;
      else if (daysAgo < 3) seen1to2d++;
      else seenDormant++;
    });

    const activityCanvas = this.elements.chartActivity;
    if (!activityCanvas) return;

    // 차트 재생성 대신 데이터 갱신 최적화 적용
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
      this.renderComparisonView();
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

  renderComparisonView() {
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

    this.renderCompareCharts(sortedByDonations);
    this.renderCompareSummaryList(sortedByDonations);

    if (window.lucide) window.lucide.createIcons();
  }

  renderCompareCharts(clans) {
    if (!window.Chart) return;

    const labels = clans.map((c) => c.name);
    const donationData = clans.map((c) => c.donationsWeekly);
    const backgroundColors = clans.map((c) => c.isHome ? "rgba(99, 102, 241, 0.85)" : c.name.includes("Vandros") ? "rgba(16, 185, 129, 0.85)" : "rgba(244, 63, 94, 0.85)");
    const borderColors = clans.map((c) => c.isHome ? "#6366f1" : c.name.includes("Vandros") ? "#10b981" : "#f43f5e");

    const donationCanvas = this.elements.chartCompareDonations;
    if (!donationCanvas) return;

    // 차트 재생성 대신 데이터 갱신 최적화 적용
    if (this.charts.compareDonations) {
      this.charts.compareDonations.data.labels = labels;
      this.charts.compareDonations.data.datasets[0].data = donationData;
      this.charts.compareDonations.data.datasets[0].backgroundColor = backgroundColors;
      this.charts.compareDonations.data.datasets[0].borderColor = borderColors;
      this.charts.compareDonations.update();
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
          responsive: true, maintainAspectRatio: false, layout: { padding: { top: 24 } },
          scales: {
            y: {
              beginAtZero: true, ticks: { color: "#94a3b8", font: { size: 10 } },
              grid: { color: "rgba(255,255,255,0.05)" },
              title: { display: true, text: "주간 총 지원량 (개)", color: "#94a3b8", font: { size: 10 } }, grace: "18%"
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
              <div class="text-[10px] text-slate-500">트로피</div>
              <div class="text-xs font-bold text-amber-400 font-mono mt-0.5">🏆 ${(c.score / 1000).toFixed(1)}k</div>
            </div>
            <div class="text-right min-w-[76px]">
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
    if (this.elements.sortSelect) this.elements.sortSelect.value = `${this.sorting.key}-${this.sorting.order}`;
    this.applyFilterAndRender();
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
        const lastSeen = window.crApi.parseApiDate(m.lastSeen);
        if (!lastSeen) return false;
        return (now - lastSeen.getTime()) / (1000 * 60 * 60 * 24) >= 3;
      });
    } else if (this.activeFilter === "low-donations") {
      list = list.filter((m) => (m.donations || 0) < 50);
    }

    const { key, order } = this.sorting;
    list.sort((a, b) => {
      let valA = a[key];
      let valB = b[key];

      if (key === "lastSeen") {
        const dateA = window.crApi.parseApiDate(a.lastSeen)?.getTime() || 0;
        const dateB = window.crApi.parseApiDate(b.lastSeen)?.getTime() || 0;
        return order === "desc" ? dateB - dateA : dateA - dateB;
      }

      valA = valA || 0;
      valB = valB || 0;
      return order === "desc" ? valB - valA : valA - valB;
    });

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

    if (this.filteredMembers.length === 0) {
      tbody.innerHTML = "";
      if (emptyState) emptyState.classList.remove("hidden");
      return;
    }

    if (emptyState) emptyState.classList.add("hidden");

    const now = Date.now();
    let rowsHtml = "";

    this.filteredMembers.forEach((member, idx) => {
      const lastSeenDate = window.crApi.parseApiDate(member.lastSeen);
      let daysAgo = 0;
      if (lastSeenDate) daysAgo = (now - lastSeenDate.getTime()) / (1000 * 60 * 60 * 24);

      let dotColor = "green";
      let seenTextColor = "text-slate-300";
      if (daysAgo >= 3) {
        dotColor = "rose"; seenTextColor = "text-rose-400 font-semibold";
      } else if (daysAgo >= 1) {
        dotColor = "amber"; seenTextColor = "text-amber-300";
      }

      const relativeSeen = window.crApi.getRelativeTime(member.lastSeen);
      const exactSeen = lastSeenDate?.toLocaleString("ko-KR") || "기록 없음";
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
              <span class="status-dot ${dotColor}"></span>
              <span class="${seenTextColor} text-xs">${relativeSeen}</span>
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
      const lastSeenDate = window.crApi.parseApiDate(member.lastSeen);
      let daysAgo = 0;
      if (lastSeenDate) daysAgo = (now - lastSeenDate.getTime()) / (1000 * 60 * 60 * 24);

      let dotColor = "green";
      let seenTextColor = "text-slate-300";
      if (daysAgo >= 3) {
        dotColor = "rose"; seenTextColor = "text-rose-400 font-bold";
      } else if (daysAgo >= 1) {
        dotColor = "amber"; seenTextColor = "text-amber-300 font-medium";
      }

      const relativeSeen = window.crApi.getRelativeTime(member.lastSeen);
      const donations = member.donations || 0;
      const received = member.donationsReceived || 0;

      cardsHtml += `
        <div class="mobile-member-card">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="font-mono text-xs text-slate-500 w-4">${member.clanRank || idx + 1}</span>
              <span class="font-bold text-white text-[13px] truncate">${this.escapeHtml(member.name)}</span>
              ${this.getRoleBadge(member.role)}
            </div>
            <span class="text-xs font-semibold text-amber-400 shrink-0">🏆 ${(member.trophies || 0).toLocaleString()}</span>
          </div>
          <div class="grid grid-cols-2 gap-2 pt-2 mt-2 border-t border-white/[0.03]">
            <div class="text-left">
              <div class="text-[10px] text-slate-500">마지막 접속</div>
              <div class="inline-flex items-center gap-1 mt-0.5">
                <span class="status-dot ${dotColor}"></span>
                <span class="text-xs ${seenTextColor}">${relativeSeen}</span>
              </div>
            </div>
            <div class="text-right">
              <div class="text-[10px] text-slate-500">주간 지원량</div>
              <div class="text-xs font-bold ${donations >= 300 ? 'text-amber-400' : donations === 0 ? 'text-rose-400' : 'text-slate-100'} mt-0.5">
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