import { logDebug } from "./logging.ts";
import { type JellyfinItem } from "../jellyfin.ts";
import { fetchTmdbData } from "../tmdb.ts";
import { type MetaPreview, type ContentType } from "stremio-addon-sdk";

export async function itemToMeta(item: JellyfinItem): Promise<MetaPreview> {
  logDebug(`Converting Jellyfin item "${item.Name}" (ID: ${item.Id}) to MetaPreview.`);

  const { imdbId, posterPath, backdropPath } = await fetchTmdbData(item);

  const meta: MetaPreview = {
    id: imdbId,
    type: item.Type.toLowerCase() as ContentType,
    name: item.Name,
    poster: posterPath,
    background: backdropPath,
    genres: item.Genres,
    releaseInfo: item.ProductionYear ? String(item.ProductionYear) : undefined,
  };

  logDebug('MetaPreview generated:', meta);
  return meta;
}