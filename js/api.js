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

  // 기본 설정 로드 (항상 신뢰할 수 있는 전용 Cloudflare Worker 실시간 동기화 강제)
  loadSettings() {
    const defaultWorkerUrl = "https://green-disk-88a6.marble593812345.workers.dev";
    return {
      apiKey: "",
      clanTag: "#G890J9JC",
      proxyMode: "worker",
      workerUrl: defaultWorkerUrl,
      autoFetchBattles: false,
      batchConcurrency: 4,
      cacheDurationMinutes: 0 // 캐시 완전 비활성화
    };
  }

  // 설정 저장
  saveSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
  }

  // 태그 포맷팅 (# 처리 및 슈퍼셀 공식 태그 검증)
  normalizeTag(tag) {
    if (!tag) return "";
    let clean = String(tag).trim().toUpperCase();
    if (!clean.startsWith("#")) {
      clean = "#" + clean;
    }
    // O(오)를 0(영)으로 자동 치환 (슈퍼셀 태그 특성)
    clean = clean.replace(/O/g, "0");
    // 슈퍼셀 공식 문자 [0289PYLQGRJCUV] 외 특수문자 및 경로 조작(../) 방지
    clean = "#" + clean.slice(1).replace(/[^0289PYLQGRJCUV]/g, "");
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

  // 프록시 URL 구성 (캐시 방지 타임스탬프 쿼리 항상 추가)
  buildUrl(endpoint) {
    const defaultWorkerUrl = "https://green-disk-88a6.marble593812345.workers.dev";
    const workerUrl = (this.settings.workerUrl || defaultWorkerUrl).trim().replace(/\/$/, "");
    const separator = endpoint.includes("?") ? "&" : "?";
    const cacheBuster = `_t=${Date.now()}`;
    return `${workerUrl}${endpoint}${separator}${cacheBuster}`;
  }

  // 공통 fetch 래퍼 (무조건 브라우저 캐시 우회 no-store)
  async fetchWithAuth(endpoint) {
    const url = this.buildUrl(endpoint);
    const headers = {
      "Accept": "application/json",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache"
    };

    if (this.settings.apiKey) {
      headers["Authorization"] = `Bearer ${this.settings.apiKey.trim()}`;
    }

    const response = await fetch(url, {
      method: "GET",
      headers,
      cache: "no-store"
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

  // 특정 플레이어의 상세 프로필 조회 (시즌 트로피 로드 등 상세 데이터)
  async fetchPlayer(playerTag) {
    const encoded = this.encodeTag(playerTag);
    const endpoint = `/v1/players/${encoded}`;
    return await this.fetchWithAuth(endpoint);
  }

  // 플레이어의 실제 트로피(14000 상한선 도달 시 시즌 트로피 로드 14000~15000+ 반영) 추출
  extractSeasonalTrophies(playerProfile) {
    if (!playerProfile) return 0;
    let maxTrophies = typeof playerProfile.trophies === "number" ? playerProfile.trophies : 0;

    // progress 객체 내의 시즌 트로피 로드 (Seasonal Trophy Road) 확인
    const progress = playerProfile.progress;
    if (progress && typeof progress === "object") {
      for (const key of Object.keys(progress)) {
        if (key.toLowerCase().includes("seasonal")) {
          const s = progress[key];
          if (s && typeof s.trophies === "number" && s.trophies > maxTrophies) {
            maxTrophies = s.trophies;
          }
        }
      }
    }
    return maxTrophies;
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
    const safeTag = String(playerTag).trim();
    if (safeTag === "__proto__" || safeTag === "constructor" || safeTag === "prototype") {
      return 0;
    }
    try {
      const key = "cr_manager_battle_history_v2";
      let historyMap = Object.create(null);
      const saved = localStorage.getItem(key);
      if (saved) {
        Object.assign(historyMap, JSON.parse(saved));
      }

      const now = Date.now();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

      const playerHistory = new Set(historyMap[safeTag] || []);
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

      historyMap[safeTag] = validBattles;
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

  // 클랜 전체 정보 실시간 동기화 (기본 정보 초고속 조회 + 14000 상한 도달자 시즌 트로피 보강)
  async fetchClanFullData(clanTag, onPartialData = null) {
    // 1. 클랜 기본 정보(멤버, 직책, 지원량, 기본 트로피, 마지막 접속) 초고속 조회 (0.3초)
    const clanData = await this.fetchClan(clanTag);

    if (!clanData || !clanData.memberList) {
      throw new Error("클랜원 목록을 불러오지 못했습니다.");
    }

    // 기본 데이터 수신 즉시 UI에 선반영하여 0.3초 만에 최신 정보를 보도록 콜백 호출
    if (typeof onPartialData === "function") {
      onPartialData(clanData);
    }

    const members = clanData.memberList;

    // 2. 14000 트로피 상한선에 도달한 멤버들의 실제 시즌 트로피(14000~15000+) 병렬 보강
    const cappedMembers = members.filter(m => (m.trophies || 0) >= 14000);

    if (cappedMembers.length > 0) {
      const concurrency = 6;
      let currentIndex = 0;

      const worker = async () => {
        while (currentIndex < cappedMembers.length) {
          const idx = currentIndex++;
          const member = cappedMembers[idx];
          if (!member || !member.tag) continue;
          try {
            const profile = await this.fetchPlayer(member.tag);
            const trueTrophies = this.extractSeasonalTrophies(profile);
            if (trueTrophies > member.trophies) {
              member.trophies = trueTrophies;
            }
          } catch (e) {
            // 프로필 조회 실패 시 기존 14000 유지
          }
        }
      };

      const workers = [];
      for (let i = 0; i < concurrency; i++) {
        workers.push(worker());
      }
      await Promise.all(workers);
    }

    return clanData;
  }

  // 캐시 저장 (무조건 최신 정보 실시간 동기화를 위해 로컬 저장 비활성화)
  saveCache(clanTag, data) {
    // 최신 정보 유지를 위해 캐시 저장 생략
  }

  // 캐시 로드 (무조건 최신 정보 실시간 동기화를 위해 항상 null 반환)
  loadCache(clanTag) {
    return null;
  }
}

// 전역 인스턴스 생성
window.crApi = new ClashRoyaleAPI();
