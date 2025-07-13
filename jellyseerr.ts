import { logDebug } from "./utils/logging.ts";

const API_DOMAIN = Deno.env.get("JELLYSEERR_SERVER") ?? "http://localhost:5055";
const API_BASE = API_DOMAIN.replace(/\/+$/, "") + "/api/v1";
const API_KEY = Deno.env.get("JELLYSEERR_API_KEY")!;

const commonHeaders = {
  "Content-Type": "application/json",
  "X-Api-Key": API_KEY,
};

/**
 * Options for a direct Jellyseerr request via POST /request
 */
interface MovieRequestOptions {
  mediaType: "movie";
  mediaId: number;
  serverId: number;
  is4k: boolean;
  profileId: number;
  rootFolder: string;
  userId: number;
  tag?: string[];
}

interface TvRequestOptions {
  mediaType: "tv";
  mediaId: number;
  serverId: number;
  is4k: boolean;
  profileId: number;
  rootFolder: string;
  userId: number;
  tag?: string[];
  seasons: { seasonNumber: number }[];
  episodes?: { seasonNumber: number; episodeNumber: number }[];
}

export type RequestByTmdbOpts = MovieRequestOptions | TvRequestOptions;

export function buildTmdbRequest(opts: RequestByTmdbOpts): Record<string, any> {
  if (opts.mediaType === "movie") {
    return {
      mediaType: "movie",
      mediaId: opts.mediaId,
      serverId: opts.serverId,
      is4k: opts.is4k,
      profileId: opts.profileId,
      rootFolder: opts.rootFolder,
      userId: opts.userId,
      tag: opts.tag,
    };
  } else {
    return {
      mediaType: "tv",
      mediaId: opts.mediaId,
      serverId: opts.serverId,
      is4k: opts.is4k,
      profileId: opts.profileId,
      rootFolder: opts.rootFolder,
      userId: opts.userId,
      tag: opts.tag,
      seasons: opts.seasons,
      episodes: opts.episodes,
    };
  }
}

/**
 * Direct POST /request call using TMDB IDs and full options.
 */
export async function requestByTmdb(opts: RequestByTmdbOpts) {
  const res = await fetch(`${API_BASE}/request`, {
    method: "POST",
    headers: commonHeaders,
    body: JSON.stringify(opts),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON from /request: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const msg = json.message ?? res.statusText;
    throw new Error(`Request failed: ${res.status} ${msg}`);
  }
  logDebug(`${opts.mediaId} has been successfully added to Jellyseerr.`);
  return { success: true, message: `${opts.mediaId} has been requested.`};
}

// --- Example CLI Usage ---
if (import.meta.main) {
  try {
    console.log("Direct 4K movie request example...");
    const example = await requestByTmdb({
      mediaId: 1087192,
      mediaType: "movie",
      is4k: false,
      serverId: 0,
      profileId: 0,
      rootFolder: "/movies",
      userId: 1,
      tag: [],
    });
    console.log("Response:", example);
  } catch (err) {
    console.error(err);
    Deno.exit(1);
  }
}
