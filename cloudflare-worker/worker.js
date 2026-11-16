const ALLOWED_ORIGINS = new Set([
  "https://frankferra7-cyber.github.io"
]);
const ALLOWED_LEAGUES = new Set(["39", "135", "140", "61", "78", "2"]);
const API_ROOT = "https://v3.football.api-sports.io";

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://frankferra7-cyber.github.io",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Accept, Content-Type",
    "Vary": "Origin"
  };
}

function json(data, status, origin, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extra
    }
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== "GET") {
      return json({ error: "Method not allowed" }, 405, origin);
    }
    if (!ALLOWED_ORIGINS.has(origin)) {
      return json({ error: "Origin not allowed" }, 403, origin);
    }
    let upstreamPath;
    let cacheSeconds = 30;
    let requiredSecret = "API_FOOTBALL_KEY";

    if (url.pathname === "/pitchapi/lineups") {
      const date = url.searchParams.get("date") || "";
      const home = (url.searchParams.get("home") || "").trim();
      const away = (url.searchParams.get("away") || "").trim();
      if (!/^20\d{2}-\d{2}-\d{2}$/.test(date) || !home || !away || home.length > 80 || away.length > 80) return json({ error: "Invalid lineup query" }, 400, origin);
      requiredSecret = "PITCHAPI_KEY";
      upstreamPath = "/v1/date/" + date + "?status=upcoming";
      cacheSeconds = 60;
    } else if (url.pathname === "/fixtures/live") {
      upstreamPath = "/fixtures?live=all";
      cacheSeconds = 15;
    } else if (url.pathname === "/fixtures") {
      const league = url.searchParams.get("league") || "";
      const season = url.searchParams.get("season") || "";
      const date = url.searchParams.get("date") || "";
      const next = url.searchParams.get("next") || "";
      const validDate = /^20\d{2}-\d{2}-\d{2}$/.test(date);
      const validNext = /^([1-9]|1\d|20)$/.test(next);
      if (!ALLOWED_LEAGUES.has(league) || season !== "2026" || !(validDate || (!date && validNext))) {
        return json({ error: "Invalid fixture query" }, 400, origin);
      }
      upstreamPath = "/fixtures?league=" + league + "&season=" + season + (date ? "&date=" + date : "&next=" + next);
      cacheSeconds = 30;
    } else if (url.pathname === "/fixtures/lineups") {
      const fixture = url.searchParams.get("fixture") || "";
      if (!/^\d{1,12}$/.test(fixture)) {
        return json({ error: "Invalid fixture id" }, 400, origin);
      }
      upstreamPath = "/fixtures/lineups?fixture=" + fixture;
      cacheSeconds = 300;
    } else {
      return json({ error: "Not found" }, 404, origin);
    }

    if (!env[requiredSecret]) return json({ error: "Server secret " + requiredSecret + " is not configured" }, 503, origin);

    const cacheUrl = new URL(url.pathname + url.search, "https://worker-cache.invalid");
    const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });
    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      Object.entries(corsHeaders(origin)).forEach(([k, v]) => headers.set(k, v));
      return new Response(cached.body, { status: cached.status, headers });
    }

    try {
      const isPitch = url.pathname === "/pitchapi/lineups";
      const upstream = await fetch((isPitch ? "https://api.pitchapi.dev" : API_ROOT) + upstreamPath, {
        headers: isPitch ? { "X-API-KEY": env.PITCHAPI_KEY, "Accept": "application/json" } : { "x-apisports-key": env.API_FOOTBALL_KEY, "Accept": "application/json" }
      });
      if (!upstream.ok) {
        return json({ error: "Football data provider returned an error", providerStatus: upstream.status }, 502, origin);
      }
      const payload = await upstream.json();
      if (isPitch) {
        if (payload.error) return json({ error: payload.error.message || "PitchAPI error", code: payload.error.code || "PITCHAPI_ERROR" }, upstream.status, origin);
        const matches = payload.data && payload.data.matches || [];
        const norm = value => (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\b(fc|cf|ac|afc|ssc|as|ud|calcio|club)\b/g, "").replace(/[^a-z0-9]/g, "");
        const home = norm(url.searchParams.get("home"));
        const away = norm(url.searchParams.get("away"));
        const match = matches.find(item => norm(item.home_team && item.home_team.name) === home && norm(item.away_team && item.away_team.name) === away);
        if (!match) return json({ error: "Partita non trovata nel calendario PitchAPI per questa data." }, 404, origin);
        const lr = await fetch("https://api.pitchapi.dev/v1/matches/" + encodeURIComponent(match.id) + "/lineups", { headers: { "X-API-KEY": env.PITCHAPI_KEY, "Accept": "application/json" } });
        const lp = await lr.json();
        if (!lr.ok || lp.error) return json({ error: lp.error && lp.error.message || "Formazioni non disponibili", code: lp.error && lp.error.code || "LINEUPS_UNAVAILABLE" }, lr.status, origin);
        const response = json({ match: match, lineups: lp.data }, 200, origin, { "Cache-Control": "public, max-age=" + cacheSeconds });
        ctx.waitUntil(cache.put(cacheKey, response.clone()));
        return response;
      }
      const response = json(payload, 200, origin, { "Cache-Control": "public, max-age=" + cacheSeconds });
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    } catch {
      return json({ error: "Unable to reach football data provider" }, 502, origin);
    }
  }
};
