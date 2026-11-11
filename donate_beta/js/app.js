/**
 * Good Fellas Donate Tracker - Application Core Logic
 * - 7시간 쿨다운 연산 및 실시간 카운트다운
 * - 유저별 생활 패턴/습관 학습 기반 다음 지원 요청 시간 스마트 예측
 * - Google Drive (Clan_Donation_DB) 스프레드시트 양방향 동기화
 */

class DonateTrackerApp {
  constructor() {
    this.members = [];
    this.filteredMembers = [];
    this.activeFilter = 'all'; // 'all' | 'ready' | 'cooldown' | 'dormant'
    this.searchQuery = '';
    
    // 로컬 캐시 키
    this.storageKeys = {
      logs: 'cr_donate_logs_v1',
      prevReceived: 'cr_prev_donations_received_v1'
    };

    // 메모리 상의 요청 이력 { tag: [ { timestamp, type, donationsReceived, note }, ... ] }
    this.requestLogs = this.loadLocalLogs();
    this.prevReceivedMap = this.loadPrevReceived();

    this.timerInterval = null;
    this.autoSyncInterval = null;

    this.init();
  }

  async init() {
    this.cacheDOM();
    this.bindEvents();
    this.updateDbStatusUI();

    // 1. 초기 렌더링 (로컬/프리셋 기반 즉시 표시)
    await this.fetchAndRender(true);

    // 2. 구글 드라이브 DB로부터 최신 누적 이력 가져오기
    this.syncFromDriveDb();

    // 3. 1초마다 실시간 쿨다운 카운트다운 갱신
    this.timerInterval = setInterval(() => this.tickTimers(), 1000);

    // 4. 2분 주기 백그라운드 데이터 자동 갱신 (지원 수령 변화 자동 감지)
    this.autoSyncInterval = setInterval(() => this.fetchAndRender(false), 120000);
  }

  cacheDOM() {
    this.elements = {
      list: document.getElementById('member-donate-list'),
      emptyState: document.getElementById('empty-state'),
      searchInput: document.getElementById('search-input'),
      btnSearchClear: document.getElementById('btn-search-clear'),
      kpiReady: document.getElementById('kpi-ready-count'),
      kpiCooling: document.getElementById('kpi-cooling-count'),
      kpiTotalReceived: document.getElementById('kpi-total-received'),
      countAll: document.getElementById('count-all'),
      countReady: document.getElementById('count-ready'),
      countCooldown: document.getElementById('count-cooldown'),
      countDormant: document.getElementById('count-dormant'),
      btnThemeToggle: document.getElementById('btn-theme-toggle'),
      btnDbSettings: document.getElementById('btn-db-settings'),
      dbStatusBadge: document.getElementById('db-status-badge'),
      historyModal: document.getElementById('user-history-modal'),
      dbModal: document.getElementById('db-settings-modal'),
      inputGasUrl: document.getElementById('input-gas-url'),
      btnSaveGasUrl: document.getElementById('btn-save-gas-url'),
      btnTestDb: document.getElementById('btn-test-db-connection'),
      btnExportJson: document.getElementById('btn-export-json'),
      toastContainer: document.getElementById('toast-container')
    };
  }

  bindEvents() {
    // 1. 필터 탭 클릭
    document.querySelectorAll('.filter-chip').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.activeFilter = e.currentTarget.dataset.filter;
        this.applyFilterAndRender();
      });
    });

    // 2. 검색창 입력
    if (this.elements.searchInput) {
      this.elements.searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.trim().toLowerCase();
        if (this.elements.btnSearchClear) {
          this.elements.btnSearchClear.classList.toggle('hidden', !this.searchQuery);
        }
        this.applyFilterAndRender();
      });
    }

    if (this.elements.btnSearchClear) {
      this.elements.btnSearchClear.addEventListener('click', () => {
        this.elements.searchInput.value = '';
        this.searchQuery = '';
        this.elements.btnSearchClear.classList.add('hidden');
        this.applyFilterAndRender();
      });
    }

    // 3. 테마 토글
    if (this.elements.btnThemeToggle) {
      this.elements.btnThemeToggle.addEventListener('click', () => this.toggleTheme());
    }

    // 4. 구글 드라이브 DB 설정 모달
    if (this.elements.btnDbSettings) {
      this.elements.btnDbSettings.addEventListener('click', () => this.openDbModal());
    }

    if (this.elements.btnSaveGasUrl) {
      this.elements.btnSaveGasUrl.addEventListener('click', () => this.saveGasUrl());
    }

    if (this.elements.btnTestDb) {
      this.elements.btnTestDb.addEventListener('click', () => this.testDbConnection());
    }

    if (this.elements.btnExportJson) {
      this.elements.btnExportJson.addEventListener('click', () => this.exportJsonBackup());
    }

    // ESC 닫기
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeHistoryModal();
        this.closeDbModal();
      }
    });
  }

  // --------------------------------------------------------------------------
  // 데이터 동기화 & 스냅샷 변화 감지 (Snapshot Diffing)
  // --------------------------------------------------------------------------
  async fetchAndRender(isInitial = false) {
    try {
      const data = await window.donateApi.fetchClanMembers(isInitial);
      if (!data || !Array.isArray(data.memberList)) return;

      this.members = data.memberList;
      this.detectAutomaticRequests(this.members);
      this.applyFilterAndRender();
      this.updateKpiCounters();
    } catch (e) {
      console.warn('클랜 데이터 동기화 실패:', e);
      if (isInitial) {
        this.showToast('클랜원 목록 조회 실패: ' + e.message, 'error');
      }
    }
  }

  // 받은 카드 수(donationsReceived)가 증가했을 때 지원 요청 발생으로 자동 감지
  detectAutomaticRequests(members) {
    let newAutoLogsCount = 0;
    const nowIso = new Date().toISOString();

    members.forEach(member => {
      const tag = member.tag;
      const currentReceived = member.donationsReceived || 0;
      const prevReceived = this.prevReceivedMap[tag];

      if (typeof prevReceived === 'number' && currentReceived > prevReceived) {
        const diff = currentReceived - prevReceived;
        // 지원 요청이 발생하여 카드를 수령한 것으로 판단
        this.recordRequestLog(tag, member.name, 'Auto', currentReceived, `카드 ${diff}장 수령 감지`);
        newAutoLogsCount++;
      }

      this.prevReceivedMap[tag] = currentReceived;
    });

    this.savePrevReceived();

    if (newAutoLogsCount > 0) {
      this.saveLocalLogs();
      this.showToast(`${newAutoLogsCount}명의 신규 지원 요청 수령이 감지되었습니다!`, 'success');
    }
  }

  // 구글 드라이브 DB로부터 누적 이력 가져와 병합
  async syncFromDriveDb() {
    const driveData = await window.donateApi.fetchDriveDbLogs();
    if (driveData && Array.isArray(driveData.logs)) {
      let mergedCount = 0;
      driveData.logs.forEach(log => {
        const tag = log.playerTag;
        if (!tag) return;
        if (!this.requestLogs[tag]) this.requestLogs[tag] = [];
        
        const exists = this.requestLogs[tag].some(local => local.timestamp === log.timestamp);
        if (!exists) {
          this.requestLogs[tag].push({
            timestamp: log.timestamp,
            type: log.type || 'DriveSync',
            donationsReceived: log.donationsReceived || 0,
            note: log.note || ''
          });
          mergedCount++;
        }
      });

      if (mergedCount > 0) {
        this.saveLocalLogs();
        this.applyFilterAndRender();
        this.showToast(`구글 드라이브 DB에서 ${mergedCount}건의 이력을 동기화했습니다.`, 'success');
      }
      this.updateDbStatusUI(true);
    } else {
      this.updateDbStatusUI(false);
    }
  }

  // --------------------------------------------------------------------------
  // 요청 기록 및 스마트 예측 연산 (Routine Habit Learning Engine)
  // --------------------------------------------------------------------------
  recordRequestLog(playerTag, playerName, type = 'Manual', donationsReceived = 0, note = '') {
    if (!playerTag) return;
    if (!this.requestLogs[playerTag]) {
      this.requestLogs[playerTag] = [];
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      type: type,
      donationsReceived: donationsReceived,
      note: note
    };

    // 로컬 저장
    this.requestLogs[playerTag].unshift(logEntry);
    this.saveLocalLogs();

    // 구글 드라이브 DB로 백그라운드 전송
    window.donateApi.sendLogToDriveDb({
      playerTag: playerTag,
      playerName: playerName,
      type: type,
      donationsReceived: donationsReceived,
      note: note
    });
  }

  // 각 유저별 쿨다운 상태 및 다음 예상 시각 계산
  calculateUserPrediction(member) {
    const tag = member.tag;
    const history = this.requestLogs[tag] || [];
    const COOLDOWN_MS = 7 * 60 * 60 * 1000; // 7시간

    if (history.length === 0) {
      // 기록이 없는 경우: 주간 수령량이 있으면 대략 활동 상태로 판단
      const received = member.donationsReceived || 0;
      return {
        hasData: false,
        status: received > 0 ? 'unknown' : 'dormant',
        remainingMs: 0,
        predictedDate: null,
        displayText: received > 0 ? '기록 없음 (수동 기록 권장)' : '이번 주 미수령',
        peakHoursText: '데이터 수집 중',
        avgIntervalText: '데이터 없음',
        badgeColor: 'slate'
      };
    }

    const latest = history[0];
    const latestTime = new Date(latest.timestamp).getTime();
    const now = Date.now();
    const elapsed = now - latestTime;
    const remainingMs = Math.max(0, COOLDOWN_MS - elapsed);

    // 1. 유저 습관/패턴 분석 (2건 이상 기록 시 평균 주기 및 주요 시간대 산출)
    let avgDelayMinutes = 15; // 기본 평균 쿨다운 후 15분 내 요청 가정
    let peakHours = [];

    if (history.length >= 2) {
      const intervals = [];
      const hourCounts = {};

      for (let i = 0; i < history.length - 1; i++) {
        const t1 = new Date(history[i].timestamp);
        const t2 = new Date(history[i + 1].timestamp);
        const diffHours = (t1.getTime() - t2.getTime()) / (1000 * 60 * 60);
        if (diffHours >= 6.5 && diffHours <= 24) {
          intervals.push(diffHours);
        }

        const h = t1.getHours();
        hourCounts[h] = (hourCounts[h] || 0) + 1;
      }

      if (intervals.length > 0) {
        const avgIntervalHours = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        avgDelayMinutes = Math.max(5, Math.round((avgIntervalHours - 7) * 60));
      }

      peakHours = Object.keys(hourCounts)
        .map(h => ({ hour: parseInt(h, 10), count: hourCounts[h] }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 2)
        .map(p => `${p.hour}:00`);
    }

    // 2. 다음 예상 시각 계산
    const cooldownEndTime = latestTime + COOLDOWN_MS;
    let predictedDate = new Date(cooldownEndTime + avgDelayMinutes * 60 * 1000);

    // 3. 수면 시간대(새벽 1시~7시) 보정
    const predHour = predictedDate.getHours();
    let isSleepAdjusted = false;
    if (predHour >= 1 && predHour < 7) {
      predictedDate.setHours(7, 30, 0, 0); // 기상 시간인 오전 7:30으로 예측 보정
      isSleepAdjusted = true;
    }

    const isReady = remainingMs === 0;

    return {
      hasData: true,
      status: isReady ? 'ready' : 'cooldown',
      remainingMs: remainingMs,
      cooldownEndTime: cooldownEndTime,
      predictedDate: predictedDate,
      isSleepAdjusted: isSleepAdjusted,
      peakHoursText: peakHours.length > 0 ? peakHours.join(', ') : '패턴 분석 중',
      avgIntervalText: history.length >= 2 ? `약 ${Math.round(7 + avgDelayMinutes / 60)}시간` : '7시간 기준',
      badgeColor: isReady ? 'green' : 'amber'
    };
  }

  // --------------------------------------------------------------------------
  // UI 렌더링 & 실시간 타이머 갱신
  // --------------------------------------------------------------------------
  applyFilterAndRender() {
    if (!this.members) return;

    let list = [...this.members].map(m => {
      const pred = this.calculateUserPrediction(m);
      return { ...m, pred };
    });

    // 1. 검색어 필터
    if (this.searchQuery) {
      list = list.filter(m => 
        (m.name && m.name.toLowerCase().includes(this.searchQuery)) ||
        (m.tag && m.tag.toLowerCase().includes(this.searchQuery))
      );
    }

    // 2. 상태 탭 필터
    if (this.activeFilter === 'ready') {
      list = list.filter(m => m.pred.status === 'ready');
    } else if (this.activeFilter === 'cooldown') {
      list = list.filter(m => m.pred.status === 'cooldown');
    } else if (this.activeFilter === 'dormant') {
      list = list.filter(m => m.pred.status === 'dormant' || !m.pred.hasData);
    }

    // 3. 스마트 정렬: 지금 요청 가능한 사람 최우선 -> 남은 쿨다운 짧은 순 -> 미수령
    list.sort((a, b) => {
      if (a.pred.status === 'ready' && b.pred.status !== 'ready') return -1;
      if (b.pred.status === 'ready' && a.pred.status !== 'ready') return 1;
      if (a.pred.status === 'cooldown' && b.pred.status === 'cooldown') {
        return a.pred.remainingMs - b.pred.remainingMs;
      }
      return (b.donationsReceived || 0) - (a.donationsReceived || 0);
    });

    this.filteredMembers = list;
    this.renderCards(list);
  }

  renderCards(members) {
    const container = this.elements.list;
    const emptyState = this.elements.emptyState;
    if (!container) return;

    if (members.length === 0) {
      container.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    container.innerHTML = members.map((m, idx) => {
      const pred = m.pred;
      const cleanTag = String(m.tag || '').replace('#', '');
      const received = m.donationsReceived || 0;

      let statusBadgeHtml = '';
      if (pred.status === 'ready') {
        statusBadgeHtml = `
          <div class=\"flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold\">
            <span class=\"status-dot green live-pulse\"></span>
            <span>⚡ 지금 요청 가능!</span>
          </div>
        `;
      } else if (pred.status === 'cooldown') {
        const timeStr = this.formatTimeRemaining(pred.remainingMs);
        const predTimeStr = this.formatClockTime(pred.predictedDate);
        const sleepHint = pred.isSleepAdjusted ? ' <span class=\"text-[10px] text-indigo-300 font-normal\">(기상 후)</span>' : '';
        statusBadgeHtml = `
          <div class=\"flex flex-col items-end text-right\">
            <div class=\"countdown-timer font-mono text-xs font-bold text-amber-400\" data-cooldown-end=\"${pred.cooldownEndTime}\">
              ⏳ ${timeStr}
            </div>
            <div class=\"text-[10px] text-slate-400 mt-0.5\">
              예상: <span class=\"font-medium text-slate-200 font-mono\">${predTimeStr}</span>${sleepHint}
            </div>
          </div>
        `;
      } else {
        statusBadgeHtml = `
          <div class=\"text-[11px] text-slate-500 font-medium px-2 py-0.5 rounded bg-white/[0.02] border border-white/[0.04]\">
            💤 이번 주 기록 없음
          </div>
        `;
      }

      return `
        <div class=\"surface-card p-3.5 rounded-2xl border border-white/[0.06] flex items-center justify-between gap-3 transition-all\">
          <!-- 좌측: 유저 정보 및 수령 현황 -->
          <div class=\"min-w-0 flex-1\">
            <div class=\"flex items-center gap-1.5 flex-wrap\">
              <span class=\"font-mono text-xs text-slate-500 font-bold\">#${m.clanRank || idx + 1}</span>
              <h4 class=\"text-sm font-bold text-white truncate cursor-pointer hover:text-indigo-400 transition\" onclick=\"window.donateApp.openHistoryModal('${m.tag}')\">${this.escapeHtml(m.name)}</h4>
              ${this.getRoleBadge(m.role)}
            </div>
            <div class=\"flex items-center gap-2 text-[11px] font-mono text-slate-400 mt-1\">
              <span>${this.escapeHtml(m.tag)}</span>
              <span>·</span>
              <span class=\"text-amber-400 font-medium font-sans\">받은 카드 ${received.toLocaleString()}개</span>
            </div>
          </div>

          <!-- 우측: 예측 타이머 & 액션 버튼 -->
          <div class=\"flex flex-col items-end gap-1.5 shrink-0\">
            ${statusBadgeHtml}
            <div class=\"flex items-center gap-1 mt-1\">
              <button type=\"button\" onclick=\"window.donateApp.handleManualRecord('${m.tag}', '${this.escapeHtml(m.name)}', ${received})\" class=\"px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-[10.5px] font-bold text-white transition flex items-center gap-1 shadow-sm\">
                <span>⚡ 방금 요청</span>
              </button>
              <button type=\"button\" onclick=\"window.donateApp.openHistoryModal('${m.tag}')\" class=\"p-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white transition\" title=\"요청 이력 보기\">
                <svg class=\"w-3.5 h-3.5\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 3v5h5\"/><path d=\"M3.05 13A9 9 0 1 0 6 5.3L3 8\"/><path d=\"M12 7v5l4 2\"/></svg>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // 1초마다 남은 시간 타이머 갱신
  tickTimers() {
    const timerEls = document.querySelectorAll('.countdown-timer[data-cooldown-end]');
    const now = Date.now();

    timerEls.forEach(el => {
      const end = parseInt(el.dataset.cooldownEnd, 10);
      if (isNaN(end)) return;
      const remaining = Math.max(0, end - now);

      if (remaining === 0) {
        // 쿨다운 종료 시 카드를 '지금 요청 가능'으로 실시간 교체하기 위해 리렌더링
        this.applyFilterAndRender();
        this.updateKpiCounters();
      } else {
        el.textContent = '⏳ ' + this.formatTimeRemaining(remaining);
      }
    });
  }

  updateKpiCounters() {
    if (!this.members) return;

    let ready = 0, cooling = 0, dormant = 0, totalReceived = 0;
    this.members.forEach(m => {
      const pred = this.calculateUserPrediction(m);
      if (pred.status === 'ready') ready++;
      else if (pred.status === 'cooldown') cooling++;
      else dormant++;
      totalReceived += (m.donationsReceived || 0);
    });

    if (this.elements.kpiReady) this.elements.kpiReady.textContent = ready + '명';
    if (this.elements.kpiCooling) this.elements.kpiCooling.textContent = cooling + '명';
    if (this.elements.kpiTotalReceived) this.elements.kpiTotalReceived.textContent = totalReceived.toLocaleString() + '개';

    if (this.elements.countAll) this.elements.countAll.textContent = this.members.length;
    if (this.elements.countReady) this.elements.countReady.textContent = ready;
    if (this.elements.countCooldown) this.elements.countCooldown.textContent = cooling;
    if (this.elements.countDormant) this.elements.countDormant.textContent = dormant;
  }

  // --------------------------------------------------------------------------
  // 원클릭 수동 요청 기록
  // --------------------------------------------------------------------------
  handleManualRecord(tag, name, received) {
    this.recordRequestLog(tag, name, 'Manual', received, '유저 수동 요청 확인');
    this.applyFilterAndRender();
    this.updateKpiCounters();
    this.showToast(`[${name}] 님의 지원 요청을 기록했습니다 (7시간 타이머 가동)`, 'success');
  }

  // --------------------------------------------------------------------------
  // 유저 상세 이력 모달
  // --------------------------------------------------------------------------
  openHistoryModal(tag) {
    const member = this.members.find(m => m.tag === tag);
    if (!member) return;

    const modal = this.elements.historyModal;
    if (!modal) return;

    const pred = this.calculateUserPrediction(member);
    const logs = this.requestLogs[tag] || [];

    document.getElementById('hist-member-name').textContent = member.name || '클랜원';
    document.getElementById('hist-member-role').textContent = this.getRoleText(member.role);
    document.getElementById('hist-member-tag').textContent = member.tag;
    document.getElementById('hist-peak-hours').textContent = pred.peakHoursText;
    document.getElementById('hist-avg-interval').textContent = pred.avgIntervalText;
    document.getElementById('hist-total-count').textContent = `총 ${logs.length}건 기록`;

    const timelineContainer = document.getElementById('hist-timeline-list');
    if (logs.length === 0) {
      timelineContainer.innerHTML = `
        <div class=\"text-center py-6 text-xs text-slate-500\">
          아직 기록된 지원 요청 이력이 없습니다.<br>
          <span class=\"text-[10px] text-slate-600\">[방금 요청함] 버튼을 누르면 기록이 시작됩니다.</span>
        </div>
      `;
    } else {
      timelineContainer.innerHTML = logs.slice(0, 15).map(item => {
        const d = new Date(item.timestamp);
        const dateStr = d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' });
        const timeStr = d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
        const isAuto = item.type === 'Auto';

        return `
          <div class=\"p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04] flex items-center justify-between text-[11px]\">
            <div>
              <div class=\"font-medium text-white flex items-center gap-1\">
                <span class=\"font-mono\">${dateStr} ${timeStr}</span>
                <span class=\"text-[9px] px-1 py-0.2 rounded ${isAuto ? 'bg-indigo-500/20 text-indigo-300' : 'bg-emerald-500/20 text-emerald-400'}\">${isAuto ? '자동 감지' : '수동 입력'}</span>
              </div>
              <div class=\"text-[10px] text-slate-500 mt-0.5\">${this.escapeHtml(item.note || '카드 요청')}</div>
            </div>
            <div class=\"text-right\">
              <span class=\"text-slate-400 font-mono\">수령: ${item.donationsReceived || 0}장</span>
            </div>
          </div>
        `;
      }).join('');
    }

    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
  }

  closeHistoryModal() {
    const modal = this.elements.historyModal;
    if (modal) {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  // --------------------------------------------------------------------------
  // 구글 드라이브 DB 설정 모달
  // --------------------------------------------------------------------------
  openDbModal() {
    const modal = this.elements.dbModal;
    if (!modal) return;
    if (this.elements.inputGasUrl) {
      this.elements.inputGasUrl.value = window.donateApi.getGasUrl();
    }
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
  }

  closeDbModal() {
    const modal = this.elements.dbModal;
    if (modal) {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  saveGasUrl() {
    const url = this.elements.inputGasUrl.value.trim();
    window.donateApi.setGasUrl(url);
    this.showToast('Google Drive DB URL이 저장되었습니다.', 'success');
    this.closeDbModal();
    this.updateDbStatusUI();
    this.syncFromDriveDb();
  }

  async testDbConnection() {
    const url = this.elements.inputGasUrl.value.trim();
    try {
      this.showToast('구글 드라이브 DB 연결 테스트 중...', 'info');
      const ok = await window.donateApi.testGasConnection(url);
      if (ok) {
        this.showToast('Google Drive DB와 성공적으로 연결되었습니다!', 'success');
      } else {
        this.showToast('연결 실패: 응답 상태를 확인하세요.', 'error');
      }
    } catch (e) {
      this.showToast(e.message, 'error');
    }
  }

  updateDbStatusUI(isConnected = null) {
    const hasUrl = Boolean(window.donateApi.getGasUrl());
    if (this.elements.dbStatusBadge) {
      if (!hasUrl) {
        this.elements.dbStatusBadge.className = 'status-dot slate';
        this.elements.dbStatusBadge.title = '로컬 브라우저 저장 모드 (URL 미설정)';
      } else if (isConnected === false) {
        this.elements.dbStatusBadge.className = 'status-dot rose';
        this.elements.dbStatusBadge.title = 'Google Drive DB 연결 실패';
      } else {
        this.elements.dbStatusBadge.className = 'status-dot green live-pulse';
        this.elements.dbStatusBadge.title = 'Google Drive DB 동기화 활성화';
      }
    }
  }

  exportJsonBackup() {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(this.requestLogs, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', `donate_logs_backup_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
    this.showToast('요청 이력 백업 파일이 다운로드되었습니다.', 'success');
  }

  // --------------------------------------------------------------------------
  // 로컬 저장소 헬퍼
  // --------------------------------------------------------------------------
  loadLocalLogs() {
    try {
      const raw = localStorage.getItem(this.storageKeys.logs);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  saveLocalLogs() {
    try {
      localStorage.setItem(this.storageKeys.logs, JSON.stringify(this.requestLogs));
    } catch (e) {}
  }

  loadPrevReceived() {
    try {
      const raw = localStorage.getItem(this.storageKeys.prevReceived);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  savePrevReceived() {
    try {
      localStorage.setItem(this.storageKeys.prevReceived, JSON.stringify(this.prevReceivedMap));
    } catch (e) {}
  }

  // --------------------------------------------------------------------------
  // 기타 유틸리티 & 테마
  // --------------------------------------------------------------------------
  toggleTheme() {
    const isDark = document.documentElement.classList.contains('dark');
    if (isDark) {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      localStorage.setItem('cr_theme', 'light');
    } else {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      localStorage.setItem('cr_theme', 'dark');
    }
  }

  formatTimeRemaining(ms) {
    const totalSecs = Math.floor(ms / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  formatClockTime(date) {
    if (!date) return '-';
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  }

  getRoleBadge(role) {
    switch (role) {
      case 'leader': return '<span class=\"text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30\">대표</span>';
      case 'coLeader': return '<span class=\"text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30\">공동대표</span>';
      case 'elder': return '<span class=\"text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30\">장로</span>';
      default: return '<span class=\"text-[9px] font-medium px-1.5 py-0.5 rounded bg-white/[0.04] text-slate-400\">멤버</span>';
    }
  }

  getRoleText(role) {
    switch (role) {
      case 'leader': return '대표';
      case 'coLeader': return '공동대표';
      case 'elder': return '장로';
      default: return '멤버';
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  showToast(message, type = 'info') {
    const container = this.elements.toastContainer;
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast-pill';
    const dotColor = type === 'error' ? 'bg-rose-400' : type === 'success' ? 'bg-emerald-400' : 'bg-indigo-400';
    toast.innerHTML = `
      <span class=\"w-1.5 h-1.5 rounded-full ${dotColor} shrink-0\"></span>
      <span>${this.escapeHtml(message)}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 2400);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.donateApp = new DonateTrackerApp();
  if (window.lucide) window.lucide.createIcons();
});
