/**
 * Good Fellas Donate Tracker - API Client
 * - Supercell Proxy API 연동
 * - Google Drive (Clan_Donation_DB) Google Apps Script Web App 연동
 */

class DonateAPIClient {
  constructor() {
    this.proxyBase = 'https://green-disk-88a6.marble593812345.workers.dev';
    this.clanTag = '#G890J9JC';
    this.gasUrlKey = 'cr_gas_db_url';
    // 구글 드라이브 Apps Script 웹 앱 기본 연동 URL
    this.defaultGasUrl = 'https://script.google.com/macros/s/AKfycbwB8rpScojCEETsDuzeg3_BH-j-2YxCVdbbBDGt-yq7NUqIRZTwNhvVMRL68eX5UfsJ/exec';
  }

  getGasUrl() {
    return localStorage.getItem(this.gasUrlKey) || this.defaultGasUrl;
  }

  setGasUrl(url) {
    if (url) {
      localStorage.setItem(this.gasUrlKey, url.trim());
    } else {
      localStorage.removeItem(this.gasUrlKey);
    }
  }

  encodeTag(tag) {
    return encodeURIComponent(String(tag || '').trim());
  }

  // 1. 슈퍼셀 클랜 데이터 조회 (프록시 경유)
  async fetchClanMembers(force = false) {
    const q = force ? '?force=1' : '';
    const url = this.proxyBase + '/v1/clans/' + this.encodeTag(this.clanTag) + '/summary' + q;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error('클랜 데이터 수신 실패: HTTP ' + res.status);
    }
    return await res.json();
  }

  // 2. 구글 드라이브 DB 연결 테스트
  async testGasConnection(customUrl = null) {
    const targetUrl = (customUrl || this.getGasUrl()).trim();
    if (!targetUrl) {
      throw new Error('Google Apps Script 웹 앱 URL이 설정되지 않았습니다.');
    }
    const pingUrl = targetUrl + (targetUrl.includes('?') ? '&' : '?') + 'action=ping';
    const res = await fetch(pingUrl);
    if (!res.ok) throw new Error('연결 오류: HTTP ' + res.status);
    const data = await res.json();
    return data.status === 'ok';
  }

  // 3. 구글 드라이브 DB에서 전체 기록 & 습관 분석 데이터 조회 (GET)
  async fetchDriveDbLogs() {
    const targetUrl = this.getGasUrl();
    if (!targetUrl) return null;

    try {
      const getUrl = targetUrl + (targetUrl.includes('?') ? '&' : '?') + 'action=get_all';
      const res = await fetch(getUrl);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.warn('Google Drive DB 동기화 실패 (로컬 모드로 전환):', e);
      return null;
    }
  }

  // 4. 구글 드라이브 DB로 신규 요청 기록 전송 (POST)
  async sendLogToDriveDb(logEntry) {
    const targetUrl = this.getGasUrl();
    if (!targetUrl) return false;

    try {
      const payload = {
        action: 'log_request',
        playerTag: logEntry.playerTag,
        playerName: logEntry.playerName,
        type: logEntry.type || 'Manual',
        donationsReceived: logEntry.donationsReceived || 0,
        note: logEntry.note || ''
      };

      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      return res.ok;
    } catch (e) {
      console.warn('구글 드라이브 DB 전송 실패 (로컬에만 저장):', e);
      return false;
    }
  }
}

window.donateApi = new DonateAPIClient();
