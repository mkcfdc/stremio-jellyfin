import { addonInterface } from "./addon.ts";
import {
  buildTmdbRequest,
  requestByTmdb,
  type RequestByTmdbOpts,
} from "./jellyseerr.ts";

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

// Handler: /jellyseerr/request
export async function handleJellyseerrRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const tmdbId = Number(url.searchParams.get("tmdbid"));
  const mediaType = url.searchParams.get("type") as "movie" | "tv";
  const seasonStr = url.searchParams.get("season");
  const episodeStr = url.searchParams.get("episode");

  if (!tmdbId) {
    return withCors(
      new Response(
        JSON.stringify({ error: "Invalid or missing tmdbid" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    );
  }
  if (mediaType !== "movie" && mediaType !== "tv") {
    return withCors(
      new Response(
        JSON.stringify({ error: "type must be 'movie' or 'tv'" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    );
  }

  try {
    let opts: RequestByTmdbOpts;
    if (mediaType === "movie") {
      opts = {
        mediaType: "movie",
        mediaId: tmdbId,
        serverId: 0,
        is4k: false,
        profileId: 3,
        rootFolder: "/movies",
        userId: 1,
      };
    } else {
      if (!seasonStr || isNaN(Number(seasonStr))) {
        throw new Error("Missing or invalid season for TV request");
      }
      const seasonNum = Number(seasonStr);
      const seasons = [{ seasonNumber: seasonNum }];
      const episodes = episodeStr
        ? [{ seasonNumber: seasonNum, episodeNumber: Number(episodeStr) }]
        : undefined;

      opts = {
        mediaType: "tv",
        mediaId: tmdbId,
        serverId: 0,
        is4k: false,
        profileId: 3,
        rootFolder: "/tv",
        userId: 1,
        seasons,
        episodes,
      };
    }

    const payload = buildTmdbRequest(opts);
    const result = await requestByTmdb(payload);

    return withCors(
      new Response(
        JSON.stringify(result),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
  } catch (err: any) {
    console.error("Jellyseerr route error:", err);
    return withCors(
      new Response(
        JSON.stringify({ error: err.message ?? "Internal error" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      ),
    );
  }
}

// Handler: /manifest.json
export async function handleManifest(req: Request): Promise<Response> {
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

  const path = new URL(req.url).pathname;
  
  if (Deno.env.get("JELLYSEERR_SERVER") && Deno.env.get("JELLYSEERR_API_KEY") && Deno.env.get("ADDON_SERVER")) {
    if (path === "/jellyseerr/request" && req.method === "GET") {
      return handleJellyseerrRequest(req);
    }
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

  return withCors(
    new Response(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    }),
  );
}
