const ALLOWED_ORIGINS = new Set([
  "https://frankferra7-cyber.github.io"
]);
const ALLOWED_LEAGUES = new Set(["39", "135", "140"]);
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
    if (!env.API_FOOTBALL_KEY) {
      return json({ error: "Server API key is not configured" }, 503, origin);
    }

    let upstreamPath;
    let cacheSeconds = 30;

    if (url.pathname === "/fixtures") {
      const league = url.searchParams.get("league") || "";
      const season = url.searchParams.get("season") || "";
      const date = url.searchParams.get("date") || "";
      if (!ALLOWED_LEAGUES.has(league) || season !== "2026" || !/^2026-11-\d{2}$/.test(date)) {
        return json({ error: "Invalid fixture query" }, 400, origin);
      }
      upstreamPath = "/fixtures?league=" + league + "&season=" + season + "&date=" + date;
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
      const upstream = await fetch(API_ROOT + upstreamPath, {
        headers: { "x-apisports-key": env.API_FOOTBALL_KEY, "Accept": "application/json" }
      });
      if (!upstream.ok) {
        return json({ error: "Football data provider returned an error", providerStatus: upstream.status }, 502, origin);
      }
      const payload = await upstream.json();
      const response = json(payload, 200, origin, { "Cache-Control": "public, max-age=" + cacheSeconds });
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    } catch {
      return json({ error: "Unable to reach football data provider" }, 502, origin);
    }
  }
};
