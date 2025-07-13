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

const jellyfin = new JellyfinApi();
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

  let actualJellyfinItem: JellyfinItem | null = null;
  let requestedImdbId: string | null = null;

  try {
    if (id.includes(":")) {
      // This is an episode request: imdbId:seasonNumber:episodeNumber
      logInfo(`Handling episode stream request for complex ID: ${id}`);
      const [imdbSeriesId, seasonStr, episodeStr] = id.split(":");
      requestedImdbId = imdbSeriesId; 
      const season = Number(seasonStr);
      const episode = Number(episodeStr);

      logDebug(`Parsed episode request: IMDB Series ID=${imdbSeriesId}, Season=${season}, Episode=${episode}`);

      const seriesSearchResult = await jellyfin.getFullItemByImdbId(imdbSeriesId, type);
      if (!seriesSearchResult || !seriesSearchResult.ProviderIds.Imdb) {
        logWarn(`Series search result not found for IMDB ID: ${imdbSeriesId}. Cannot get episode stream.`);
        return { streams: [] };
      }

      logDebug(`Found Jellyfin Series ItemId: ${seriesSearchResult.Id} for IMDB ID: ${imdbSeriesId}`);
      const seriesItem = await jellyfin.getItemById(seriesSearchResult.Id);

      if (!seriesItem) {
        logWarn(`Full series item not found for Jellyfin ID: ${seriesSearchResult.Id}. Cannot get episode stream.`);
        return { streams: [] };
      }
      logDebug(`Retrieved full series item: "${seriesItem.Name}" (ID: ${seriesItem.Id})`);

      const seasons = await jellyfin.getSeasonsBySeriesId(seriesItem.Id);
      const seasonItem = seasons.find(s => s.IndexNumber === season);
      if (!seasonItem) {
        logWarn(`Season ${season} not found for series ID: ${seriesItem.Id}. Available seasons: ${seasons.map(s => s.IndexNumber).join(', ')}`);
        return { streams: [] };
      }
      logDebug(`Found season item: "${seasonItem.Name}" (ID: ${seasonItem.Id}, Index: ${seasonItem.IndexNumber})`);

      const episodes = await jellyfin.getEpisodesBySeasonId(seriesItem.Id, seasonItem.Id);
      const episodeItem = episodes.find(ep => ep.IndexNumber === episode);
      if (!episodeItem) {
        logWarn(`Episode ${episode} not found for season ID: ${seasonItem.Id}. Available episodes: ${episodes.map(ep => ep.IndexNumber).join(', ')}`);
        return { streams: [] };
      }
      logDebug(`Found episode item: "${episodeItem.Name}" (ID: ${episodeItem.Id}, Index: ${episodeItem.IndexNumber})`);

      actualJellyfinItem = await jellyfin.getItemById(episodeItem.Id);
      logDebug(`Retrieved actual Jellyfin item for episode: "${actualJellyfinItem?.Name}" (ID: ${actualJellyfinItem?.Id})`);

    } else {
      logInfo(`Handling movie stream request for IMDB ID: ${id}`);
      requestedImdbId = id;
      actualJellyfinItem = await jellyfin.getFullItemByImdbId(id, type);
      logDebug(`Retrieved actual Jellyfin item for movie: "${actualJellyfinItem?.Name}" (ID: ${actualJellyfinItem?.Id})`);

      if (actualJellyfinItem && actualJellyfinItem.ProviderIds?.Imdb !== requestedImdbId) {
        logWarn(`IMDB ID mismatch for movie. Requested: ${requestedImdbId}, Found: ${actualJellyfinItem.ProviderIds?.Imdb}. Not displaying stream.`);
        return { streams: [] };
      }
    }

    if (!actualJellyfinItem) {
      logWarn(`No Jellyfin item found for stream request ID: ${id}.`);
      return { streams: [] };
    }

    if (!actualJellyfinItem.MediaSources?.length) {
      logWarn(`Jellyfin item "${actualJellyfinItem.Name}" (ID: ${actualJellyfinItem.Id}) has no media sources. Cannot stream.`);
      return { streams: [] };
    }

    const itemUuid = stringToUuid(actualJellyfinItem.Id);
    const src = actualJellyfinItem.MediaSources[0]; // Assuming the first media source is the one we want

    if (itemUuid && src.Id) {
      const accessToken = jellyfin.getAccessToken();
      const streamUrl = `${server}/videos/${itemUuid}/stream.mkv?static=true`
        + `&api_key=${accessToken}`
        + `&mediaSourceId=${src.Id}`;

      const stream: Stream = {
        url: streamUrl,
        name: "Jellyfin",
        description: actualJellyfinItem.Name + " " + src.MediaStreams?.[0]?.DisplayTitle,
      };
      logInfo(`Generated stream for "${actualJellyfinItem.Name}". URL: ${streamUrl.substring(0, 100)}... (truncated for log)`);
      return { streams: [stream] };
    } else {
      logWarn(`Could not construct stream URL for item ID: ${id}. Missing item UUID or source ID.`);
      return { streams: [] };
    }

  } catch (error) {
    logError(`Unhandled error in stream handler for ID ${id}:`, error);
    return { streams: [] };
  }
});

logInfo("Exporting Stremio addon interface.");
export const addonInterface = builder.getInterface();