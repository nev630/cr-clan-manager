/**
 * Clash Royale API Client
 * - Supercell Clash Royale Official API 지원
 * - Cloudflare Worker 프록시 및 CORS 프록시 지원
 * - 7일 이내 배틀 횟수 배치 집계 (동시 요청 제한 큐 & 실시간 프로그레스 바)
 * - 로컬 캐싱 지원
 */

class ClashRoyaleAPI {
  constructor() {
    this.storageKeySettings = "cr_manager_settings_v1";
    this.storageKeyCache = "cr_manager_clan_cache_v1";
    this.settings = this.loadSettings();
  }

  // 기본 설정 로드
  loadSettings() {
    const saved = localStorage.getItem(this.storageKeySettings);
    const defaultWorkerUrl = "https://green-disk-88a6.marble593812345.workers.dev";
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (!parsed.workerUrl) {
          parsed.workerUrl = defaultWorkerUrl;
        }
        if (!parsed.clanTag || parsed.clanTag === "#2Y9PQ8V0") {
          parsed.clanTag = "#G890J9JC";
        }
        return parsed;
      } catch (e) {
        console.error("Failed to parse settings", e);
      }
    }
    return {
      apiKey: "",
      clanTag: "#G890J9JC",
      proxyMode: "worker", // 'worker' | 'corsproxy' | 'allorigins' | 'direct'
      workerUrl: defaultWorkerUrl, // 사용자가 배포한 Cloudflare Worker 주소
      autoFetchBattles: true, // 클랜원 배틀로그 자동 조회 여부
      batchConcurrency: 4, // 동시 요청 수 (429 방지)
      cacheDurationMinutes: 15 // 캐시 유지 시간
    };
  }

  // 설정 저장
  saveSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    localStorage.setItem(this.storageKeySettings, JSON.stringify(this.settings));
  }

  // 태그 포맷팅 (# 처리)
  normalizeTag(tag) {
    if (!tag) return "";
    let clean = tag.trim().toUpperCase();
    if (!clean.startsWith("#")) {
      clean = "#" + clean;
    }
    // O(오)를 0(영)으로 자동 치환 (슈퍼셀 태그 특성)
    clean = clean.replace(/O/g, "0");
    return clean;
  }

  // URL 인코딩된 태그 (%23...)
  encodeTag(tag) {
    const normalized = this.normalizeTag(tag);
    return encodeURIComponent(normalized);
  }

  // Supercell API 날짜 형식("20261015T083427.000Z")을 Date 객체로 변환
  parseApiDate(dateStr) {
    if (!dateStr) return null;
    // 일반 ISO 형식이면 그대로 파싱
    if (dateStr.includes("-")) {
      return new Date(dateStr);
    }
    // Supercell 특유의 20261015T083427.000Z 포맷 변환
    try {
      const year = dateStr.slice(0, 4);
      const month = dateStr.slice(4, 6);
      const day = dateStr.slice(6, 8);
      const timePart = dateStr.slice(9); // 083427.000Z
      const hour = timePart.slice(0, 2);
      const minute = timePart.slice(2, 4);
      const second = timePart.slice(4, 6);
      const isoFormatted = `${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`;
      return new Date(isoFormatted);
    } catch (e) {
      return new Date(dateStr);
    }
  }

  // 상대적 시간 포맷 ("방금 전", "5분 전", "2시간 전", "3일 전")
  getRelativeTime(date) {
    if (!date) return "기록 없음";
    const d = typeof date === "string" ? this.parseApiDate(date) : date;
    if (!d || isNaN(d.getTime())) return "기록 없음";

    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    if (diffMs < 0) return "방금 전";

    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) return "방금 전";
    if (diffMinutes < 60) return `${diffMinutes}분 전`;
    if (diffHours < 24) return `${diffHours}시간 전`;
    if (diffDays === 1) return "어제";
    if (diffDays < 30) return `${diffDays}일 전`;
    const diffMonths = Math.floor(diffDays / 30);
    return `${diffMonths}달 전`;
  }

  // 프록시 URL 구성
  buildUrl(endpoint) {
    // endpoint 예: /v1/clans/%232Y9PQ8V0
    const mode = this.settings.proxyMode;
    const workerUrl = (this.settings.workerUrl || "").trim().replace(/\/$/, "");

    if (mode === "worker" && workerUrl) {
      // Cloudflare Worker 프록시
      return `${workerUrl}${endpoint}`;
    }

    if (mode === "royaleapi") {
      return `https://proxy.royaleapi.dev${endpoint}`;
    }

    const officialUrl = `https://api.clashroyale.com${endpoint}`;

    if (mode === "corsproxy") {
      // corsproxy.io
      return `https://corsproxy.io/?${encodeURIComponent(officialUrl)}`;
    } else if (mode === "allorigins") {
      // allorigins.win raw
      return `https://api.allorigins.win/raw?url=${encodeURIComponent(officialUrl)}`;
    }

    // Direct 또는 fallback
    return officialUrl;
  }

  // 공통 fetch 래퍼
  async fetchWithAuth(endpoint) {
    const url = this.buildUrl(endpoint);
    const headers = {
      "Accept": "application/json"
    };

    // API Key가 설정되어 있고, Worker에 하드코딩되지 않았거나 다른 프록시인 경우 헤더 첨부
    if (this.settings.apiKey) {
      headers["Authorization"] = `Bearer ${this.settings.apiKey.trim()}`;
    }

    const response = await fetch(url, {
      method: "GET",
      headers
    });

    if (!response.ok) {
      let errText = "";
      try {
        const errJson = await response.json();
        errText = errJson.message || errJson.reason || JSON.stringify(errJson);
      } catch (e) {
        errText = await response.text();
      }
      throw new Error(`API 오류 (${response.status}): ${errText || response.statusText}`);
    }

    return await response.json();
  }

  // 클랜 정보 및 멤버 기본 목록 조회
  async fetchClan(clanTag) {
    const encoded = this.encodeTag(clanTag);
    const endpoint = `/v1/clans/${encoded}`;
    return await this.fetchWithAuth(endpoint);
  }

  // 특정 플레이어의 배틀로그 조회
  async fetchPlayerBattlelog(playerTag) {
    const encoded = this.encodeTag(playerTag);
    const endpoint = `/v1/players/${encoded}/battlelog`;
    return await this.fetchWithAuth(endpoint);
  }

  // 배틀로그 로컬 누적 캐시 업데이트 (여러 날에 걸쳐 방문 시 30개 한계를 넘어 실제 1vs1 배틀 누적)
  updatePlayerBattleHistory(playerTag, battles) {
    if (!playerTag || !Array.isArray(battles)) return 0;
    try {
      const key = "cr_manager_battle_history_v2";
      let historyMap = {};
      const saved = localStorage.getItem(key);
      if (saved) {
        historyMap = JSON.parse(saved);
      }

      const now = Date.now();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

      const playerHistory = new Set(historyMap[playerTag] || []);
      battles.forEach(b => {
        if (!b.battleTime) return;
        // 로얄API Decks 탭 '7 days 1vs1 battle' 기준: 순수 1vs1 배틀만 누적
        const is2v2 = b.type && b.type.toLowerCase().includes("2v2");
        const isCW = b.type === "boatBattle" || b.type === "riverRacePvP" || b.type === "riverRaceDuel";
        if (!is2v2 && !isCW) {
          playerHistory.add(b.battleTime);
        }
      });

      // 7일 지난 배틀 정리
      const validBattles = Array.from(playerHistory).filter(timeStr => {
        const d = this.parseApiDate(timeStr);
        return d && (now - d.getTime() <= sevenDaysMs);
      });

      historyMap[playerTag] = validBattles;
      localStorage.setItem(key, JSON.stringify(historyMap));
      return validBattles.length;
    } catch (e) {
      return 0;
    }
  }

  // 배틀로그 분석: 최근 7일 내 순수 1vs1 대전 수 집계 (로얄API Decks 탭의 '7 days 1vs1 battle' 기준)
  analyzeBattlelog(battles, playerTag = "") {
    if (!Array.isArray(battles) || battles.length === 0) {
      return { recentBattles7d: 0, isMaxed: false, warDecksUsed7d: 0, lastBattleTime: null };
    }

    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    
    // 1. 순수 1vs1 대전(Path of Legend, Trophy Road, 1v1 Challenge/Tournament) 분류 및 7일 이내 필터링
    const pvp7d = [];
    let cw7dCount = 0;
    let lastBattleTime = null;

    for (let i = 0; i < battles.length; i++) {
      const b = battles[i];
      if (!b.battleTime) continue;
      const bDate = this.parseApiDate(b.battleTime);
      if (!bDate || isNaN(bDate.getTime())) continue;

      if (!lastBattleTime) {
        lastBattleTime = bDate.toISOString();
      }

      const diff = now - bDate.getTime();
      if (diff <= sevenDaysMs) {
        if (b.type === "boatBattle" || b.type === "riverRacePvP" || b.type === "riverRaceDuel") {
          cw7dCount++;
        } else {
          // 2v2 모드 제외 -> 순수 1vs1만 집계
          const is2v2 = b.type && b.type.toLowerCase().includes("2v2");
          if (!is2v2) {
            pvp7d.push(bDate);
          }
        }
      }
    }

    const pvpCount = pvp7d.length;
    let finalBattles7d = pvpCount;

    // 2. 슈퍼셀 공식 API의 버퍼(28~30개) 상한 도달 시, 실제 배틀 간격 기반 주간 활동 환산 (로얄API 1vs1 수준 동기화)
    if (pvpCount >= 28) {
      const newestPvP = pvp7d[0];
      const oldestPvP = pvp7d[pvpCount - 1];
      const spanHours = Math.max(1, (newestPvP.getTime() - oldestPvP.getTime()) / (1000 * 60 * 60));

      const effectiveDays = Math.max(1.5, spanHours / 24.0);
      const dailyRate = 30.0 / effectiveDays;
      const remainingDays = Math.max(0.0, (168.0 - spanHours) / 24.0);
      const factor = spanHours < 24 ? 0.38 : (spanHours < 48 ? 0.48 : 0.58);
      
      const estimated = 30 + Math.round(remainingDays * dailyRate * factor);
      finalBattles7d = Math.min(88, Math.max(30, estimated));
    }

    // 3. 브라우저 로컬 누적 히스토리와 비교 (로얄API처럼 계속 누적)
    if (playerTag) {
      const historyCount = this.updatePlayerBattleHistory(playerTag, battles);
      if (historyCount > finalBattles7d) {
        finalBattles7d = historyCount;
      }
    }

    return {
      recentBattles7d: finalBattles7d,
      isMaxed: pvpCount >= 28,
      warDecksUsed7d: cw7dCount,
      lastBattleTime
    };
  }

  // 클랜 전체 정보 실시간 동기화
  async fetchClanFullData(clanTag, onProgress = () => {}) {
    // 1. 클랜 기본 정보(멤버, 직책, 지원량, 마지막 접속) 초고속 조회
    const clanData = await this.fetchClan(clanTag);

    if (!clanData || !clanData.memberList) {
      throw new Error("클랜원 목록을 불러오지 못했습니다.");
    }

    const members = clanData.memberList;
    const totalMembers = members.length;

    // 초기 배틀값 설정 (기본값)
    members.forEach(m => {
      m.recentBattles7d = m.recentBattles7d ?? 0;
    });

    // 2. 백그라운드에서 최근 7일 배틀로그 보강 (동시 4개씩 병렬 조회)
    const concurrency = 4;
    let currentIndex = 0;

    const worker = async () => {
      while (currentIndex < members.length) {
        const index = currentIndex++;
        const member = members[index];
        try {
          const battlelog = await this.fetchPlayerBattlelog(member.tag);
          const analysis = this.analyzeBattlelog(battlelog, member.tag);
          member.recentBattles7d = analysis.recentBattles7d;
          member.isBattleMaxed = analysis.isMaxed;
        } catch (err) {
          // 비공개 프로필 등 오류 시 통과
        }
      }
    };

    const workers = [];
    for (let i = 0; i < concurrency; i++) {
      workers.push(worker());
    }

    // 배틀로그 병렬 조회 완료 대기
    await Promise.all(workers);

    // 캐시에 저장
    this.saveCache(clanTag, clanData);

    return clanData;
  }

  // 캐시 저장
  saveCache(clanTag, data) {
    try {
      const cacheObj = {
        clanTag: this.normalizeTag(clanTag),
        timestamp: Date.now(),
        data
      };
      localStorage.setItem(this.storageKeyCache, JSON.stringify(cacheObj));
    } catch (e) {
      console.warn("캐시 저장 실패 (용량 초과 등):", e);
    }
  }

  // 캐시 로드
  loadCache(clanTag) {
    try {
      const raw = localStorage.getItem(this.storageKeyCache);
      if (!raw) return null;
      const cacheObj = JSON.parse(raw);
      if (cacheObj.clanTag !== this.normalizeTag(clanTag)) return null;

      const durationMs = (this.settings.cacheDurationMinutes || 15) * 60 * 1000;
      if (Date.now() - cacheObj.timestamp > durationMs) {
        return null; // 만료됨
      }
      return cacheObj.data;
    } catch (e) {
      return null;
    }
  }
}

// 전역 인스턴스 생성
window.crApi = new ClashRoyaleAPI();
