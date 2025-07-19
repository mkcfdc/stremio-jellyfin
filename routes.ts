// deno-lint-ignore-file no-explicit-any

import { fromFileUrl, join } from "@std/path";
import { serveDir } from "@std/http/file-server";

import { addonInterface, jellyfin } from "./addon.ts";
import {
  buildTmdbRequest,
  currentRequests,
  requestByTmdb,
  type RequestByTmdbOpts,
} from "./jellyseerr.ts";
import { fetchTmdbData } from "./tmdb.ts";
import { type JellyfinItem } from "./jellyfin.ts";
import { logDebug } from "./utils/logging.ts";

const frontendPath = fromFileUrl(new URL("./frontend/dist", import.meta.url));
const DEV_MODE = Deno.env.get("DENO_ENV") !== "production";
const JELLYFIN_SERVER = Deno.env.get("JELLYFIN_SERVER");
const API_KEY = jellyfin.getAccessToken();

export function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set(
    "Access-Control-Allow-Methods",
    "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
  );
  headers.set("Access-Control-Allow-Credentials", "true");
  return new Response(res.body, { status: res.status, headers });
}

export async function handleJellyseerrTmdbRequest(
  _req: Request,
  tmdbId: number,
): Promise<Response> {
  // 1) Validate tmdbId
  if (!Number.isFinite(tmdbId)) {
    return withCors(
      new Response(
        JSON.stringify({ error: "Invalid tmdbid parameter" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
  }

  try {
    // 2) Fetch all current requests
    const list = await currentRequests(); // → SimpleRequest[] | {status:"failed",...}

    if (!Array.isArray(list)) {
      // upstream failure
      return withCors(
        new Response(JSON.stringify(list), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }

    // 3) Find the one with matching tmdb
    const found = list.find((r) => r.media.tmdb === tmdbId);
    if (!found) {
      return withCors(
        new Response(
          JSON.stringify({ error: `No request found for tmdbid ${tmdbId}` }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    }

    // 4) Fetch its detailed info
    const detail = await currentRequests(found.id); // → DetailedRequest | failure

    if ("status" in detail && detail.status === "failed") {
      // detailed lookup failed
      return withCors(
        new Response(JSON.stringify(detail), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }

    // build a false jellyfin object
    const jellyObj: Partial<JellyfinItem> = {
      Id: "fuck",
      ProviderIds: { Tmdb: String(tmdbId) },
      Type: "movie",
    };

    const tmdbData = await fetchTmdbData(jellyObj);
    const newObj = { ...detail, ...tmdbData };

    // 5) Success!
    return withCors(
      new Response(JSON.stringify(newObj), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  } catch (err: any) {
    console.error("handleJellyseerrTmdbRequest error:", err);
    return withCors(
      new Response(
        JSON.stringify({ error: err.message || "Internal server error" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
  }
}

// Handler: /jellyseerr/request
export async function handleJellyseerrRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const tmdbIdParam = url.searchParams.get("tmdbid");
  const mediaType = url.searchParams.get("type") as "movie" | "tv";
  const seasonStr = url.searchParams.get("season");
  const episodeStr = url.searchParams.get("episode");

  // Validate tmdbId
  const tmdbId = tmdbIdParam ? Number(tmdbIdParam) : NaN;
  if (isNaN(tmdbId)) {
    return withCors(
      new Response(JSON.stringify({ error: "Invalid or missing tmdbid" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }

  // Validate mediaType
  if (mediaType !== "movie" && mediaType !== "tv") {
    return withCors(
      new Response(JSON.stringify({ error: "type must be 'movie' or 'tv'" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }

  try {
    // 1) Check existing requests
    const list = await currentRequests(); // -> SimpleRequest[]
    if (Array.isArray(list)) {
      const existing = list.find((r) => r.media.tmdb === tmdbId);
      const frontend = DEV_MODE ? `http://localhost:5173` : ``;
      if (existing) {
        return withCors(
          new Response(null, {
            status: 302,
            headers: {
              Location: `${frontend}/request/${tmdbId}`,
            },
          }),
        );
      }
    }

    // 2) Build a new request payload
    const opts: RequestByTmdbOpts = {
      mediaType,
      mediaId: tmdbId,
      serverId: 0,
      is4k: false,
      profileId: 3,
      rootFolder: mediaType === "movie" ? "/movies" : "/tv",
      userId: 1,
    };

    if (mediaType === "tv") {
      const seasonNum = Number(seasonStr);
      if (isNaN(seasonNum)) throw new Error("Missing or invalid season for TV");
      opts.seasons = [{ seasonNumber: seasonNum }];
      if (episodeStr) {
        const epNum = Number(episodeStr);
        if (isNaN(epNum)) throw new Error("Invalid episode number");
        opts.episodes = [{ seasonNumber: seasonNum, episodeNumber: epNum }];
      }
    }

    const payload = buildTmdbRequest(opts);
    const _result = await requestByTmdb(payload);
    const frontend = DEV_MODE ? `http://localhost:5173` : ``;

    return withCors(
      new Response(null, {
        status: 302,
        headers: {
          Location: `${frontend}/request/${tmdbId}`,
        },
      }),
    );
  } catch (err: any) {
    console.error("Jellyseerr route error:", err);
    return withCors(
      new Response(
        JSON.stringify({ error: err.message ?? "Internal server error" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
  }
}

// Handler: /manifest.json
export async function handleManifest(_req: Request): Promise<Response> {
  return withCors(
    new Response(JSON.stringify(addonInterface.manifest), {
      headers: { "Content-Type": "application/json" },
    }),
  );
}

// Handler: /catalog/:type/:id.json
export async function handleCatalog(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const [, type, id] = url.pathname.match(
    /^\/catalog\/([^/]+)\/([^/]+)\.json$/,
  )!;
  const catalog = await addonInterface.get("catalog", type, id, {});
  return withCors(
    new Response(JSON.stringify(catalog), {
      headers: { "Content-Type": "application/json" },
    }),
  );
}

// Handler: /stream/:type/:id.json
export async function handleStream(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const [, type, id] = url.pathname.match(
    /^\/stream\/([^/]+)\/([^/]+)\.json$/,
  )!;
  const streamData = await addonInterface.get("stream", type, id, {});
  return withCors(
    new Response(JSON.stringify(streamData), {
      headers: { "Content-Type": "application/json" },
    }),
  );
}

// Main router
export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return withCors(new Response(null, { status: 204 }));
  }

  const url = new URL(req.url);
  const path = url.pathname;

  if (
    Deno.env.get("JELLYSEERR_SERVER") && Deno.env.get("JELLYSEERR_API_KEY") &&
    Deno.env.get("ADDON_SERVER")
  ) {
    if (path === "/jellyseerr/request" && req.method === "GET") {
      return handleJellyseerrRequest(req);
    }
    const detailMatch = path.match(/^\/jellyseerr\/request\/(\d+)$/);
    if (detailMatch && req.method === "GET") {
      const id = Number(detailMatch[1]);
      return await handleJellyseerrTmdbRequest(req, id);
    }
  }

  if (url.pathname === "/jf/stream" && req.method === "GET") {
    // this increases bandwidth usage but, it also keeps your access token safe... so the security trade off is worth it.
    // doing it this way also removes the need for a public facing Jellyfin instance! Huge bonus!!
    // You could run your AARS stack behind Tailscale.
    const uuid          = url.searchParams.get("uuid");
    const mediaSourceId = url.searchParams.get("mediaSourceId");
    if (!uuid || !mediaSourceId) {
      return new Response("Missing parameters", { status: 400 });
    }

    const rangeHeader = req.headers.get("range") ?? undefined; 
    const fetchHeaders: Record<string, string> = {};
    if (rangeHeader) fetchHeaders["range"] = rangeHeader;

    const jellyfinUrl = `${JELLYFIN_SERVER}/videos/${uuid}/stream.mkv` +
                        `?static=true&api_key=${API_KEY}` +
                        `&mediaSourceId=${mediaSourceId}`;
    const upstreamRes = await fetch(jellyfinUrl, { headers: fetchHeaders });

    const headers = new Headers(upstreamRes.headers);             
    headers.set("Accept-Ranges", "bytes");                       
    headers.set("Access-Control-Allow-Origin", "*");    

    logDebug(`Streaming ${uuid} from Jellyfin. (Proxied)`);
    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers,
    });
  }
  if (path === "/manifest.json" && req.method === "GET") {
    return handleManifest(req);
  }
  if (/^\/catalog\/.+\/.+\.json$/.test(path) && req.method === "GET") {
    return handleCatalog(req);
  }
  if (/^\/stream\/.+\/.+\.json$/.test(path) && req.method === "GET") {
    return handleStream(req);
  }

  // Serve frontend fallback
  const fileResponse = await serveDir(req, {
    fsRoot: frontendPath,
    quiet: true,
    showDirListing: false,
  });
  if (fileResponse.status !== 404) {
    return withCors(fileResponse);
  }

  try {
    const indexHtml = await Deno.readFile(join(frontendPath, "index.html"));
    return withCors(
      new Response(indexHtml, {
        headers: { "Content-Type": "text/html" },
      }),
    );
  } catch (err) {
    console.error("Error loading index.html:", err);
    return new Response("index.html not found", { status: 500 });
  }
}
