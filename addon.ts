import {
  addonBuilder,
  type Args,
  type ContentType,
  type Stream,
} from "stremio-addon-sdk";
import { JellyfinApi, server, type JellyfinItem, cleanupSession } from "./jellyfin.ts";
import { manifest } from "./manifest.ts";

import { logDebug, logError, logInfo, logWarn } from "./utils/logging.ts";
import { stringToUuid } from "./utils/stringToUuid.ts";
import { itemToMeta } from "./utils/itemToMeta.ts";
import { getTmdbFromImdbId } from "./tmdb.ts";

export const jellyfin = new JellyfinApi();
try {
    await jellyfin.authenticate();
    logInfo("Jellyfin API client authenticated successfully. Add-on is ready.");
} catch (e) {
    logError("Failed to authenticate with Jellyfin API. Add-on cannot start without authentication.", e);
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
  logInfo(`Catalog request received: Type=${type}, ID=${id}, Extra=${JSON.stringify(extra)}`);

  const isMovie = type === "movie";
  const searchTerm = extra.search;
  const skip = extra.skip ? Number(extra.skip) : 0;

  logDebug(`Searching Jellyfin for items: isMovie=${isMovie}, searchTerm=${searchTerm || 'none'}, skip=${skip}`);

  try {
    const items = await jellyfin.searchItems(
      skip,
      isMovie,
      searchTerm,
    );
    logInfo(`Found ${items.length} items from Jellyfin for catalog ${type}/${id}.`);
    logDebug("Jellyfin items retrieved:", items.map(i => ({ id: i.Id, name: i.Name })));

    const metas = items.map(itemToMeta);
    logDebug("Converted items to MetaPreviews. Returning.");
    return { metas };
  } catch (error) {
    logError(`Error in catalog handler for type=${type}, id=${id}:`, error);
    return { metas: [] };
  }
});

builder.defineStreamHandler(async (args: { type: ContentType; id: string }) => {
  const { type, id } = args;
  logInfo(`Stream request received: Type=${type}, ID=${id}`);

  // Helper to build the fallback request‐link URL
  function buildRequestLink(tmdbId: number, season?: string, episode?: string) {
    const url = new URL(`${Deno.env.get("ADDON_SERVER")}:${Deno.env.get("PORT")}/jellyseerr/request`);
    url.searchParams.set("tmdbid",  tmdbId.toString());
    url.searchParams.set("type",    type);
    if (season)  url.searchParams.set("season",  season);
    if (episode) url.searchParams.set("episode", episode);
    return url.toString();
  }

  try {
    let actualItem: JellyfinItem | null = null;
    let tmdbId: number | undefined;
    let seasonStr: string | undefined;
    let episodeStr: string | undefined;

    if (id.includes(":")) {
      // ——— Episode flow ———
      // ID format: "{imdbSeriesId}:{seasonNumber}:{episodeNumber}"
      const [imdbSeriesId, sStr, eStr] = id.split(":");
      seasonStr  = sStr;
      episodeStr = eStr;

      // Map to TMDB so we can build a request-link later
      const tmdb = await getTmdbFromImdbId(imdbSeriesId, type);
      tmdbId = tmdb?.tmdb_id;
      if (!tmdbId) {
        logWarn(`Cannot map IMDB ${imdbSeriesId} → TMDB`);
      }

      // 1) find the series in Jellyfin
      const seriesPreview = await jellyfin.getFullItemByImdbId(imdbSeriesId, type, tmdb?.tmdb_title);
      if (seriesPreview?.ProviderIds?.Imdb !== imdbSeriesId) {
        logWarn(`Series not in Jellyfin: IMDB=${imdbSeriesId}`);
      } else {
        // 2) fetch the full series object
        const seriesItem = await jellyfin.getItemById(seriesPreview.Id);
        if (seriesItem) {
          // 3) locate the correct season
          const seasons = await jellyfin.getSeasonsBySeriesId(seriesItem.Id);
          const seasonNum = Number(sStr);
          const seasonItem = seasons.find(s => s.IndexNumber === seasonNum);
          if (seasonItem) {
            // 4) locate the episode
            const eps = await jellyfin.getEpisodesBySeasonId(seriesItem.Id, seasonItem.Id);
            const episodeNum = Number(eStr);
            const epItem = eps.find(e => e.IndexNumber === episodeNum);
            if (epItem) {
              actualItem = await jellyfin.getItemById(epItem.Id);
            }
          }
        }
      }
    } else {
      // ——— Movie flow ———
      const imdbId = id;
      const tmdb    = await getTmdbFromImdbId(imdbId, type);
      tmdbId = tmdb?.tmdb_id;
      if (!tmdbId) logWarn(`Cannot map IMDB ${imdbId} → TMDB`);

      actualItem = await jellyfin.getFullItemByImdbId(imdbId, type, tmdb?.tmdb_title);
    }

    // ——— If we have a real stream, return it ———
    if (actualItem?.MediaSources?.length) {
      const uuid      = stringToUuid(actualItem.Id);
      const sourceId  = actualItem.MediaSources[0].Id;
      const token     = jellyfin.getAccessToken();
      const streamUrl =
        `${server}/videos/${uuid}/stream.mkv?static=true` +
        `&api_key=${token}` +
        `&mediaSourceId=${sourceId}`;

      return {
        streams: [{
          url:         streamUrl,
          name:        actualItem.Name,
          description: `Play “${actualItem.Name}” on Jellyfin`,
        }],
      };
    }

    // ——— Otherwise, return the “Request on Jellyseerr” link ———
    if (tmdbId && Deno.env.get("JELLYSEERR_SERVER") && Deno.env.get("JELLYSEERR_API_KEY") && Deno.env.get("ADDON_SERVER")) {
      const link = buildRequestLink(tmdbId, seasonStr, episodeStr);
      logInfo(`Content not found—returning request-link: ${link}`);
      return {
        streams: [{
          externalUrl:         link,
          name:        `Request on Jellyseerr`,
          description: `Click to queue ${id} in Jellyseerr`,
        }],
      };
    } else {
      return { streams: [] };
    }
  }
  catch (err: any) {
    logError(`Error in stream handler for ID=${id}:`, err);
    return { streams: [] };
  }
});


logInfo("Exporting Stremio addon interface.");
export const addonInterface = builder.getInterface();