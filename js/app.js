/**
 * Good Fellas Clan Manager - Core Application Logic
 * Mobile Optimized & Visual Charts
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

    // Chart.js 인스턴스
    this.charts = {
      donations: null,
      activity: null
    };

    this.lastSyncTime = null;
    this.init();
  }

  init() {
    this.bindEvents();

    // 구버전 캐시 무효화 (이전 캐시 강제 플러시)
    const cacheVerKey = "cr_manager_cache_ver";
    if (localStorage.getItem(cacheVerKey) !== "20261015_1145") {
      localStorage.removeItem("cr_manager_clan_cache_v1");
      localStorage.setItem(cacheVerKey, "20261015_1145");
    }

    if (window.lucide) window.lucide.createIcons();

    // 1. 초기 렌더링: 오버레이 뒤에 기본 골격 렌더링
    if (window.DEMO_CLAN_DATA) {
      this.renderClan(window.DEMO_CLAN_DATA);
    }

    // 2. 접속 즉시 백그라운드 실시간 자동 동기화
    this.autoSyncLive();

    // 3. 만약 네트워크 지연 시 최대 6초 후 강제 모달 닫기 (안전장치)
    setTimeout(() => this.hideInitialSyncModal(), 6500);

    // 4. 3분 주기 자동 동기화 타이머
    setInterval(() => this.autoSyncLive(), 1000 * 60 * 3);
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
    // 실시간 검색 인풋
    const searchInput = document.getElementById("search-input");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        this.searchQuery = e.target.value.trim().toLowerCase();
        this.applyFilterAndRender();
      });
    }

    // 정렬 드롭다운
    const sortSelect = document.getElementById("sort-select");
    if (sortSelect) {
      sortSelect.addEventListener("change", (e) => {
        const [key, order] = e.target.value.split("-");
        this.sorting.key = key;
        this.sorting.order = order || "desc";
        this.applyFilterAndRender();
      });
    }

    // 수동 동기화 보조 버튼
    const manualBtn = document.getElementById("btn-manual-sync");
    if (manualBtn) {
      manualBtn.addEventListener("click", () => this.autoSyncLive(true));
    }
  }

  // 백그라운드 실시간 자동 동기화
  async autoSyncLive(isManual = false) {
    const dot = document.getElementById("sync-dot");
    const statusText = document.getElementById("sync-status-text");
    const spinIcon = document.getElementById("sync-spin-icon");

    if (dot) dot.className = "status-dot amber live-pulse";
    if (statusText) statusText.textContent = "동기화 중";
    if (spinIcon) spinIcon.classList.add("animate-spin");

    const tag = window.crApi.settings.clanTag || "#G890J9JC";

    try {
      const liveData = await window.crApi.fetchClanFullData(tag);

      if (liveData && liveData.memberList) {
        this.renderClan(liveData);
        this.lastSyncTime = new Date();

        if (dot) dot.className = "status-dot green live-pulse";
        if (statusText) statusText.textContent = "실시간";
      }
    } catch (err) {
      console.warn("실시간 동기화 대기 중:", err.message);
      if (dot) dot.className = "status-dot gray";
      if (statusText) statusText.textContent = "캐시 사용";
    } finally {
      if (spinIcon) spinIcon.classList.remove("animate-spin");
      this.hideInitialSyncModal();
    }
  }

  // 클랜 데이터 렌더링
  renderClan(clanData) {
    this.currentData = clanData;

    // 헤더 정보
    document.getElementById("clan-name").textContent = clanData.name || "Good Fellas";
    document.getElementById("clan-tag").textContent = clanData.tag || "#G890J9JC";
    if (clanData.description) {
      document.getElementById("clan-desc").textContent = clanData.description;
    }

    // 핵심 3대 지표 업데이트
    this.updateStats(clanData.memberList || []);

    // 시각화 차트 렌더링
    this.renderCharts(clanData.memberList || []);

    // 필터 및 목록 렌더링
    this.applyFilterAndRender();
  }

  // 상단 3대 지표 업데이트
  updateStats(members) {
    const totalMembers = members.length;
    let totalDonations = 0;
    let dormantCount = 0;
    let lowDonationCount = 0;

    const now = Date.now();

    members.forEach((m) => {
      const don = m.donations || 0;
      totalDonations += don;
      if (don < 50) lowDonationCount++;

      const lastSeen = window.crApi.parseApiDate(m.lastSeen);
      if (lastSeen) {
        const daysAgo = (now - lastSeen.getTime()) / (1000 * 60 * 60 * 24);
        if (daysAgo >= 3) dormantCount++;
      }
    });

    const avgDonations = Math.round(totalDonations / (totalMembers || 1));

    document.getElementById("stat-total-members").textContent = `${totalMembers} / 50`;
    document.getElementById("stat-member-vacant").textContent = `여유 자리: ${50 - totalMembers}석`;

    document.getElementById("stat-total-donations").textContent = totalDonations.toLocaleString();
    document.getElementById("stat-avg-donations").textContent = `1인 평균 ${avgDonations}개`;

    document.getElementById("stat-dormant-count").textContent = `${dormantCount}명`;

    // 필터 칩 숫자
    const chipAll = document.getElementById("chip-count-all");
    if (chipAll) chipAll.textContent = totalMembers;
    const chipDormant = document.getElementById("chip-count-dormant");
    if (chipDormant) chipDormant.textContent = dormantCount;
    const chipLow = document.getElementById("chip-count-low");
    if (chipLow) chipLow.textContent = lowDonationCount;
  }

  // 시각화 렌더링 (올림픽 시상대 단상 & 접속 분포 도넛)
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

    // 2등(은), 1등(금), 3등(동) 배치
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

    // 4위 ~ 7위 러너 리스트
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
              "rgba(16, 185, 129, 0.8)",  // 에메랄드
              "rgba(59, 130, 246, 0.8)",  // 블루
              "rgba(244, 63, 94, 0.85)"   // 로즈
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

    // 2. 탭 필터 (임원진 필터 없음)
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

  // A. 데스크톱 테이블 뷰 (메모 컬럼 없음)
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
              <span>${member.tag}</span>
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

  // B. 모바일 전용 컴팩트 카드 리스트 뷰 (가로 스크롤 완전 해결)
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
          <!-- 상단: 순위 + 닉네임 + 직책 + 트로피 -->
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

          <!-- 하단: 핵심 2대 지표 한눈에 (모바일 2분할 그리드) -->
          <div class="grid grid-cols-2 gap-2 pt-2 mt-2 border-t border-white/[0.03]">
            <!-- 1. 마지막 접속 -->
            <div class="text-left">
              <div class="text-[10px] text-slate-500">마지막 접속</div>
              <div class="inline-flex items-center gap-1 mt-0.5">
                <span class="status-dot ${dotColor}"></span>
                <span class="text-xs ${seenTextColor}">${relativeSeen}</span>
              </div>
            </div>

            <!-- 2. 주간 지원량 -->
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
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

// 앱 실행
document.addEventListener("DOMContentLoaded", () => {
  window.app = new ClanManagerApp();
});
