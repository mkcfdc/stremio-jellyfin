import { logDebug } from "./logging.ts";
import { type JellyfinItem, server } from "../jellyfin.ts";
import { type MetaPreview, type ContentType } from "stremio-addon-sdk";

export function itemToMeta(item: JellyfinItem): MetaPreview {
  logDebug(`Converting Jellyfin item "${item.Name}" (ID: ${item.Id}) to MetaPreview.`);
  const meta: MetaPreview = {
    id: item.ProviderIds.Imdb || item.Id,
    type: item.Type.toLowerCase() as ContentType, 
    name: item.Name,
    poster: `${server}/Items/${item.Id}/Images/Primary`,
    background: item.Type === 'Series' ? `${server}/Items/${item.Id}/Images/Backdrop` : undefined,
    genres: item.Genres,
    releaseInfo: item.ProductionYear ? String(item.ProductionYear) : undefined,
  };
  logDebug("MetaPreview generated:", meta);
  return meta;
}