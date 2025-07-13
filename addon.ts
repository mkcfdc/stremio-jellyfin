import {
  addonBuilder,
  type Args,
  type ContentType,
  type Stream,
} from "stremio-addon-sdk";
import { cleanupSession, JellyfinApi, type JellyfinItem } from "./jellyfin.ts";
import { manifest } from "./manifest.ts";

import { logDebug, logError, logInfo, logWarn } from "./utils/logging.ts";
import { stringToUuid } from "./utils/stringToUuid.ts";
import { itemToMeta } from "./utils/itemToMeta.ts";
import { getTmdbFromImdbId } from "./tmdb.ts";

const ADDON_SERVER = Deno.env.get("ADDON_SERVER")!;
const JELLYFIN_SERVER = Deno.env.get("JELLYFIN_SERVER")!;

export const jellyfin = new JellyfinApi();
try {
  await jellyfin.authenticate();
  logInfo("Jellyfin API client authenticated successfully. Add-on is ready.");
} catch (e) {
  logError(
    "Failed to authenticate with Jellyfin API. Add-on cannot start without authentication.",
    e,
  );
  Deno.exit(1);
}

Deno.addSignalListener("SIGINT", async () => {
  await cleanupSession(jellyfin);
  Deno.exit(0);
});

Deno.addSignalListener("SIGTERM", async () => {
  await cleanupSession(jellyfin);
  Deno.exit(0);
});

logInfo("Building Stremio addon interface.");
const builder = new addonBuilder(manifest);

builder.defineCatalogHandler(async (args: Args) => {
  const { type, id, extra } = args;
  logInfo(
    `Catalog request received: Type=${type}, ID=${id}, Extra=${
      JSON.stringify(extra)
    }`,
  );

  const isMovie = type === "movie";
  const searchTerm = extra.search;
  const skip = extra.skip ? Number(extra.skip) : 0;

  logDebug(
    `Searching Jellyfin for items: isMovie=${isMovie}, searchTerm=${
      searchTerm || "none"
    }, skip=${skip}`,
  );

  try {
    const items = await jellyfin.searchItems(
      skip,
      isMovie,
      searchTerm,
    );
    logInfo(
      `Found ${items.length} items from Jellyfin for catalog ${type}/${id}.`,
    );
    logDebug(
      "Jellyfin items retrieved:",
      items.map((i) => ({ id: i.Id, name: i.Name })),
    );

    const metas = items.map(itemToMeta);
    logDebug("Converted items to MetaPreviews. Returning.");
    return { metas };
  } catch (error) {
    logError(`Error in catalog handler for type=${type}, id=${id}:`, error);
    return { metas: [] };
  }
});

// Helper to build Jellyseerr request links, falling back on IMDB if TMDB is missing
interface RequestLinkOpts {
  tmdbId?: number;
  imdbId: string;
  type: ContentType;
  season?: string;
  episode?: string;
}
function buildRequestLink(
  { tmdbId, imdbId, type, season, episode }: RequestLinkOpts,
): string | null {
  const url = new URL(`${ADDON_SERVER}/jellyseerr/request`);
  // prefer tmdbId, else fallback to imdbId param
  if (tmdbId) url.searchParams.set("tmdbid", tmdbId.toString());
  if (!tmdbId && imdbId){
    return null;
  }

  url.searchParams.set("type", type);
  if (season) url.searchParams.set("season", season);
  if (episode) url.searchParams.set("episode", episode);
  return url.toString();
}

// DRY stream response builder
function makeStreamResponse(opts: {
  url?: string;
  externalUrl?: string;
  name: string;
  description: string;
}) {
  const stream: any = { name: opts.name, description: opts.description };
  if (opts.url) stream.url = opts.url;
  else if (opts.externalUrl) stream.externalUrl = opts.externalUrl;
  return { streams: [stream] };
}

// Simple in-memory cache for TMDB lookups
const tmdbCache = new Map<string, { tmdb_id: number; tmdb_title: string }>();
async function getTmdbCached(imdbId: string, type: ContentType) {
  if (!tmdbCache.has(imdbId)) {
    const data = await getTmdbFromImdbId(imdbId, type);
    if (data) tmdbCache.set(imdbId, data);
  }
  return tmdbCache.get(imdbId);
}

// Handle movies: lookup by external-id fallback
async function handleMovie(id: string): Promise<JellyfinItem | null> {
  const imdbId = id;
  const tmdb = await getTmdbCached(imdbId, "movie");
  if (!tmdb?.tmdb_id) {
    logWarn(`No TMDB mapping for ${imdbId}`);
  }
  return jellyfin.getFullItemByExternalId({
    imdbId,
    tmdbId: tmdb?.tmdb_id,
    type: "movie",
    itemName: tmdb?.tmdb_title,
  });
}

// Handle episodes: map series, then drill into season/episode
async function handleEpisode(id: string): Promise<JellyfinItem | null> {
  const [imdbSeriesId, seasonStr, episodeStr] = id.split(":");
  const tmdb = await getTmdbCached(imdbSeriesId, "series");
  const series = await jellyfin.getFullItemByExternalId({
    imdbId: imdbSeriesId,
    tmdbId: tmdb?.tmdb_id,
    type: "series",
    itemName: tmdb?.tmdb_title,
  });
  if (!series) return null;

  const seasons = await jellyfin.getSeasonsBySeriesId(series.Id);
  const targetSeason = seasons.find((s) => s.IndexNumber === Number(seasonStr));
  if (!targetSeason) return null;

  const episodes = await jellyfin.getEpisodesBySeasonId(
    series.Id,
    targetSeason.Id,
  );
  const targetEp = episodes.find((e) => e.IndexNumber === Number(episodeStr));
  if (!targetEp) return null;

  return jellyfin.getItemById(targetEp.Id);
}

builder.defineStreamHandler(
  async (
    { type, id }: { type: "movie" | "series"; id: string },
  ): Promise<{ streams: Stream[] }> => {
    logInfo(`Stream request received: Type=${type}, ID=${id}`);

    let item: JellyfinItem | null = null;
    let tmdbId: number | undefined;
    let seasonStr: string | undefined;
    let episodeStr: string | undefined;
    let imdbBaseId = id;

    try {
      if (id.includes(":")) {
        // Episode ID format: "imdbSeriesId:season:episode"
        [imdbBaseId, seasonStr, episodeStr] = id.split(":");
        item = await handleEpisode(id);
        const tmdb = await getTmdbCached(imdbBaseId, "series");
        tmdbId = tmdb?.tmdb_id;
      } else {
        item = await handleMovie(id);
        const tmdb = await getTmdbCached(id, type);
        tmdbId = tmdb?.tmdb_id;
      }

      // If a real Jellyfin stream exists
      if (item?.MediaSources?.length) {
        const uuid = stringToUuid(item.Id);
        const sourceId = item.MediaSources[0].Id;
        const token = jellyfin.getAccessToken();
        const url = `${JELLYFIN_SERVER}/videos/${uuid}/stream.mkv?static=true` +
          `&api_key=${token}` +
          `&mediaSourceId=${sourceId}`;
        return makeStreamResponse({
          url,
          name: item.Name,
          description: `Play “${item.Name}” on Jellyfin`,
        });
      }

      // Fallback to a Jellyseerr request link
      return makeStreamResponse({
        externalUrl: buildRequestLink({
          tmdbId,
          imdbId: imdbBaseId,
          type,
          season: seasonStr,
          episode: episodeStr,
        }) || undefined,
        name: `Request on Jellyseerr`,
        description: `Click to queue ${id} in Jellyseerr`,
      });
    } catch (err) {
      logError(`Error in stream handler for ID=${id}:`, err);
      return { streams: [] };
    }
  },
);

logInfo("Exporting Stremio addon interface.");
export const addonInterface = builder.getInterface();
