/**
 * Clash Royale API Client (v1.4.4 Instant Sync & Timestamp Guard)
 * - Supercell Clash Royale Official API 지원
 * - Cloudflare Worker / Oracle 프록시 실시간 통신
 * - v1.4.2: 신규 단일 통합 요약(/v1/clans/:tag/summary) 엔드포인트 지원
 * - 지능형 On-Demand 캐시 및 우아한 폴백(Graceful Fallback) 메커니즘
 */

class ClashRoyaleAPI {
  constructor() {
    this.settings = this.loadSettings();
  }

  loadSettings() {
    return {
      apiKey: "",
      clanTag: "#G890J9JC",
      workerUrl: "https://green-disk-88a6.marble593812345.workers.dev"
    };
  }

  // 태그 포맷팅 (# 처리 및 슈퍼셀 공식 태그 검증)
  normalizeTag(tag) {
    if (!tag) return "";
    let clean = String(tag).trim().toUpperCase();
    if (!clean.startsWith("#")) {
      clean = "#" + clean;
    }
    clean = clean.replace(/O/g, "0");
    clean = "#" + clean.slice(1).replace(/[^0289PYLQGRJCUV]/g, "");
    return clean;
  }

  encodeTag(tag) {
    return encodeURIComponent(this.normalizeTag(tag));
  }

  // Supercell API 날짜 형식 변환
  parseApiDate(dateStr) {
    if (!dateStr) return null;
    if (dateStr.includes("-")) {
      return new Date(dateStr);
    }
    try {
      const year = dateStr.slice(0, 4);
      const month = dateStr.slice(4, 6);
      const day = dateStr.slice(6, 8);
      const timePart = dateStr.slice(9);
      const hour = timePart.slice(0, 2);
      const minute = timePart.slice(2, 4);
      const second = timePart.slice(4, 6);
      return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`);
    } catch {
      return new Date(dateStr);
    }
  }

  getRelativeTime(date) {
    if (!date) return "기록 없음";
    const d = typeof date === "string" ? this.parseApiDate(date) : date;
    if (!d || isNaN(d.getTime())) return "기록 없음";

    const diffMs = Date.now() - d.getTime();
    if (diffMs < 0) return "방금 전";

    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMinutes < 1) return "방금 전";
    if (diffMinutes < 60) return `${diffMinutes}분 전`;
    if (diffHours < 24) return `${diffHours}시간 전`;
    if (diffDays === 1) return "어제";
    if (diffDays < 30) return `${diffDays}일 전`;
    return `${Math.floor(diffDays / 30)}달 전`;
  }

  buildUrl(endpoint) {
    const defaultWorkerUrl = "https://green-disk-88a6.marble593812345.workers.dev";
    const workerUrl = (this.settings.workerUrl || defaultWorkerUrl).trim().replace(/\/$/, "");
    return `${workerUrl}${endpoint}`;
  }

  async fetchWithAuth(endpoint) {
    // 실시간 캐시 버스터(_t) 강제 부착 및 cache: 'no-store' 적용으로 항상 최신 데이터 동기화
    const sep = endpoint.includes("?") ? "&" : "?";
    const cacheBustedEndpoint = `${endpoint}${sep}_t=${Date.now()}`;
    const url = this.buildUrl(cacheBustedEndpoint);
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
    const rawText = await response.text();

    if (!response.ok) {
      let errText = rawText;
      if (rawText) {
        try {
          const errJson = JSON.parse(rawText);
          errText = errJson.message || errJson.reason || JSON.stringify(errJson);
        } catch {
          // Non-JSON 응답인 경우 rawText 유지
        }
      }
      throw new Error(`API 오류 (${response.status}): ${errText || response.statusText}`);
    }

    return rawText ? JSON.parse(rawText) : null;
  }

  // 1. 신규 단일 통합 요약 조회 (클랜 + 50명 배틀로그 원샷 반환)
  async fetchClanSummary(clanTag, force = false) {
    try {
      const q = force ? '?force=1' : '';
      return await this.fetchWithAuth(`/v1/clans/${this.encodeTag(clanTag)}/summary${q}`);
    } catch (e) {
      console.warn("단일 통합 요약 엔드포인트 미지원 또는 응답 지연 -> 일반 조회로 폴백:", e.message);
      return null;
    }
  }

  async fetchClan(clanTag) {
    return await this.fetchWithAuth(`/v1/clans/${this.encodeTag(clanTag)}`);
  }

  async fetchPlayer(playerTag) {
    return await this.fetchWithAuth(`/v1/players/${this.encodeTag(playerTag)}`);
  }

  async fetchPlayerBattleLog(playerTag) {
    return await this.fetchWithAuth(`/v1/players/${this.encodeTag(playerTag)}/battlelog`);
  }

  extractSeasonalTrophies(playerProfile) {
    if (!playerProfile) return 0;
    let maxTrophies = typeof playerProfile.trophies === "number" ? playerProfile.trophies : 0;
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

  async fetchClanFullData(clanTag, onPartialData = null, force = false) {
    // 1. 단일 통합 요약 엔드포인트 우선 시도 (수동 새로고침 시 force=true로 서버 캐시 즉시 우회)
    const summaryData = await this.fetchClanSummary(clanTag, force);
    if (summaryData && summaryData.memberList) {
      if (typeof onPartialData === "function") {
        onPartialData(summaryData);
      }
      return summaryData;
    }

    // 2. 미지원 시 기존 개별 조회로 원활히 폴백
    const clanData = await this.fetchClan(clanTag);
    if (!clanData || !clanData.memberList) {
      throw new Error("클랜원 목록을 불러오지 못했습니다.");
    }

    if (typeof onPartialData === "function") {
      onPartialData(clanData);
    }

    return clanData;
  }

  getGalleryClansPreset() {
    return Array.isArray(window.GALLERY_CLANS_DATA) ? JSON.parse(JSON.stringify(window.GALLERY_CLANS_DATA)) : [];
  }

  async fetchMultipleClans(clanTags = ["#G890J9JC", "#JYQRP2C2", "#Q0U22YGQ"]) {
    const presets = this.getGalleryClansPreset();
    const presetMap = new Map();
    presets.forEach(p => {
      presetMap.set(this.normalizeTag(p.tag), p);
    });

    const promises = clanTags.map(async (rawTag) => {
      const tag = this.normalizeTag(rawTag);
      const fallback = presetMap.get(tag) || {
        tag,
        name: tag,
        members: 0,
        donationsPerWeek: 0,
        clanScore: 0,
        clanWarTrophies: 0,
        requiredTrophies: 0,
        description: "",
        isHome: tag === "#G890J9JC"
      };

      try {
        const clan = await this.fetchClan(tag);
        if (clan && clan.name) {
          return {
            ...fallback,
            ...clan,
            tag: clan.tag || tag,
            isHome: tag === "#G890J9JC",
            _isLive: true
          };
        }
        return { ...fallback, _isLive: false };
      } catch (err) {
        return { ...fallback, _isLive: false, _fetchError: err.message };
      }
    });

    return await Promise.all(promises);
  }
}

window.crApi = new ClashRoyaleAPI();
