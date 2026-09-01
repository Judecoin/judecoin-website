(function () {
  "use strict";

  const EXPLORER_URL = "https://www.judeblock.org/";
  const STAKING_REQUIREMENT = 23600;
  const CACHE_KEY = "judecoin-live-stats-v2";
  const CACHE_MAX_AGE = 24 * 60 * 60 * 1000;
  let liveRevision = 0;

  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn, { once: true });
    else fn();
  }

  function toNumber(value) {
    if (value === undefined || value === null || value === "") return null;
    const n = Number(String(value).replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  function cleanHtml(html) {
    return String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseExplorerText(text) {
    const activeSentence = text.match(/([0-9][\d,]*)\s+service nodes awaiting contributions,\s*([0-9][\d,]*)\s+decommissioned service nodes,\s*and\s*([0-9][\d,]*)\s+active service nodes/i);
    const activeHeading = text.match(/Active Service Nodes\s+([0-9][\d,]*)/i);
    const stakingMatch = text.match(/Staking requirement:\s*([0-9][\d,.]*)\s*JUDE/i);
    const heightMatch = text.match(/Height:\s*([0-9][\d,]*)/i);
    const serverTimeMatch = text.match(/Server Time:\s*([^#]+?)\s+Height:/i);
    const latestBlockMatch = text.match(/Height Age \[h:m:s\] Size Type Transaction Hash Fee Rewards In\/Out TX Size\s+([0-9][\d,]*)\s+([0-9]{1,3}:[0-9]{2}:[0-9]{2})/i);

    const activeServiceNodes = activeSentence ? toNumber(activeSentence[3]) : activeHeading ? toNumber(activeHeading[1]) : null;
    const stakingRequirement = stakingMatch ? toNumber(stakingMatch[1]) : STAKING_REQUIREMENT;
    const latestBlockHeight = latestBlockMatch ? toNumber(latestBlockMatch[1]) : null;
    const latestBlockAge = latestBlockMatch ? latestBlockMatch[2] : null;

    if (!activeServiceNodes) return null;

    return {
      activeServiceNodes: activeServiceNodes,
      stakingRequirement: stakingRequirement || STAKING_REQUIREMENT,
      totalJudeStaked: activeServiceNodes * (stakingRequirement || STAKING_REQUIREMENT),
      chainHeight: heightMatch ? toNumber(heightMatch[1]) : null,
      latestBlockHeight: latestBlockHeight,
      latestBlockAge: latestBlockAge,
      serverTime: serverTimeMatch ? serverTimeMatch[1].trim() : null,
      source: "explorer"
    };
  }

  function parseExplorerHtml(html) {
    return parseExplorerText(cleanHtml(html));
  }

  function parseJson(data) {
    if (!data || typeof data !== "object") return null;
    const activeServiceNodes = toNumber(data.activeServiceNodes || data.active_service_nodes || data.activeNodes || data.active);
    const stakingRequirement = toNumber(data.stakingRequirement || data.staking_requirement) || STAKING_REQUIREMENT;
    if (!activeServiceNodes) return null;
    return {
      activeServiceNodes: activeServiceNodes,
      stakingRequirement: stakingRequirement,
      totalJudeStaked: activeServiceNodes * stakingRequirement,
      chainHeight: toNumber(data.chainHeight || data.height),
      latestBlockHeight: toNumber(data.latestBlockHeight || data.lastBlockHeight),
      latestBlockAge: data.latestBlockAge || data.lastBlockAge || null,
      serverTime: data.serverTime || null,
      fetchedAt: data.fetchedAt || null,
      source: data.source || "api"
    };
  }

  function readCache() {
    try {
      const cached = JSON.parse(window.localStorage.getItem(CACHE_KEY) || "null");
      if (!cached || !cached.savedAt || Date.now() - cached.savedAt > CACHE_MAX_AGE) return null;
      const stats = parseJson(cached.stats);
      if (!stats) return null;
      stats.source = "cache";
      return stats;
    } catch (error) {
      return null;
    }
  }

  function writeCache(stats) {
    try {
      window.localStorage.setItem(CACHE_KEY, JSON.stringify({
        savedAt: Date.now(),
        stats: stats
      }));
    } catch (error) {
    }
  }

  async function fetchStats() {
    const sources = [];
    if (window.location.protocol !== "file:") {
      sources.push({ url: "/api/judeblock-stats", type: "json", options: { cache: "default" } });
    }
    sources.push({ url: EXPLORER_URL, type: "html", options: { cache: "no-store" } });

    for (const source of sources) {
      try {
        const response = await fetch(source.url, source.options);
        if (!response.ok) continue;
        const stats = source.type === "json"
          ? parseJson(await response.json())
          : parseExplorerHtml(await response.text());
        if (stats) return stats;
      } catch (error) {
      }
    }

    return null;
  }

  function formatNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString("en-US");
  }

  function formatJude(value) {
    return formatNumber(value) + ' <span class="metric-unit">JUDE</span>';
  }

  function formatBlockAge(age) {
    if (!age) return "Explorer";
    const parts = String(age).split(":").map((part) => Number(part));
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return String(age);
    const h = parts[0], m = parts[1], s = parts[2];
    if (h > 0) return h + "h " + m + "m ago";
    if (m > 0) return m + " min ago";
    return s + " sec ago";
  }

  function setReady(el) {
    if (!el) return;
    el.classList.remove("is-live-loading", "is-live-unavailable");
    el.classList.add("is-live-ready");
    el.removeAttribute("aria-busy");
  }

  function setRevision(el, revision) {
    if (el) el.dataset.liveRevision = String(revision);
  }

  function applyStats(stats, options) {
    const activeServiceNodes = stats ? toNumber(stats.activeServiceNodes) : null;
    const stakingRequirement = stats ? (toNumber(stats.stakingRequirement) || STAKING_REQUIREMENT) : STAKING_REQUIREMENT;
    if (!activeServiceNodes) return false;

    const totalJudeStaked = activeServiceNodes * stakingRequirement;
    const active = document.querySelector('[data-live-stat="activeServiceNodes"]');
    const total = document.querySelector('[data-live-stat="totalJudeStaked"]');
    const requirement = document.querySelector('[data-live-stat="stakingRequirement"]');
    const updated = document.querySelector('[data-live-stat="lastBlockAge"]');
    const panel = document.querySelector(".status-panel");
    const source = options && options.source ? options.source : (stats.source || "api");
    const revision = ++liveRevision;

    if (active) active.textContent = formatNumber(activeServiceNodes);
    if (total) total.innerHTML = formatJude(totalJudeStaked);
    if (requirement) requirement.innerHTML = formatJude(stakingRequirement);
    if (updated) {
      updated.textContent = source === "cache" ? "Cached" : formatBlockAge(stats.latestBlockAge);
      const titleParts = [];
      if (source === "cache") titleParts.push("Updating live network data");
      if (stats.latestBlockHeight) titleParts.push("Latest block: " + stats.latestBlockHeight);
      if (stats.latestBlockAge && source !== "cache") titleParts.push("Explorer age: " + stats.latestBlockAge);
      if (stats.serverTime) titleParts.push("Explorer server time: " + stats.serverTime);
      if (titleParts.length) updated.setAttribute("title", titleParts.join(" | "));
      else updated.removeAttribute("title");
    }

    [active, total, requirement, updated].forEach((el) => {
      setRevision(el, revision);
      setReady(el);
    });
    if (panel) panel.setAttribute("data-live-source", source);

    document.dispatchEvent(new CustomEvent("judecoin:live-stats-ready", {
      detail: { source: source, revision: revision }
    }));
    return true;
  }

  function showUnavailable() {
    const active = document.querySelector('[data-live-stat="activeServiceNodes"]');
    const total = document.querySelector('[data-live-stat="totalJudeStaked"]');
    const updated = document.querySelector('[data-live-stat="lastBlockAge"]');
    const panel = document.querySelector(".status-panel");

    if (active) active.textContent = "—";
    if (total) total.innerHTML = '— <span class="metric-unit">JUDE</span>';
    if (updated) {
      updated.textContent = "Unavailable";
      updated.setAttribute("title", "Live network data is temporarily unavailable");
    }
    [active, total, updated].forEach((el) => {
      if (!el) return;
      el.classList.remove("is-live-loading", "is-live-ready");
      el.classList.add("is-live-unavailable");
      el.removeAttribute("aria-busy");
    });
    if (panel) panel.setAttribute("data-live-source", "unavailable");
  }

  function init() {
    const liveValues = document.querySelectorAll(
      '[data-live-stat="activeServiceNodes"], [data-live-stat="totalJudeStaked"], [data-live-stat="lastBlockAge"]'
    );
    liveValues.forEach((el) => {
      el.classList.add("is-live-loading");
      el.setAttribute("aria-busy", "true");
    });

    const requirement = document.querySelector('[data-live-stat="stakingRequirement"]');
    if (requirement) {
      requirement.innerHTML = formatJude(STAKING_REQUIREMENT);
      setReady(requirement);
    }

    const cached = readCache();
    if (cached) applyStats(cached, { source: "cache" });

    fetchStats().then((stats) => {
      if (stats && applyStats(stats)) {
        writeCache(stats);
      } else if (!cached) {
        showUnavailable();
      }
    });
  }

  ready(init);
})();
