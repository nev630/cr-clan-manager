/**
 * Clash Royale API Client (Optimized)
 * - Supercell Clash Royale Official API 지원
 * - Cloudflare Worker 프록시 실시간 통신
 * - 미사용 7일 배틀로그 분석 알고리즘 및 캐시 메서드 정리
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

    getWorkerUrl() {
        return (this.settings.workerUrl || "").replace(/\/+$/, "");
    }

    buildUrl(endpoint) {
        const cleanEndpoint = endpoint.startsWith("/") ? endpoint : "/" + endpoint;
        const worker = this.getWorkerUrl();

        if (worker) {
            const hasQuery = cleanEndpoint.includes("?");
            return `${worker}${cleanEndpoint}${hasQuery ? "&" : "?"}url=${encodeURIComponent("https://api.clashroyale.com/v1" + cleanEndpoint)}`;
        }

        return `https://api.clashroyale.com/v1${cleanEndpoint}`;
    }

    // 외부 프록시/API 통신용 래퍼 (Stream 소비 안전성 처리)
    async fetchWithProxy(endpoint) {
        const worker = this.getWorkerUrl();
        const cleanEndpoint = endpoint.startsWith("/") ? endpoint : "/" + endpoint;
        
        let targetUrl = `https://api.clashroyale.com/v1${cleanEndpoint}`;
        if (worker) {
            const hasQuery = cleanEndpoint.includes("?");
            targetUrl = `${worker}${cleanEndpoint}${hasQuery ? "&" : "?"}url=${encodeURIComponent("https://api.clashroyale.com/v1" + cleanEndpoint)}`;
        }

        const res = await fetch(targetUrl, { method: "GET" });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }
        return await res.json();
    }

    async fetchWithAuth(endpoint) {
        const url = this.buildUrl(endpoint);
        const headers = { "Accept": "application/json" };

        if (this.settings.apiKey) {
            headers["Authorization"] = `Bearer ${this.settings.apiKey.trim()}`;
        }

        const response = await fetch(url, { method: "GET", headers });
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

    // 클랜 프로필
    async fetchClan(clanTag) {
        const tag = this.encodeTag(clanTag || this.settings.clanTag);
        return await this.fetchWithAuth(`/clans/${tag}`);
    }

    // 클랜원 목록
    async fetchClanMembers(clanTag) {
        const tag = this.encodeTag(clanTag || this.settings.clanTag);
        const data = await this.fetchWithAuth(`/clans/${tag}/members`);
        return data.items || [];
    }

    // 플레이어 프로필
    async fetchPlayer(playerTag) {
        const tag = this.encodeTag(playerTag);
        return await this.fetchWithAuth(`/players/${tag}`);
    }

    // 플레이어 배틀로그 (최근 25경기)
    async fetchPlayerBattleLog(playerTag) {
        const tag = this.encodeTag(playerTag);
        try {
            const data = await this.fetchWithAuth(`/players/${tag}/battlelog`);
            return Array.isArray(data) ? data : [];
        } catch {
            return [];
        }
    }

    // 최상위 랭커의 실제 전설 점수(Best Trophies/Seasonal) 보정
    extractSeasonalTrophies(playerProfile) {
        if (!playerProfile) return 0;
        let best = playerProfile.trophies || 0;

        if (playerProfile.bestTrophies && playerProfile.bestTrophies > best) {
            best = playerProfile.bestTrophies;
        }

        if (playerProfile.leagueStatistics) {
            const ls = playerProfile.leagueStatistics;
            if (ls.currentSeason && ls.currentSeason.trophies > best) {
                best = ls.currentSeason.trophies;
            }
            if (ls.previousSeason && ls.previousSeason.trophies > best) {
                best = ls.previousSeason.trophies;
            }
            if (ls.bestSeason && ls.bestSeason.trophies > best) {
                best = ls.bestSeason.trophies;
            }
        }

        return best;
    }

    // 클랜 상세 정보 (14,000점 이상 유저 보정 로직 포함)
    async fetchClanWithTrophyFix(clanTag, onPartialData = null) {
        const clanData = await this.fetchClan(clanTag);
        if (!clanData || !clanData.memberList) {
            return clanData;
        }

        const members = clanData.memberList;
        const cappedMembers = members.filter(m => (m.trophies || 0) >= 14000);

        if (cappedMembers.length > 0) {
            setTimeout(async () => {
                let hasChanges = false;
                for (let i = 0; i < Math.min(cappedMembers.length, 15); i++) {
                    const member = cappedMembers[i];
                    if (!member || !member.tag) continue;
                    try {
                        const profile = await this.fetchPlayer(member.tag);
                        const trueTrophies = this.extractSeasonalTrophies(profile);
                        if (trueTrophies > member.trophies) {
                            member.trophies = trueTrophies;
                            hasChanges = true;
                        }
                    } catch {}
                }
                if (hasChanges && typeof onPartialData === "function") {
                    onPartialData(clanData);
                }
            }, 50);
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
