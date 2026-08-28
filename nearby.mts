import type { Context, Config } from "@netlify/functions";

// Server-to-server proxy for Overpass (OSM) queries.
// overpass-api.de does not send Access-Control-Allow-Origin headers, so the
// browser can never call it directly from bermverhalen.netlify.app — every
// such fetch is blocked by CORS. Calling it from here instead (server side,
// same-origin from the browser's point of view) sidesteps that entirely.

const CATEGORY_CLAUSES = [
  'node["tourism"="artwork"]',
  'node["historic"="monument"]',
  'node["historic"="memorial"]',
  'node["tourism"="viewpoint"]',
  'node["tourism"="museum"]',
  'node["historic"="castle"]',
  'node["historic"="ruins"]',
  'node["historic"="church"]',
  'node["historic"="archaeological_site"]',
  'node["natural"="tree"]["monument"="yes"]'
];

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));
  const radiusParam = Number(url.searchParams.get("radius"));
  const radius = Number.isFinite(radiusParam) && radiusParam > 0 ? Math.min(radiusParam, 2000) : 600;

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return new Response(JSON.stringify({ error: "invalid lat/lon" }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }

  const clauses = CATEGORY_CLAUSES.map((c) => `${c}(around:${radius},${lat},${lon});`).join("\n");
  const query = `[out:json][timeout:15];(${clauses});out body 40;`;
  const overpassUrl = "https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(query);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 9000);

  try {
    const resp = await fetch(overpassUrl, {
      headers: { accept: "application/json" },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!resp.ok) {
      // Fail soft: the app just treats "no POIs this query" as normal.
      return new Response(JSON.stringify({ elements: [] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    const data = await resp.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  } catch (err) {
    clearTimeout(timeoutId);
    return new Response(JSON.stringify({ elements: [] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }
};

export const config: Config = {
  path: "/.netlify/functions/nearby"
};
