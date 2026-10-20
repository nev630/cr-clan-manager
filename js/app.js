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

    // 접속 즉시 홈 클랜 및 타 갤클 비교 데이터를 병렬 사전 동기화 (초기 로딩바 완료 시 두 탭 모두 100% 준비 완료)
    this.initialFullSync();

    // 5분 주기 자동 최신 동기화 타이머 (홈 클랜 + 타 갤클 동시 갱신)
    setInterval(() => this.autoSyncAll(false), 1000 * 60 * 5);
  }

  // 초기 동기화 프로그레스 바 수치 갱신 헬퍼
  updateInitialProgress(percent, msg) {
    const bar = document.getElementById("initial-sync-progress-bar");
    const percentEl = document.getElementById("initial-sync-percent");
    const msgEl = document.getElementById("initial-sync-status-msg");
    const clamped = Math.min(100, Math.max(0, percent));
    if (bar) bar.style.width = `${clamped}%`;
    if (percentEl) percentEl.textContent = `${clamped}%`;
    if (msgEl && msg) msgEl.textContent = msg;
  }

  // 초기 동기화 완료 오버레이 팝업 (100% 도달 후 부드럽게 닫기)
  hideInitialSyncModal() {
    const modal = document.getElementById("initial-sync-modal");
    if (!modal || modal.dataset.dismissed) return;
    modal.dataset.dismissed = "true";

    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }

    // 완전히 100%로 채우고 완료 메시지 표시
    this.updateInitialProgress(100, "동기화 완료!");

    // 100% 도달 확인을 위해 300ms 대기 후 부드럽게 페이드아웃
    setTimeout(() => {
      modal.style.opacity = "0";
      modal.style.pointerEvents = "none";
      setTimeout(() => {
        modal.classList.add("hidden");
      }, 400);
    }, 300);
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
          <span>갤러리 클랜 3자 비교 뷰</span>
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

  // 첫 접속 시 홈 클랜과 타 갤클 데이터를 병렬로 모두 100% 동기화한 뒤 모달 닫기
  async initialFullSync() {
    try {
      await Promise.allSettled([
        this.autoSyncLive(false),
        this.syncCompareLive(false)
      ]);
    } catch (e) {
      console.warn("초기 전체 동기화 중 오류:", e);
    } finally {
      this.hideInitialSyncModal();
    }
  }

  // 5분 주기 전체 동기화 (홈 클랜 + 타 갤클 동시 최신화)
  async autoSyncAll(isManual = false) {
    await Promise.allSettled([
      this.autoSyncLive(isManual),
      this.syncCompareLive(isManual)
    ]);
  }

  // 무조건 실시간 최신 정보 동기화 (홈 클랜)
  async autoSyncLive(isManual = false) {
    const dot = document.getElementById("sync-dot");
    const statusText = document.getElementById("sync-status-text");
    const spinIcon = document.getElementById("sync-spin-icon");

    if (dot) dot.className = "status-dot amber live-pulse";
    if (statusText) statusText.textContent = "동기화 중";
    // spin animation disabled per user request

    const tag = window.crApi?.settings?.clanTag || "#G890J9JC";

    try {
      // 0.3초 만에 기본 데이터 수신 시 선반영
      const liveData = await window.crApi.fetchClanFullData(tag, (partialData) => {
        this.renderClan(partialData);
        this.lastSyncTime = new Date();
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
      if (!this.currentData && window.DEMO_CLAN_DATA) {
        this.renderClan(window.DEMO_CLAN_DATA);
      }
      if (dot) dot.className = "status-dot green";
      if (statusText) statusText.textContent = "안정";
    } finally {
      if (spinIcon) spinIcon.classList.remove("animate-spin");
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
      if (this.charts.activity) {
        const chart = this.charts.activity;
        chart.data.datasets[0].data = [seenToday, seen1to2d, seenDormant];
        chart.update();
        return;
      }

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
    // spin animation disabled per user request

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

  // 타 갤클 비교 뷰 전체 렌더링 (차트 + 일원화 리스트)
  renderComparisonView() {
    // 실시간 데이터가 아직 도착하지 않은 극초반에는 데모 숫자를 노출하지 않고 로딩 인디케이터 표시
    if (!this.hasCompareLoaded && (!this.compareClansData || this.compareClansData.length === 0)) {
      const listContainer = document.getElementById("compare-summary-list");
      if (listContainer) {
        listContainer.innerHTML = `
          <div class="p-8 text-center text-slate-400 font-medium text-xs animate-pulse">
            실시간 갤러리 클랜 데이터 동기화 중...
          </div>
        `;
      }
      return;
    }

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
      const score = typeof c.clanScore === "number" ? c.clanScore : 0;

      return {
        ...c,
        isHome,
        membersCount,
        donationsWeekly,
        score
      };
    });

    // 지원량 기준 순위 매기기
    const sortedByDonations = [...enriched].sort((a, b) => b.donationsWeekly - a.donationsWeekly);
    sortedByDonations.forEach((c, idx) => {
      c.donationRank = idx + 1;
    });

    // 1. Chart.js 주간 총 지원량 단독 바 차트 렌더링
    this.renderCompareCharts(sortedByDonations);

    // 2. 클랜별 핵심 현황 및 지원량 격차 일원화 리스트 렌더링 (중복 완전 제거)
    this.renderCompareSummaryList(sortedByDonations);

    if (window.lucide) window.lucide.createIcons();
  }

  // B. Chart.js 주간 지원량 비교 차트 렌더링 (순수 막대 + 상단 지원량 수치)
  renderCompareCharts(clans) {
    if (!window.Chart) return;

    const labels = clans.map((c) => c.name);
    const donationData = clans.map((c) => c.donationsWeekly);

    const backgroundColors = clans.map((c) =>
      c.isHome ? "rgba(99, 102, 241, 0.85)" : c.name.includes("Vandros") ? "rgba(16, 185, 129, 0.85)" : "rgba(244, 63, 94, 0.85)"
    );
    const borderColors = clans.map((c) =>
      c.isHome ? "#6366f1" : c.name.includes("Vandros") ? "#10b981" : "#f43f5e"
    );

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

    const donationCanvas = document.getElementById("chart-compare-donations");
    if (donationCanvas) {
      // 이미 차트가 생성되어 있다면 차트를 파괴하지 않고 데이터만 부드럽게 갱신 (밑에서 다시 솟구쳐 오르는 재애니메이션 방지)
      if (this.charts.compareDonations) {
        const chart = this.charts.compareDonations;
        const currentData = chart.data.datasets[0]?.data || [];

        const isDataChanged = currentData.length !== donationData.length ||
          currentData.some((val, idx) => val !== donationData[idx]);

        chart.data.labels = labels;
        chart.data.datasets[0].data = donationData;
        chart.data.datasets[0].backgroundColor = backgroundColors;
        chart.data.datasets[0].borderColor = borderColors;

        if (isDataChanged) {
          // 수치가 달라졌을 때만 제자리에서 부드럽게 막대 높이 조정 (바닥에서 다시 치솟는 현상 100% 방지)
          chart.update();
        }
        return;
      }

      // 최초 1회 진입 시에만 차트 신규 생성 및 초기 등장 애니메이션 1회 실행
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
          animations: {
            x: false,
            y: {
              from: (ctx) => {
                if (ctx.type === "data" && ctx.chart?.scales?.y) {
                  return ctx.chart.scales.y.getPixelForValue(0);
                }
              },
              duration: 800,
              easing: "easeOutQuart"
            }
          },
          layout: {
            padding: { top: 24 }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { color: "#94a3b8", font: { size: 10 } },
              grid: { color: "rgba(255,255,255,0.05)" },
              title: { display: false },
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

  // C. 클랜별 핵심 현황 및 지원량 격차 리스트 렌더링 (중복 없는 단일 통합 뷰)
  renderCompareSummaryList(clans) {
    const container = document.getElementById("compare-summary-list");
    if (!container) return;

    const homeClan = clans.find((c) => c.isHome) || clans[0];
    const homeDonations = homeClan?.donationsWeekly || 0;

    let html = "";
    clans.forEach((c, idx) => {
      const isHome = c.isHome;
      const diffDonations = c.donationsWeekly - homeDonations;
      const vacant = Math.max(0, 50 - c.membersCount);

      // 격차 배지 (순수 숫자만 표기)
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

      // 순위 배지 / 이모지
      const rankEmoji = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}`;

      html += `
        <div class="p-3.5 sm:p-4 flex items-center justify-between gap-3 hover:bg-white/[0.02] transition ${isHome ? 'bg-indigo-950/20' : ''}">
          <!-- 좌측: 순위, 클랜명, 태그 -->
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

          <!-- 우측: 인원수, 트로피, 지원량 & 격차 -->
          <div class="flex items-center gap-3 sm:gap-6 shrink-0">
            <!-- 인원수 (숫자만 깔끔하게 표출) -->
            <div class="text-right">
              <div class="text-[10px] text-slate-500">인원수</div>
              <div class="text-xs sm:text-sm font-bold text-slate-200 font-mono mt-0.5">
                ${c.membersCount}<span class="text-slate-500 font-normal">/50</span>
              </div>
            </div>

            <!-- 트로피 -->
            <div class="text-right hidden sm:block">
              <div class="text-[10px] text-slate-500">트로피</div>
              <div class="text-xs font-bold text-amber-400 font-mono mt-0.5">🏆 ${(c.score / 1000).toFixed(1)}k</div>
            </div>

            <!-- 주간 지원량 & 격차 -->
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
