/**
 * Good Fellas Clan Manager - Core Application Logic
 * Mobile Optimized, Visual Charts & Gallery Clan Comparison
 */

class ClanManagerApp {
  constructor() {
    this.currentData = null;
    this.filteredMembers = [];
    this.activeFilter = "all"; // 'all' | 'dormant' | 'low-donations'
    this.searchQuery = "";
    this.sorting = {
      key: "donations",
      order: "desc"
    };

    // 메인 네비게이션 탭 상태 ('dashboard' | 'compare')
    this.activeMainTab = "dashboard";

    // 타 갤클 비교 대상 태그 목록 (기본 3대 갤클)
    this.compareTags = ["#G890J9JC", "#JYQRP2C2", "#Q0U22YGQ"];
    this.compareClansData = [];
    this.hasCompareLoaded = false;

    // Chart.js 인스턴스
    this.charts = {
      activity: null,
      compareDonations: null
    };

    this.lastSyncTime = null;
    this.lastCompareSyncTime = null;
    this.init();
  }

  init() {
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

    // 접속 즉시 무조건 실시간 최신 정보 동기화 실행
    this.autoSyncLive(false);

    // 1분 주기 자동 최신 동기화 타이머
    setInterval(() => this.autoSyncLive(false), 1000 * 60);
  }

  // 초기 동기화 완료 오버레이 팝업 닫기
  hideInitialSyncModal() {
    const modal = document.getElementById("initial-sync-modal");
    if (!modal || modal.dataset.dismissed) return;
    modal.dataset.dismissed = "true";
    modal.style.opacity = "0";
    modal.style.pointerEvents = "none";
    setTimeout(() => {
      modal.classList.add("hidden");
    }, 350);
  }

  bindEvents() {
    // 1. 실시간 검색 인풋
    const searchInput = document.getElementById("search-input");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        this.searchQuery = e.target.value.trim().toLowerCase();
        this.applyFilterAndRender();
      });
    }

    // 2. 정렬 드롭다운
    const sortSelect = document.getElementById("sort-select");
    if (sortSelect) {
      sortSelect.addEventListener("change", (e) => {
        const [key, order] = e.target.value.split("-");
        this.sorting.key = key;
        this.sorting.order = order || "desc";
        this.applyFilterAndRender();
      });
    }

    // 3. 수동 동기화 보조 버튼
    const manualBtn = document.getElementById("btn-manual-sync");
    if (manualBtn) {
      manualBtn.addEventListener("click", () => this.autoSyncLive(true));
    }

    // 4. 비교 탭 새로고침 버튼
    const refreshCompareBtn = document.getElementById("btn-refresh-compare");
    if (refreshCompareBtn) {
      refreshCompareBtn.addEventListener("click", () => this.syncCompareLive(true));
    }

    // 5. 커스텀 갤클 추가 버튼 및 엔터키 바인딩
    const addClanBtn = document.getElementById("btn-add-compare-clan");
    const addClanInput = document.getElementById("input-custom-clan-tag");
    if (addClanBtn && addClanInput) {
      addClanBtn.addEventListener("click", () => this.handleCustomClanAdd());
      addClanInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") this.handleCustomClanAdd();
      });
    }
  }

  // 메인 탭 전환: 'dashboard' (내 클랜) <-> 'compare' (타 갤클과 비교)
  switchMainTab(tabName) {
    this.activeMainTab = tabName;

    const viewDashboard = document.getElementById("view-dashboard");
    const viewCompare = document.getElementById("view-compare");
    const tabBtnDashboard = document.getElementById("tab-btn-dashboard");
    const tabBtnCompare = document.getElementById("tab-btn-compare");
    const tabHint = document.getElementById("tab-context-hint");
    const quickCompareBtn = document.getElementById("btn-quick-compare");

    if (tabName === "compare") {
      if (viewDashboard) viewDashboard.classList.add("hidden");
      if (viewCompare) viewCompare.classList.remove("hidden");

      if (tabBtnDashboard) tabBtnDashboard.classList.remove("active");
      if (tabBtnCompare) tabBtnCompare.classList.add("active");

      if (quickCompareBtn) {
        quickCompareBtn.classList.add("opacity-50", "pointer-events-none");
      }

      if (tabHint) {
        tabHint.innerHTML = `
          <span class="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
          <span>디시 갤러리 클랜 3자 비교 뷰</span>
        `;
      }

      // 비교 뷰 렌더링
      this.renderComparisonView();

      // 아직 실시간 데이터를 가져오지 않았다면 백그라운드 동기화 수행
      if (!this.hasCompareLoaded) {
        this.syncCompareLive(false);
      }
    } else {
      if (viewCompare) viewCompare.classList.add("hidden");
      if (viewDashboard) viewDashboard.classList.remove("hidden");

      if (tabBtnCompare) tabBtnCompare.classList.remove("active");
      if (tabBtnDashboard) tabBtnDashboard.classList.add("active");

      if (quickCompareBtn) {
        quickCompareBtn.classList.remove("opacity-50", "pointer-events-none");
      }

      if (tabHint) {
        tabHint.innerHTML = `
          <span class="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          <span>Good Fellas 단독 뷰</span>
        `;
      }
    }

    if (window.lucide) window.lucide.createIcons();
    if (typeof window.scrollTo === "function") { window.scrollTo({ top: 0, behavior: "smooth" }); }
  }

  // 무조건 실시간 최신 정보 동기화 (홈 클랜)
  async autoSyncLive(isManual = false) {
    const dot = document.getElementById("sync-dot");
    const statusText = document.getElementById("sync-status-text");
    const spinIcon = document.getElementById("sync-spin-icon");

    if (dot) dot.className = "status-dot amber live-pulse";
    if (statusText) statusText.textContent = "동기화 중";
    if (spinIcon) spinIcon.classList.add("animate-spin");

    const tag = window.crApi?.settings?.clanTag || "#G890J9JC";

    try {
      // 0.3초 만에 기본 데이터 수신 시 선반영
      const liveData = await window.crApi.fetchClanFullData(tag, (partialData) => {
        this.renderClan(partialData);
        this.lastSyncTime = new Date();
        this.hideInitialSyncModal();
        if (dot) dot.className = "status-dot green live-pulse";
        if (statusText) statusText.textContent = "실시간";
      });

      if (liveData && liveData.memberList) {
        this.renderClan(liveData);
        this.lastSyncTime = new Date();

        if (dot) dot.className = "status-dot green live-pulse";
        if (statusText) statusText.textContent = "실시간";
      }
    } catch (err) {
      console.warn("실시간 최신 동기화 알림 (프리셋 폴백 적용):", err.message);
      // 오프라인이거나 API 오류 시 프리셋 데모 데이터로 즉시 폴백하여 공백 방지
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

  // 클랜 데이터 렌더링 (대시보드 뷰)
  renderClan(clanData) {
    this.currentData = clanData;

    // 헤더 정보
    const nameEl = document.getElementById("clan-name");
    const tagEl = document.getElementById("clan-tag");
    const descEl = document.getElementById("clan-desc");

    if (nameEl) nameEl.textContent = clanData.name || "Good Fellas";
    if (tagEl) tagEl.textContent = clanData.tag || "#G890J9JC";
    if (descEl && clanData.description) {
      descEl.textContent = clanData.description;
    }

    // 비교 데이터셋의 Good Fellas 최신화 동기화
    const gfInCompare = (this.compareClansData || []).find(
      (c) => (c.tag || "").toUpperCase() === "#G890J9JC"
    );
    if (gfInCompare) {
      gfInCompare.name = clanData.name || gfInCompare.name;
      gfInCompare.members = clanData.memberList ? clanData.memberList.length : (clanData.members || 47);
      if (typeof clanData.donationsPerWeek === "number") {
        gfInCompare.donationsPerWeek = clanData.donationsPerWeek;
      }
      if (clanData.clanScore) gfInCompare.clanScore = clanData.clanScore;
      if (clanData.clanWarTrophies) gfInCompare.clanWarTrophies = clanData.clanWarTrophies;
      if (clanData.description) gfInCompare.description = clanData.description;

      if (this.activeMainTab === "compare") {
        this.renderComparisonView();
      }
    }

    // 핵심 3대 지표 업데이트
    this.updateStats(clanData);

    // 시각화 차트 렌더링
    this.renderCharts(clanData.memberList || []);

    // 필터 및 목록 렌더링
    this.applyFilterAndRender();
  }

  // 상단 3대 지표 업데이트
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

    // 슈퍼셀 공식 주간 총 지원량 (donationsPerWeek)
    const officialWeeklyDonations = (clanData && typeof clanData.donationsPerWeek === "number")
      ? clanData.donationsPerWeek
      : members.reduce((sum, m) => sum + (m.donations || 0), 0);

    const avgDonations = Math.round(officialWeeklyDonations / (totalMembers || 1));

    const statMembers = document.getElementById("stat-total-members");
    const statVacant = document.getElementById("stat-member-vacant");
    const statDonations = document.getElementById("stat-total-donations");
    const statAvg = document.getElementById("stat-avg-donations");
    const statDormant = document.getElementById("stat-dormant-count");

    if (statMembers) statMembers.textContent = `${totalMembers} / 50`;
    if (statVacant) statVacant.textContent = `여유 자리: ${50 - totalMembers}석`;
    if (statDonations) statDonations.textContent = officialWeeklyDonations.toLocaleString();
    if (statAvg) statAvg.textContent = `1인 평균 ${avgDonations.toLocaleString()}개`;
    if (statDormant) statDormant.textContent = `${dormantCount}명`;

    // 필터 칩 숫자
    const chipAll = document.getElementById("chip-count-all");
    if (chipAll) chipAll.textContent = totalMembers;
    const chipDormant = document.getElementById("chip-count-dormant");
    if (chipDormant) chipDormant.textContent = dormantCount;
    const chipLow = document.getElementById("chip-count-low");
    if (chipLow) chipLow.textContent = lowDonationCount;
  }

  // 시각화 렌더링 (대시보드)
  renderCharts(members) {
    if (members.length === 0) return;
    this.renderPodium(members);
    this.renderActivityDonut(members);
  }

  // 올림픽 시상대 단상 (Podium) 렌더링
  renderPodium(members) {
    const podiumContainer = document.getElementById("podium-container");
    const runnersContainer = document.getElementById("podium-runners-container");
    if (!podiumContainer) return;

    const sorted = [...members]
      .sort((a, b) => (b.donations || 0) - (a.donations || 0))
      .slice(0, 7);

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

      <!-- 1등 금메달 (중앙 / 최고 높이) -->
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

  // 접속 분포 도넛 차트
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

    const activityCanvas = document.getElementById("chart-activity");
    if (activityCanvas) {
      if (this.charts.activity) this.charts.activity.destroy();

      const ctx = activityCanvas.getContext("2d");
      this.charts.activity = new Chart(ctx, {
        type: "doughnut",
        data: {
          labels: ["오늘 접속", "1~2일 전", "3일+ 미접속"],
          datasets: [{
            data: [seenToday, seen1to2d, seenDormant],
            backgroundColor: [
              "rgba(16, 185, 129, 0.8)",
              "rgba(59, 130, 246, 0.8)",
              "rgba(244, 63, 94, 0.85)"
            ],
            borderColor: "#0f121a",
            borderWidth: 2,
            hoverOffset: 3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: "bottom",
              labels: {
                color: "#94a3b8",
                boxWidth: 8,
                padding: 10,
                font: { size: 10 }
              }
            },
            tooltip: {
              backgroundColor: "#171b26",
              titleColor: "#f8fafc",
              bodyColor: "#94a3b8",
              borderColor: "rgba(255,255,255,0.1)",
              borderWidth: 1,
              padding: 8,
              displayColors: true,
              callbacks: {
                label: (c) => ` ${c.label}: ${c.raw}명`
              }
            }
          },
          cutout: "68%"
        }
      });
    }
  }

  // ==========================================
  // [NEW] 타 갤클 비교 전용 메서드
  // ==========================================

  // 타 갤클 실시간 정보 병렬 동기화
  async syncCompareLive(isManual = false) {
    const icon = document.getElementById("compare-refresh-icon");
    if (icon) icon.classList.add("animate-spin");

    try {
      if (window.crApi && typeof window.crApi.fetchMultipleClans === "function") {
        const liveClans = await window.crApi.fetchMultipleClans(this.compareTags);
        if (Array.isArray(liveClans) && liveClans.length > 0) {
          this.compareClansData = liveClans;
          this.hasCompareLoaded = true;
          this.lastCompareSyncTime = new Date();
        }
      }
    } catch (e) {
      console.warn("갤클 비교 실시간 조회 오류 (프리셋 유지):", e.message);
    } finally {
      if (icon) icon.classList.remove("animate-spin");
      this.renderComparisonView();
    }
  }

  // 커스텀 갤클 태그 추가 핸들러
  handleCustomClanAdd() {
    const input = document.getElementById("input-custom-clan-tag");
    if (!input) return;
    const rawVal = input.value.trim();
    if (!rawVal) return;

    const normalized = window.crApi ? window.crApi.normalizeTag(rawVal) : (rawVal.startsWith("#") ? rawVal : "#" + rawVal);
    if (!this.compareTags.includes(normalized)) {
      this.compareTags.push(normalized);
      input.value = "";
      this.syncCompareLive(true);
    } else {
      alert("이미 비교 목록에 등록된 클랜 태그입니다.");
    }
  }

  // 타 갤클 비교 뷰 전체 렌더링
  renderComparisonView() {
    let clans = this.compareClansData;
    if (!Array.isArray(clans) || clans.length === 0) {
      clans = window.crApi?.getGalleryClansPreset() || [];
      this.compareClansData = clans;
    }

    // Good Fellas와 타 클랜들의 지표 정규화 및 순위 계산
    const enriched = clans.map((c) => {
      const isHome = (c.tag || "").toUpperCase() === "#G890J9JC" || c.isHome === true;
      const membersCount = typeof c.members === "number" ? c.members : (c.memberList?.length || 0);
      const donationsWeekly = typeof c.donationsPerWeek === "number" ? c.donationsPerWeek : 0;
      const avgDonation = Math.round(donationsWeekly / (membersCount || 1));
      const score = typeof c.clanScore === "number" ? c.clanScore : 0;
      const warTrophies = typeof c.clanWarTrophies === "number" ? c.clanWarTrophies : 0;
      const reqTrophies = typeof c.requiredTrophies === "number" ? c.requiredTrophies : 0;

      return {
        ...c,
        isHome,
        membersCount,
        donationsWeekly,
        avgDonation,
        score,
        warTrophies,
        reqTrophies
      };
    });

    // 지원량 기준 순위 매기기
    const sortedByDonations = [...enriched].sort((a, b) => b.donationsWeekly - a.donationsWeekly);
    enriched.forEach((c) => {
      c.donationRank = sortedByDonations.findIndex((x) => x.tag === c.tag) + 1;
    });

    // 1. 핵심 3대 비교 카드 렌더링
    this.renderCompareCards(enriched);

    // 2. Chart.js 시각화 비교 차트 렌더링 (인원수 + 지원량)
    this.renderCompareCharts(enriched);

    // 3. 종합 비교 매트릭스 표 렌더링
    this.renderCompareMatrix(enriched);

    if (window.lucide) window.lucide.createIcons();
  }

  // A. 3대 갤클 요약 비교 카드 그리드 렌더링
  renderCompareCards(clans) {
    const container = document.getElementById("compare-cards-container");
    if (!container) return;

    const cardsHtml = clans.map((c) => {
      const isHome = c.isHome;
      const vacant = Math.max(0, 50 - c.membersCount);
      const memberPercent = Math.min(100, Math.round((c.membersCount / 50) * 100));

      // 지원량 랭킹 뱃지
      let rankBadge = "";
      if (c.donationRank === 1) {
        rankBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold rank-badge-gold">🥇 주간 지원 1위</span>`;
      } else if (c.donationRank === 2) {
        rankBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold rank-badge-silver">🥈 주간 지원 2위</span>`;
      } else if (c.donationRank === 3) {
        rankBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold rank-badge-bronze">🥉 주간 지원 3위</span>`;
      }

      const cardBorderClass = isHome ? "clan-compare-card home-clan" : "clan-compare-card";
      const homeTag = isHome
        ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">내 클랜</span>`
        : `<span class="px-2 py-0.5 rounded text-[10px] font-medium bg-white/[0.04] text-slate-400 border border-white/[0.06]">갤러리 클랜</span>`;

      return `
        <div class="${cardBorderClass} p-4 flex flex-col justify-between">
          <div>
            <!-- 상단 헤더: 클랜명, 태그, 상태 뱃지 -->
            <div class="flex items-start justify-between gap-2 pb-3 border-b border-white/[0.04]">
              <div>
                <div class="flex items-center gap-1.5">
                  <h4 class="text-base sm:text-lg font-bold text-white tracking-tight">${this.escapeHtml(c.name)}</h4>
                  ${homeTag}
                </div>
                <div class="text-[11px] font-mono text-slate-400 mt-0.5">${this.escapeHtml(c.tag)}</div>
              </div>
              <div class="shrink-0 text-right">
                ${rankBadge}
              </div>
            </div>

            <!-- 클랜 소개 문구 -->
            <p class="text-[11px] text-slate-400 italic mt-2.5 line-clamp-1 bg-white/[0.02] px-2 py-1 rounded border border-white/[0.03]">
              "${this.escapeHtml(c.description || "소개글 없음")}"
            </p>

            <!-- 핵심 지표 1: 인원수 (한눈에 보는 게이지 바) -->
            <div class="mt-4 pt-2">
              <div class="flex items-baseline justify-between mb-1">
                <span class="text-xs font-medium text-slate-300">클랜 인원수</span>
                <div class="text-right">
                  <span class="text-lg font-bold text-white font-mono">${c.membersCount}</span>
                  <span class="text-xs text-slate-500 font-mono">/ 50</span>
                  <span class="text-[10px] font-medium ml-1.5 ${vacant === 0 ? 'text-amber-400' : 'text-emerald-400'}">
                    ${vacant === 0 ? '만석' : `${vacant}석 여유`}
                  </span>
                </div>
              </div>
              <div class="w-full bg-white/[0.06] rounded-full h-2 overflow-hidden">
                <div class="${isHome ? 'bg-indigo-500' : c.membersCount === 50 ? 'bg-emerald-500' : 'bg-blue-500'} h-full rounded-full transition-all duration-500" style="width: ${memberPercent}%"></div>
              </div>
            </div>

            <!-- 핵심 지표 2: 주간 지원량 (볼드 하이라이트) -->
            <div class="mt-3.5 p-3 rounded-xl bg-white/[0.025] border border-white/[0.04]">
              <div class="text-[10px] font-medium text-slate-400 uppercase tracking-wider">주간 총 지원량</div>
              <div class="flex items-baseline justify-between mt-0.5">
                <div class="text-xl sm:text-2xl font-black text-amber-400">
                  ${c.donationsWeekly.toLocaleString()}<span class="text-xs font-normal text-slate-400 ml-1">개</span>
                </div>
                <div class="text-right">
                  <div class="text-[10px] text-slate-500">1인 평균</div>
                  <div class="text-xs font-bold text-slate-200">${c.avgDonation.toLocaleString()}개</div>
                </div>
              </div>
            </div>
          </div>

          <!-- 하단 보조 지표: 트로피, 클랜전, 가입조건 -->
          <div class="grid grid-cols-3 gap-2 pt-3 mt-3.5 border-t border-white/[0.04] text-[11px]">
            <div>
              <div class="text-[10px] text-slate-500">클랜 트로피</div>
              <div class="font-bold text-amber-400/90 font-mono mt-0.5">🏆 ${c.score.toLocaleString()}</div>
            </div>
            <div>
              <div class="text-[10px] text-slate-500">클랜전 점수</div>
              <div class="font-bold text-purple-400 font-mono mt-0.5">⚔️ ${c.warTrophies.toLocaleString()}</div>
            </div>
            <div>
              <div class="text-[10px] text-slate-500">가입 필요</div>
              <div class="font-bold text-slate-300 font-mono mt-0.5">${c.reqTrophies > 0 ? `${c.reqTrophies.toLocaleString()}+` : '자유'}</div>
            </div>
          </div>
        </div>
      `;
    }).join("");

    container.innerHTML = cardsHtml;
  }

  // B. Chart.js 주간 지원량 비교 차트 렌더링 (순수 막대 + 상단 지원량 수치)
  renderCompareCharts(clans) {
    if (!window.Chart) return;

    const labels = clans.map((c) => c.name);
    const donationData = clans.map((c) => c.donationsWeekly);

    // 차트 컬러 팔레트 (Good Fellas: Indigo, Vandros: Emerald, 딜넣는 도둑: Rose)
    const backgroundColors = clans.map((c) =>
      c.isHome ? "rgba(99, 102, 241, 0.85)" : c.name.includes("Vandros") ? "rgba(16, 185, 129, 0.85)" : "rgba(244, 63, 94, 0.85)"
    );
    const borderColors = clans.map((c) =>
      c.isHome ? "#6366f1" : c.name.includes("Vandros") ? "#10b981" : "#f43f5e"
    );

    // 주간 총 지원량(막대) 상단에만 수치 표출
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

    // 주간 총 지원량 단독 바 차트
    const donationCanvas = document.getElementById("chart-compare-donations");
    if (donationCanvas) {
      if (this.charts.compareDonations) this.charts.compareDonations.destroy();
      const ctx = donationCanvas.getContext("2d");
      this.charts.compareDonations = new Chart(ctx, {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              label: "주간 총 지원량",
              data: donationData,
              backgroundColor: backgroundColors,
              borderColor: borderColors,
              borderWidth: 1.5,
              borderRadius: 6
            }
          ]
        },
        plugins: [barDataLabelsPlugin],
        options: {
          responsive: true,
          maintainAspectRatio: false,
          layout: {
            padding: { top: 24 }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { color: "#94a3b8", font: { size: 10 } },
              grid: { color: "rgba(255,255,255,0.05)" },
              title: { display: true, text: "주간 총 지원량 (개)", color: "#94a3b8", font: { size: 10 } },
              grace: "18%"
            },
            x: {
              ticks: { color: "#f8fafc", font: { size: 11, weight: "bold" } },
              grid: { display: false }
            }
          },
          plugins: {
            barDataLabels: { suffix: "개" },
            legend: { display: false },
            tooltip: {
              backgroundColor: "#171b26",
              titleColor: "#f8fafc",
              bodyColor: "#94a3b8",
              borderColor: "rgba(255,255,255,0.1)",
              borderWidth: 1,
              callbacks: {
                label: (ctx) => ` 주간 총 지원량: ${ctx.raw.toLocaleString()}개`
              }
            }
          }
        }
      });
    }
  }

    // C. 종합 비교 매트릭스 표 렌더링 (Good Fellas 대비 격차 계산 포함)
  renderCompareMatrix(clans) {
    const tbody = document.getElementById("compare-table-body");
    const mobileContainer = document.getElementById("compare-mobile-cards");

    const homeClan = clans.find((c) => c.isHome) || clans[0];
    const homeDonations = homeClan?.donationsWeekly || 1;
    const homeMembers = homeClan?.membersCount || 1;

    // 지원량 순으로 정렬하여 표에 렌더링
    const sorted = [...clans].sort((a, b) => b.donationsWeekly - a.donationsWeekly);

    // 1. PC 테이블 뷰
    if (tbody) {
      let rowsHtml = "";
      sorted.forEach((c, idx) => {
        const isHome = c.isHome;
        const diffDonations = c.donationsWeekly - homeDonations;
        const diffMembers = c.membersCount - homeMembers;

        let diffBadge = `<span class="text-slate-500 font-mono text-[11px]">기준</span>`;
        if (!isHome) {
          if (diffDonations > 0) {
            diffBadge = `<span class="text-emerald-400 font-bold font-mono text-[11px]">+${diffDonations.toLocaleString()}개</span>`;
          } else if (diffDonations < 0) {
            diffBadge = `<span class="text-rose-400 font-bold font-mono text-[11px]">${diffDonations.toLocaleString()}개</span>`;
          } else {
            diffBadge = `<span class="text-slate-400 font-mono text-[11px]">0개</span>`;
          }
        }

        let diffMemberText = "";
        if (!isHome) {
          if (diffMembers > 0) diffMemberText = `<span class="text-emerald-400 text-[10px] ml-1">(+${diffMembers})</span>`;
          else if (diffMembers < 0) diffMemberText = `<span class="text-rose-400 text-[10px] ml-1">(${diffMembers})</span>`;
        }

        rowsHtml += `
          <tr class="${isHome ? 'bg-indigo-950/20 font-medium' : ''}">
            <td class="text-center font-mono text-xs font-bold ${idx === 0 ? 'text-amber-400' : 'text-slate-400'}">
              ${idx + 1}
            </td>
            <td>
              <div class="flex items-center gap-1.5">
                <span class="font-bold text-white">${this.escapeHtml(c.name)}</span>
                ${isHome ? '<span class="px-1.5 py-0.2 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">내 클랜</span>' : ''}
              </div>
              <div class="text-[11px] font-mono text-slate-500 mt-0.5">${this.escapeHtml(c.tag)}</div>
            </td>
            <td class="text-center">
              <span class="font-bold text-white font-mono">${c.membersCount}</span><span class="text-slate-500 font-mono">/50</span>
              ${diffMemberText}
            </td>
            <td class="text-right">
              <div class="font-black text-amber-400 text-sm font-mono">${c.donationsWeekly.toLocaleString()}개</div>
              <div>${diffBadge}</div>
            </td>
            <td class="text-right font-bold text-slate-200 font-mono">
              ${c.avgDonation.toLocaleString()}개
            </td>
            <td class="text-right font-bold text-amber-400/90 font-mono">
              🏆 ${c.score.toLocaleString()}
            </td>
            <td class="text-right text-slate-300 font-mono text-xs">
              ${c.reqTrophies > 0 ? `${c.reqTrophies.toLocaleString()}+` : '제한 없음'}
            </td>
          </tr>
        `;
      });
      tbody.innerHTML = rowsHtml;
    }

    // 2. 모바일 전용 카드 뷰
    if (mobileContainer) {
      let mobileHtml = "";
      sorted.forEach((c, idx) => {
        const isHome = c.isHome;
        const diffDonations = c.donationsWeekly - homeDonations;

        let diffBadge = "";
        if (!isHome) {
          if (diffDonations > 0) {
            diffBadge = `<span class="text-emerald-400 text-[11px] font-bold font-mono">+${diffDonations.toLocaleString()}개</span>`;
          } else if (diffDonations < 0) {
            diffBadge = `<span class="text-rose-400 text-[11px] font-bold font-mono">${diffDonations.toLocaleString()}개</span>`;
          } else {
            diffBadge = `<span class="text-slate-400 text-[11px] font-bold font-mono">0개</span>`;
          }
        }

        mobileHtml += `
          <div class="p-3.5 ${isHome ? 'bg-indigo-950/20' : ''}">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-1.5">
                <span class="font-mono text-xs font-bold text-amber-400 w-4">${idx + 1}</span>
                <span class="font-bold text-white text-sm">${this.escapeHtml(c.name)}</span>
                ${isHome ? '<span class="px-1.5 py-0.2 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">내 클랜</span>' : ''}
              </div>
              <span class="font-black text-amber-400 text-sm">${c.donationsWeekly.toLocaleString()}개</span>
            </div>
            <div class="grid grid-cols-3 gap-2 pt-2 mt-2 border-t border-white/[0.03] text-[11px]">
              <div>
                <span class="text-slate-500">인원수:</span>
                <span class="font-bold text-white ml-0.5">${c.membersCount}/50</span>
              </div>
              <div>
                <span class="text-slate-500">1인 평균:</span>
                <span class="font-bold text-slate-200 ml-0.5">${c.avgDonation}개</span>
              </div>
              <div class="text-right">
                <span class="text-slate-500">트로피:</span>
                <span class="font-bold text-amber-400 ml-0.5">🏆${(c.score / 1000).toFixed(1)}k</span>
              </div>
            </div>
            ${diffBadge ? `<div class="mt-1 text-right">${diffBadge}</div>` : ''}
          </div>
        `;
      });
      mobileContainer.innerHTML = mobileHtml;
    }
  }

  // ==========================================
  // 기존 클랜원 목록 렌더링 및 필터링 로직
  // ==========================================

  // 필터 탭 클릭
  setFilterTab(filterType, element) {
    this.activeFilter = filterType;
    document.querySelectorAll(".filter-chip").forEach((btn) => btn.classList.remove("active"));
    if (element) element.classList.add("active");
    this.applyFilterAndRender();
  }

  // 상단 카드 클릭 시 퀵 필터
  setQuickFilter(filterType) {
    const targetBtn = document.querySelector(`.filter-chip[data-filter="${filterType}"]`);
    if (targetBtn) {
      this.setFilterTab(filterType, targetBtn);
    }
  }

  // 컬럼 헤더 클릭 시 정렬 토글
  toggleSort(key) {
    if (this.sorting.key === key) {
      this.sorting.order = this.sorting.order === "desc" ? "asc" : "desc";
    } else {
      this.sorting.key = key;
      this.sorting.order = "desc";
    }

    const sortSelect = document.getElementById("sort-select");
    if (sortSelect) {
      sortSelect.value = `${this.sorting.key}-${this.sorting.order}`;
    }

    this.applyFilterAndRender();
  }

  // 필터링 및 정렬 적용
  applyFilterAndRender() {
    if (!this.currentData || !this.currentData.memberList) return;

    let list = [...this.currentData.memberList];
    const now = Date.now();

    // 1. 검색어 필터
    if (this.searchQuery) {
      list = list.filter((m) =>
        (m.name && m.name.toLowerCase().includes(this.searchQuery)) ||
        (m.tag && m.tag.toLowerCase().includes(this.searchQuery))
      );
    }

    // 2. 탭 필터
    if (this.activeFilter === "dormant") {
      list = list.filter((m) => {
        const lastSeen = window.crApi.parseApiDate(m.lastSeen);
        if (!lastSeen) return false;
        return (now - lastSeen.getTime()) / (1000 * 60 * 60 * 24) >= 3;
      });
    } else if (this.activeFilter === "low-donations") {
      list = list.filter((m) => (m.donations || 0) < 50);
    }

    // 3. 정렬
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

    // 데스크톱 테이블 & 모바일 카드 동시 렌더링
    this.renderDesktopTable();
    this.renderMobileList();

    if (window.lucide) window.lucide.createIcons();
  }

  // 직책 배지
  getRoleBadge(role) {
    switch (role) {
      case "leader":
        return `<span class="badge-role badge-leader">대표</span>`;
      case "coLeader":
        return `<span class="badge-role badge-coleader">공동대표</span>`;
      case "elder":
        return `<span class="badge-role badge-elder">장로</span>`;
      default:
        return `<span class="badge-role badge-member">멤버</span>`;
    }
  }

  // A. 데스크톱 테이블 뷰
  renderDesktopTable() {
    const tbody = document.getElementById("member-table-body");
    const emptyState = document.getElementById("empty-state");
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
      if (lastSeenDate) {
        daysAgo = (now - lastSeenDate.getTime()) / (1000 * 60 * 60 * 24);
      }

      let dotColor = "green";
      let seenTextColor = "text-slate-300";
      if (daysAgo >= 3) {
        dotColor = "rose";
        seenTextColor = "text-rose-400 font-semibold";
      } else if (daysAgo >= 1) {
        dotColor = "amber";
        seenTextColor = "text-amber-300";
      }

      const relativeSeen = window.crApi.getRelativeTime(member.lastSeen);
      const exactSeen = lastSeenDate?.toLocaleString("ko-KR") || "기록 없음";

      const donations = member.donations || 0;
      const received = member.donationsReceived || 0;

      rowsHtml += `
        <tr>
          <td class="text-center font-mono text-xs text-slate-500">
            ${member.clanRank || idx + 1}
          </td>
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
            <div class="font-bold text-sm ${donations >= 300 ? "text-amber-400" : donations === 0 ? "text-rose-400" : "text-slate-100"}">
              ${donations.toLocaleString()}
            </div>
            <div class="text-[10px] text-slate-400 font-mono">
              받음: ${received.toLocaleString()}
            </div>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = rowsHtml;
  }

  // B. 모바일 전용 컴팩트 카드 리스트 뷰
  renderMobileList() {
    const container = document.getElementById("member-mobile-list");
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
      if (lastSeenDate) {
        daysAgo = (now - lastSeenDate.getTime()) / (1000 * 60 * 60 * 24);
      }

      let dotColor = "green";
      let seenTextColor = "text-slate-300";
      if (daysAgo >= 3) {
        dotColor = "rose";
        seenTextColor = "text-rose-400 font-bold";
      } else if (daysAgo >= 1) {
        dotColor = "amber";
        seenTextColor = "text-amber-300 font-medium";
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
            <span class="text-xs font-semibold text-amber-400 shrink-0">
              🏆 ${(member.trophies || 0).toLocaleString()}
            </span>
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

// 앱 실행
document.addEventListener("DOMContentLoaded", () => {
  window.app = new ClanManagerApp();
});
