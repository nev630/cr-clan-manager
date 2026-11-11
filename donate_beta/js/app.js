/**
 * Good Fellas Donate Tracker - Application Core Logic (Simplified)
 * - 지원 요청할 때가 된 클랜원 순서대로 자동 정렬 (지금 가능 최상단 -> 남은 쿨다운 짧은 순)
 * - 7시간 쿨다운 연산 & 실시간 카운트다운 & 스마트 요청 시각 예측
 * - Google Drive (Clan_Donation_DB) 스프레드시트 백그라운드 양방향 동기화
 */

class DonateTrackerApp {
  constructor() {
    this.members = [];
    this.filteredMembers = [];
    this.searchQuery = '';
    
    // 로컬 캐시 키
    this.storageKeys = {
      logs: 'cr_donate_logs_v1',
      prevReceived: 'cr_prev_donations_received_v1'
    };

    // 메모리 상의 요청 이력
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

    // 1. 초기 렌더링
    await this.fetchAndRender(true);

    // 2. 구글 드라이브 DB로부터 최신 누적 이력 동기화
    this.syncFromDriveDb();

    // 3. 1초마다 실시간 쿨다운 카운트다운 갱신
    this.timerInterval = setInterval(() => this.tickTimers(), 1000);

    // 4. 2분 주기 백그라운드 데이터 자동 갱신 (지원 수령 변화 감지)
    this.autoSyncInterval = setInterval(() => this.fetchAndRender(false), 120000);
  }

  cacheDOM() {
    this.elements = {
      list: document.getElementById('member-donate-list'),
      emptyState: document.getElementById('empty-state'),
      searchInput: document.getElementById('search-input'),
      countReady: document.getElementById('count-ready'),
      countCooldown: document.getElementById('count-cooldown'),
      dbStatusBadge: document.getElementById('db-status-badge'),
      historyModal: document.getElementById('user-history-modal'),
      toastContainer: document.getElementById('toast-container')
    };
  }

  bindEvents() {
    // 검색창 입력
    if (this.elements.searchInput) {
      this.elements.searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.trim().toLowerCase();
        this.applyFilterAndRender();
      });
    }

    // ESC 닫기
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeHistoryModal();
      }
    });
  }

  // --------------------------------------------------------------------------
  // 데이터 동기화 & 스냅샷 변화 감지
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

  detectAutomaticRequests(members) {
    let newAutoLogsCount = 0;

    members.forEach(member => {
      const tag = member.tag;
      const currentReceived = member.donationsReceived || 0;
      const prevReceived = this.prevReceivedMap[tag];

      if (typeof prevReceived === 'number' && currentReceived > prevReceived) {
        const diff = currentReceived - prevReceived;
        this.recordRequestLog(tag, member.name, 'Auto', currentReceived, `카드 ${diff}장 수령 감지`);
        newAutoLogsCount++;
      }

      this.prevReceivedMap[tag] = currentReceived;
    });

    this.savePrevReceived();

    if (newAutoLogsCount > 0) {
      this.saveLocalLogs();
      this.showToast(`${newAutoLogsCount}명의 신규 지원 요청 수령 감지!`, 'success');
    }
  }

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
        this.showToast(`구글 드라이브 DB에서 ${mergedCount}건 동기화 완료`, 'success');
      }
      this.updateDbStatusUI(true);
    } else {
      this.updateDbStatusUI(false);
    }
  }

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

    this.requestLogs[playerTag].unshift(logEntry);
    this.saveLocalLogs();

    window.donateApi.sendLogToDriveDb({
      playerTag: playerTag,
      playerName: playerName,
      type: type,
      donationsReceived: donationsReceived,
      note: note
    });
  }

  // --------------------------------------------------------------------------
  // 스마트 예측 연산 (7시간 쿨다운 & 루틴 학습)
  // --------------------------------------------------------------------------
  calculateUserPrediction(member) {
    const tag = member.tag;
    const history = this.requestLogs[tag] || [];
    const COOLDOWN_MS = 7 * 60 * 60 * 1000;

    if (history.length === 0) {
      const received = member.donationsReceived || 0;
      return {
        hasData: false,
        status: 'dormant',
        remainingMs: 0,
        predictedDate: null,
        cooldownEndTime: 0,
        peakHoursText: '기록 대기 중',
        avgIntervalText: '7시간 기준'
      };
    }

    const latest = history[0];
    const latestTime = new Date(latest.timestamp).getTime();
    const now = Date.now();
    const elapsed = now - latestTime;
    const remainingMs = Math.max(0, COOLDOWN_MS - elapsed);

    let avgDelayMinutes = 15;
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

    const cooldownEndTime = latestTime + COOLDOWN_MS;
    let predictedDate = new Date(cooldownEndTime + avgDelayMinutes * 60 * 1000);

    let isSleepAdjusted = false;
    const predHour = predictedDate.getHours();
    if (predHour >= 1 && predHour < 7) {
      predictedDate.setHours(7, 30, 0, 0);
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
      avgIntervalText: history.length >= 2 ? `약 ${Math.round(7 + avgDelayMinutes / 60)}시간` : '7시간 기준'
    };
  }

  // --------------------------------------------------------------------------
  // UI 렌더링 & 지원 요청할 때가 된 순서 정렬
  // --------------------------------------------------------------------------
  applyFilterAndRender() {
    if (!this.members) return;

    let list = [...this.members].map(m => {
      const pred = this.calculateUserPrediction(m);
      return { ...m, pred };
    });

    // 검색어 필터
    if (this.searchQuery) {
      list = list.filter(m => 
        (m.name && m.name.toLowerCase().includes(this.searchQuery)) ||
        (m.tag && m.tag.toLowerCase().includes(this.searchQuery))
      );
    }

    // [핵심] 지원 요청할 때가 된 순서대로 정렬:
    // 1순위: 지금 요청 가능 (ready) -> 쿨다운 일찍 끝난 순
    // 2순위: 쿨다운 중 (cooldown) -> 남은 쿨다운 짧은 순 (곧 요청할 순서)
    // 3순위: 미수령/기록 없음 (dormant)
    list.sort((a, b) => {
      if (a.pred.status === 'ready' && b.pred.status !== 'ready') return -1;
      if (b.pred.status === 'ready' && a.pred.status !== 'ready') return 1;

      if (a.pred.status === 'ready' && b.pred.status === 'ready') {
        const aEnd = a.pred.cooldownEndTime || 0;
        const bEnd = b.pred.cooldownEndTime || 0;
        if (aEnd !== bEnd) return aEnd - bEnd;
        return (b.donationsReceived || 0) - (a.donationsReceived || 0);
      }

      if (a.pred.status === 'cooldown' && b.pred.status === 'cooldown') {
        return a.pred.remainingMs - b.pred.remainingMs;
      }
      if (a.pred.status === 'cooldown' && b.pred.status !== 'cooldown') return -1;
      if (b.pred.status === 'cooldown' && a.pred.status !== 'cooldown') return 1;

      return (b.donationsReceived || 0) - (a.donationsReceived || 0);
    });

    this.filteredMembers = list;
    this.renderCards(list);
    this.updateKpiCounters();
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
      const received = m.donationsReceived || 0;

      let rankColor = 'text-slate-500';
      let statusHtml = '';

      if (pred.status === 'ready') {
        rankColor = 'text-emerald-400 font-black';
        statusHtml = `
          <div class="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center gap-1.5 shadow-sm">
            <span class="status-dot green live-pulse"></span>
            <span>⚡ 지금 가능</span>
          </div>
        `;
      } else if (pred.status === 'cooldown') {
        rankColor = idx < 3 ? 'text-amber-400 font-bold' : 'text-slate-400 font-bold';
        const timeStr = this.formatTimeRemaining(pred.remainingMs);
        const predTimeStr = this.formatClockTime(pred.predictedDate);
        const sleepHint = pred.isSleepAdjusted ? ' <span class="text-[9px] text-indigo-300">(기상 후)</span>' : '';
        statusHtml = `
          <div class="text-right">
            <div class="countdown-timer font-mono text-xs font-bold text-amber-400" data-cooldown-end="${pred.cooldownEndTime}">
              ⏳ ${timeStr}
            </div>
            <div class="text-[10px] text-slate-400 mt-0.5">
              예상 <span class="font-medium text-slate-200 font-mono">${predTimeStr}</span>${sleepHint}
            </div>
          </div>
        `;
      } else {
        statusHtml = `
          <div class="text-[11px] text-slate-500 font-medium px-2 py-0.5 rounded bg-white/[0.02]">
            기록 없음
          </div>
        `;
      }

      return `
        <div class="surface-card p-3 rounded-xl border border-white/[0.06] flex items-center justify-between gap-2.5 transition-all hover:border-white/[0.12]">
          <!-- 좌측: 순번 + 이름 + 역할/태그 -->
          <div class="min-w-0 flex items-center gap-2.5 flex-1">
            <span class="w-6 text-center font-mono text-xs ${rankColor}">#${idx + 1}</span>
            <div class="min-w-0">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="text-sm font-bold text-white truncate cursor-pointer hover:text-indigo-400 transition" onclick="window.donateApp.openHistoryModal('${m.tag}')">${this.escapeHtml(m.name)}</span>
                ${this.getRoleBadge(m.role)}
              </div>
              <div class="text-[10px] font-mono text-slate-400 mt-0.5">
                ${this.escapeHtml(m.tag)} · 받은 카드 ${received.toLocaleString()}장
              </div>
            </div>
          </div>

          <!-- 우측: 예상 시각 & 방금 요청 원클릭 버튼 -->
          <div class="flex items-center gap-2 shrink-0">
            ${statusHtml}
            <button type="button" onclick="window.donateApp.handleManualRecord('${m.tag}', '${this.escapeHtml(m.name)}', ${received})" class="px-2 py-1.5 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 active:scale-95 text-[10.5px] font-bold text-white transition flex items-center gap-1" title="인게임에서 방금 요청함 기록">
              <span>⚡ 요청</span>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  tickTimers() {
    const timerEls = document.querySelectorAll('.countdown-timer[data-cooldown-end]');
    const now = Date.now();

    timerEls.forEach(el => {
      const end = parseInt(el.dataset.cooldownEnd, 10);
      if (isNaN(end)) return;
      const remaining = Math.max(0, end - now);

      if (remaining === 0) {
        this.applyFilterAndRender();
      } else {
        el.textContent = '⏳ ' + this.formatTimeRemaining(remaining);
      }
    });
  }

  updateKpiCounters() {
    if (!this.members) return;

    let ready = 0, cooling = 0;
    this.members.forEach(m => {
      const pred = this.calculateUserPrediction(m);
      if (pred.status === 'ready') ready++;
      else if (pred.status === 'cooldown') cooling++;
    });

    if (this.elements.countReady) this.elements.countReady.textContent = ready;
    if (this.elements.countCooldown) this.elements.countCooldown.textContent = cooling;
  }

  handleManualRecord(tag, name, received) {
    this.recordRequestLog(tag, name, 'Manual', received, '유저 수동 요청 확인');
    this.applyFilterAndRender();
    this.showToast(`[${name}] 지원 요청 기록 완료 (7시간 타이머 가동)`, 'success');
  }

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
        <div class="text-center py-6 text-xs text-slate-500">
          아직 기록된 지원 요청 이력이 없습니다.<br>
          <span class="text-[10px] text-slate-600">[⚡ 요청] 버튼을 누르면 즉시 기록됩니다.</span>
        </div>
      `;
    } else {
      timelineContainer.innerHTML = logs.slice(0, 15).map(item => {
        const d = new Date(item.timestamp);
        const dateStr = d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' });
        const timeStr = d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
        const isAuto = item.type === 'Auto';

        return `
          <div class="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04] flex items-center justify-between text-[11px]">
            <div>
              <div class="font-medium text-white flex items-center gap-1">
                <span class="font-mono">${dateStr} ${timeStr}</span>
                <span class="text-[9px] px-1 py-0.2 rounded ${isAuto ? 'bg-indigo-500/20 text-indigo-300' : 'bg-emerald-500/20 text-emerald-400'}">${isAuto ? '자동 감지' : '수동'}</span>
              </div>
              <div class="text-[10px] text-slate-500 mt-0.5">${this.escapeHtml(item.note || '카드 요청')}</div>
            </div>
            <div class="text-right">
              <span class="text-slate-400 font-mono">수령: ${item.donationsReceived || 0}장</span>
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

  updateDbStatusUI(isConnected = null) {
    if (this.elements.dbStatusBadge) {
      if (isConnected === false) {
        this.elements.dbStatusBadge.className = 'status-dot rose';
      } else {
        this.elements.dbStatusBadge.className = 'status-dot green live-pulse';
      }
    }
  }

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

  formatTimeRemaining(ms) {
    const totalSecs = Math.floor(ms / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  formatClockTime(date) {
    if (!date) return '-';
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const timeStr = date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    return isToday ? timeStr : `내일 ${timeStr}`;
  }

  getRoleBadge(role) {
    switch (role) {
      case 'leader': return '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">대표</span>';
      case 'coLeader': return '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">공동대표</span>';
      case 'elder': return '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">장로</span>';
      default: return '<span class="text-[9px] font-medium px-1.5 py-0.5 rounded bg-white/[0.04] text-slate-400">멤버</span>';
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
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  showToast(message, type = 'info') {
    const container = this.elements.toastContainer;
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast-pill';
    const dotColor = type === 'error' ? 'bg-rose-400' : type === 'success' ? 'bg-emerald-400' : 'bg-indigo-400';
    toast.innerHTML = `
      <span class="w-1.5 h-1.5 rounded-full ${dotColor} shrink-0"></span>
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
