// deno-lint-ignore-file no-explicit-any
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
interface BaseRequestOptions {
  mediaId: number;
  serverId: number;
  is4k: boolean;
  profileId: number;
  rootFolder: "/movies" | "/tv";
  userId: number;
  tag?: string[];
}

// movie‐only payload
export interface MovieRequestOptions extends BaseRequestOptions {
  mediaType: "movie";
}

export interface TvRequestOptions extends BaseRequestOptions {
  mediaType: "tv";
  seasons?: { seasonNumber: number }[];
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
  return { success: true, message: `${opts.mediaId} has been requested.` };
}

// 1) Mirror the raw JSON shape
interface RawRequest {
  id: number;
  media: {
    tmdbId: number;               // note: the API field is tmdbId, not tmdb
    mediaType: string;
    downloadStatus: (number | string)[]; // often an empty array, or [ETA, status, timeLeft]
    [key: string]: any;
  };
  [key: string]: any;
}

// 2) What you show in the “list” endpoint
export interface SimpleRequest {
  id: number;
  media: {
    tmdb: number;      // mapped from media.tmdbId
    mediaType: string;
  };
}

// 3) What you show in the “detail” endpoint
export interface DetailedRequest {
  id: number;
  media: {
    tmdb: number;                     // still media.tmdbId underneath
    mediaType: string;
    estimatedCompletionTime?: number | string;
    status:                 string | number;
    timeLeft?:               number | string;
    size?: string;
    sizeLeft?: string;
  };
}

export async function currentRequests(
  id?: number
): Promise<
  SimpleRequest[] |
  DetailedRequest |
  { status: "failed"; message: string }
> {
  // Build URL
  const url = id !== undefined
    ? `${API_BASE}/request/${id}`
    : `${API_BASE}/request`;

  const res = await fetch(url, { headers: commonHeaders });
  if (!res.ok) {
    return { status: "failed", message: "Bad response from Jellyseerr." };
  }

  const raw = await res.json();

  // DETAIL case
  if (id !== undefined) {
    // Normalize raw into an array
    const items: RawRequest[] = Array.isArray(raw.results)
      ? raw.results
      : raw.id !== undefined
        ? [raw]
        : [];

    const item = items.find(r => r.id === id);
    if (!item) {
      return { status: "failed", message: `No request found for id ${id}` };
    }

    // === normalize downloadStatus ===
    let eta: string | undefined;
    let status: string | number = item.media.status;
    let timeLeft: string | undefined;
    let size: string = "0";
    let sizeLeft: string = "0";

    const ds = item.media.downloadStatus ?? [];
    if (ds.length > 0) {
      const first = ds[0];
      if (typeof first === "object" && first !== null) {
        // shape: { estimatedCompletionTime, status, timeLeft, … }
        eta        = (first as any).estimatedCompletionTime;
        status     = (first as any).status;
        timeLeft   = (first as any).timeLeft;
        size       = (first as any).size;
        sizeLeft   = (first as any).sizeLeft;
      }
    }

    return {
      id: item.id,
      media: {
        tmdb:                     item.media.tmdbId,
        mediaType:                item.media.mediaType,
        estimatedCompletionTime:  eta,
        status:                   status,
        timeLeft:                 timeLeft,
        size:                     size,
        sizeLeft:                 sizeLeft,
      },
    };
  }

  // LIST case
  const list: RawRequest[] = Array.isArray(raw)
    ? raw
    : Array.isArray(raw.results)
      ? raw.results
      : [];

  return list.map(({ id: reqId, media }) => ({
    id: reqId,
    media: {
      tmdb:      media.tmdbId,
      mediaType: media.mediaType,
    },
  }));
}

