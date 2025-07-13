import { logDebug } from "./logging.ts";
import { type JellyfinItem, server } from "../jellyfin.ts";
import { fetchTmdbData } from "../tmdb.ts";
import { type MetaPreview, type ContentType } from "stremio-addon-sdk";

const getFallbackMeta = (item: JellyfinItem): MetaPreview => ({
  id: item.Id,
  type: item.Type.toLowerCase() as ContentType,
  name: item.Name || 'Unknown',
  poster: `${server}/Items/${item.Id}/Images/Primary`,
  background: item.Type === 'Series' ? `${server}/Items/${item.Id}/Images/Backdrop` : undefined,
  genres: item.Genres || [],
  releaseInfo: item.ProductionYear ? String(item.ProductionYear) : undefined,
});

export async function itemToMeta(item: JellyfinItem): Promise<MetaPreview> {
  logDebug(`Converting Jellyfin item "${item.Name}" (ID: ${item.Id}) to MetaPreview.`);

  // Validate input
  if (!item.Id || !item.Name || !item.Type) {
    logDebug(`Returning fallback MetaPreview for invalid item: ID=${item.Id}, Name=${item.Name}, Type=${item.Type}`);
    return getFallbackMeta(item);
  }

  const tmdbData = await fetchTmdbData(item);

  const meta: MetaPreview = {
    id: tmdbData.imdbId || item.ProviderIds?.Imdb || item.Id,
    type: item.Type.toLowerCase() as ContentType,
    name: item.Name,
    poster: tmdbData.posterPath || `${server}/Items/${item.Id}/Images/Primary`,
    background: tmdbData.backdropPath || (item.Type === 'Series' ? `${server}/Items/${item.Id}/Images/Backdrop` : undefined),
    genres: item.Genres || [],
    releaseInfo: item.ProductionYear ? String(item.ProductionYear) : undefined,
  };

  logDebug('MetaPreview generated:', meta);
  return meta;
}