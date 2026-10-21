/**
 * Clash Royale API Client
 * - Supercell Clash Royale Official API 지원
 * - Cloudflare Worker 프록시 및 CORS 프록시 지원
 * - SWR (Stale-While-Revalidate) 로컬 캐싱 지원
 * - 14,000+ 시즌 트로피 병렬 배치(Concurrent Batch) 동기화 지원
 */

class ClashRoyaleAPI {
  constructor() {
    this.storageKeySettings = "cr_manager_settings_v1";
    this.storageKeyCache = "cr_manager_clan_cache_v2";
    this.settings = this.loadSettings();
  }

  // 기본 설정 로드
  loadSettings() {
    const defaultWorkerUrl = "https://green-disk-88a6.marble593812345.workers.dev";
    return {
      apiKey: "",
      clanTag: "#G890J9JC",
      proxyMode: "worker",
      workerUrl: defaultWorkerUrl,
      batchConcurrency: 4,
      cacheDurationMinutes: 10
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

  // 공통 fetch 래퍼
  async fetchWithAuth(endpoint) {
    const url = this.buildUrl(endpoint);
    const headers = {
      "Accept": "application/json"
    };

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

  // 클랜 전체 정보 실시간 동기화 (Fast-path 0.3초 선반영 + 14000+ 도달자 병렬 배치 비동기 보강)
  async fetchClanFullData(clanTag, onPartialData = null) {
    // 1. 클랜 기본 정보(멤버, 직책, 지원량, 기본 트로피, 마지막 접속) 초고속 조회 (0.3초)
    const clanData = await this.fetchClan(clanTag);

    if (!clanData || !clanData.memberList) {
      throw new Error("클랜원 목록을 불러오지 못했습니다.");
    }

    // 기본 데이터 수신 즉시 UI 선반영 및 SWR 캐시 갱신
    this.saveCache(clanTag, clanData);
    if (typeof onPartialData === "function") {
      onPartialData(clanData);
    }

    const members = clanData.memberList;

    // 2. [성능 최적화] 14,000+ 트로피 멤버 전체를 병렬 배치(Promise.all)로 동시 처리 (15명 제한 해제 및 N+1 병목 해결)
    const cappedMembers = members.filter(m => (m.trophies || 0) >= 14000);

    if (cappedMembers.length > 0) {
      setTimeout(async () => {
        let hasChanges = false;
        const concurrency = this.settings.batchConcurrency || 4;

        for (let i = 0; i < cappedMembers.length; i += concurrency) {
          const batch = cappedMembers.slice(i, i + concurrency);
          await Promise.all(
            batch.map(async (member) => {
              if (!member || !member.tag) return;
              try {
                const profile = await this.fetchPlayer(member.tag);
                const trueTrophies = this.extractSeasonalTrophies(profile);
                if (trueTrophies > member.trophies) {
                  member.trophies = trueTrophies;
                  hasChanges = true;
                }
              } catch (e) {
                // 개별 프로필 실패 시 기존 14000 유지
              }
            })
          );
        }

        if (hasChanges) {
          this.saveCache(clanTag, clanData);
          if (typeof onPartialData === "function") {
            onPartialData(clanData);
          }
        }
      }, 50);
    }

    return clanData;
  }

  // [SWR] 로컬 캐시 저장
  saveCache(clanTag, data) {
    if (!clanTag || !data) return;
    try {
      const key = `${this.storageKeyCache}_${this.normalizeTag(clanTag)}`;
      const payload = {
        timestamp: Date.now(),
        data: data
      };
      localStorage.setItem(key, JSON.stringify(payload));
    } catch (e) {
      console.warn("캐시 저장 실패:", e);
    }
  }

  // [SWR] 로컬 캐시 불러오기
  loadCache(clanTag) {
    if (!clanTag) return null;
    try {
      const key = `${this.storageKeyCache}_${this.normalizeTag(clanTag)}`;
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.data) {
        return parsed; // { timestamp, data }
      }
    } catch (e) {
      return null;
    }
    return null;
  }

  // 갤러리 클랜(갤클) 프리셋 데이터 반환
  getGalleryClansPreset() {
    return Array.isArray(window.GALLERY_CLANS_DATA) ? JSON.parse(JSON.stringify(window.GALLERY_CLANS_DATA)) : [];
  }

  // 복수 클랜 정보 실시간 병렬 조회 (타 갤클 비교용)
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
        console.warn(`클랜 ${tag} 실시간 조회 실패, 프리셋 적용:`, err.message);
        return { ...fallback, _isLive: false, _fetchError: err.message };
      }
    });

    return await Promise.all(promises);
  }
}

// 전역 인스턴스 생성
window.crApi = new ClashRoyaleAPI();
