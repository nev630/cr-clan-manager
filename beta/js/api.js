/**
 * Clash Royale API Client (v2.0.0)
 * - Supercell Clash Royale Official API / Cloudflare Worker 프록시 통신
 * - 단일 통합 요약(/v1/clans/:tag/summary) 및 폴백 조회 지원
 * - 429 Rate Limit 쿨다운 가드 및 중복 호출 방지
 */

class ClashRoyaleAPI {
  constructor() {
    this.settings = this.loadSettings();
    this.rateLimitedUntil = 0;
  }

  loadSettings() {
    return {
      clanTag: "#G890J9JC",
      workerUrl: "https://green-disk-88a6.marble593812345.workers.dev"
    };
  }

  isRateLimited() {
    return Date.now() < this.rateLimitedUntil;
  }

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

  parseApiDate(dateStr) {
    if (!dateStr) return null;
    if (dateStr instanceof Date) {
      return isNaN(dateStr.getTime()) ? null : dateStr;
    }
    if (typeof dateStr !== "string") {
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? null : d;
    }
    if (dateStr.includes("-")) {
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? null : d;
    }
    try {
      const year = Number(dateStr.slice(0, 4));
      const month = Number(dateStr.slice(4, 6)) - 1;
      const day = Number(dateStr.slice(6, 8));
      const hour = Number(dateStr.slice(9, 11));
      const minute = Number(dateStr.slice(11, 13));
      const second = Number(dateStr.slice(13, 15));
      const d = new Date(Date.UTC(year, month, day, hour, minute, second));
      return isNaN(d.getTime()) ? null : d;
    } catch {
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? null : d;
    }
  }

  buildUrl(endpoint) {
    const workerUrl = this.settings.workerUrl.trim().replace(/\/$/, "");
    return `${workerUrl}${endpoint}`;
  }

  async fetchWithAuth(endpoint, timeoutMs = 6000) {
    const sep = endpoint.includes("?") ? "&" : "?";
    const cacheBustedEndpoint = `${endpoint}${sep}_t=${Date.now()}`;
    const url = this.buildUrl(cacheBustedEndpoint);
    const headers = {
      "Accept": "application/json",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache"
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers,
        cache: "no-store",
        signal: controller.signal
      });
      clearTimeout(timer);
      const rawText = await response.text();

      if (!response.ok) {
        if (response.status === 429) {
          this.rateLimitedUntil = Date.now() + 60000;
        }
        let errText = rawText;
        if (rawText) {
          try {
            const errJson = JSON.parse(rawText);
            errText = errJson.message || errJson.reason || JSON.stringify(errJson);
          } catch {
            if (rawText.length > 200) {
              errText = `서버 응답 오류 (${response.statusText || response.status})`;
            }
          }
        }
        const err = new Error(`API 오류 (${response.status}): ${errText || response.statusText}`);
        err.status = response.status;
        throw err;
      }

      return rawText ? JSON.parse(rawText) : null;
    } catch (e) {
      clearTimeout(timer);
      if (e.name === "AbortError") {
        const timeoutErr = new Error(`API 응답 시간 초과 (${timeoutMs / 1000}초)`);
        timeoutErr.status = 504;
        throw timeoutErr;
      }
      throw e;
    }
  }

  async fetchClanSummary(clanTag, force = false) {
    try {
      const q = force ? "?force=1" : "";
      return await this.fetchWithAuth(`/v1/clans/${this.encodeTag(clanTag)}/summary${q}`, 3500);
    } catch (e) {
      console.warn("단일 통합 요약 엔드포인트 미지원 또는 응답 지연 -> 일반 조회로 폴백:", e.message);
      return null;
    }
  }

  async fetchClan(clanTag) {
    return await this.fetchWithAuth(`/v1/clans/${this.encodeTag(clanTag)}`);
  }

  // 429 발생 시 즉시 중단하여 연속 호출 방지
  async fetchPlayerBattleLog(playerTag) {
    if (!playerTag || this.isRateLimited()) return null;
    const encoded = this.encodeTag(playerTag);
    if (!encoded) return null;

    try {
      const data = await this.fetchWithAuth(`/v1/players/${encoded}/battlelog`, 5000);
      return Array.isArray(data) ? data : null;
    } catch (e) {
      if (e.status === 429) {
        this.rateLimitedUntil = Date.now() + 60000;
      }
      return null;
    }
  }

  async fetchClanFullData(clanTag, onPartialData = null, force = false) {
    const summaryData = await this.fetchClanSummary(clanTag, force);
    if (summaryData && summaryData.memberList) {
      if (typeof onPartialData === "function") {
        onPartialData(summaryData);
      }
      return summaryData;
    }

    const clanData = await this.fetchClan(clanTag);
    if (!clanData || !clanData.memberList) {
      throw new Error("클랜원 목록을 불러오지 못했습니다.");
    }

    if (typeof onPartialData === "function") {
      onPartialData(clanData);
    }

    return clanData;
  }

  // 하드코딩된 과거 수치 제거 (태그/이름 메타만 유지)
  getGalleryClansPreset() {
    if (Array.isArray(window.GALLERY_CLANS_DATA) && window.GALLERY_CLANS_DATA.length > 0) {
      return JSON.parse(JSON.stringify(window.GALLERY_CLANS_DATA));
    }
    return [
      {
        tag: "#G890J9JC",
        name: "Good Fellas",
        members: null,
        donationsPerWeek: null,
        isHome: true
      },
      {
        tag: "#JYQRP2C2",
        name: "Vandros",
        members: null,
        donationsPerWeek: null,
        isHome: false
      },
      {
        tag: "#Q0U22YGQ",
        name: "딜넣는 도둑",
        members: null,
        donationsPerWeek: null,
        isHome: false
      }
    ];
  }

  async fetchMultipleClans(clanTags = ["#G890J9JC", "#JYQRP2C2", "#Q0U22YGQ"], cachedHomeClan = null) {
    const presets = this.getGalleryClansPreset();
    const presetMap = new Map();
    presets.forEach((p) => {
      presetMap.set(this.normalizeTag(p.tag), p);
    });

    const homeTagNormalized = this.normalizeTag(this.settings.clanTag || "#G890J9JC");

    const promises = clanTags.map(async (rawTag) => {
      const tag = this.normalizeTag(rawTag);
      const isHome = tag === homeTagNormalized;
      const fallback = presetMap.get(tag) || {
        tag,
        name: tag,
        members: null,
        donationsPerWeek: null,
        isHome
      };

      if (isHome && cachedHomeClan && cachedHomeClan.name) {
        return {
          ...fallback,
          ...cachedHomeClan,
          members: Array.isArray(cachedHomeClan.memberList) ? cachedHomeClan.memberList.length : (cachedHomeClan.members ?? fallback.members),
          tag: cachedHomeClan.tag || tag,
          isHome: true,
          _isLive: true
        };
      }

      try {
        const clan = await this.fetchClan(tag);
        if (clan && clan.name) {
          return {
            ...fallback,
            ...clan,
            tag: clan.tag || tag,
            isHome,
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
