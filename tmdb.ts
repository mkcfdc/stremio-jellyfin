import { logError, logInfo, logWarn, logDebug } from "./utils/logging.ts";
import { type JellyfinItem, server } from "./jellyfin.ts";

const TMDB_API_BASE_URL = ' https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/';
const TMDB_API_KEY = Deno.env.get("TMDB_API_KEY");

if(!TMDB_API_KEY){
    logError("MISSING TMDB_API_KEY!");
    Deno.exit(0);
}

export interface TmdbMovieSearchResult {
  id: number;
  imdb_id: string; // The IMDB ID for the movie
  title: string; // The movie name
  // ... other properties you might get
}

export interface TmdbSeriesSearchResult {
  id: number;
  imdb_id: string; // The IMDB ID for the series
  name: string; // The series name
  // ... other properties you might get
}

export interface TmdbInfo {
  tmdb_id: number;
  tmdb_title: string;
}

export async function getTmdbFromImdbId(
  imdbId: string,
  type: "movie" | "series"
): Promise<TmdbInfo | null> {
  try {
    const url = `${TMDB_API_BASE_URL}/find/${imdbId}` +
                `?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`TMDB API error for ${imdbId}: ${response.statusText}`);
      return null;
    }
    const data: any = await response.json();
    if (type === "movie" && Array.isArray(data.movie_results) && data.movie_results.length > 0) {
      const m = data.movie_results[0];
      console.info(`TMDB: Found movie ${m.title} (ID ${m.id}) for IMDB ${imdbId}`);
      return { tmdb_id: m.id.toString(), tmdb_title: m.title };
    }
    if (type === "series" && Array.isArray(data.tv_results) && data.tv_results.length > 0) {
      const s = data.tv_results[0];
      console.info(`TMDB: Found series ${s.name} (ID ${s.id}) for IMDB ${imdbId}`);
      return { tmdb_id: s.id.toString(), tmdb_title: s.name };
    }
    console.warn(`TMDB: No ${type} result for IMDB ${imdbId}`);
    return null;
  } catch (error) {
    console.error(`TMDB: Error fetching IMDB ${imdbId}:`, error);
    return null;
  }
}

export async function fetchTmdbData(item: JellyfinItem): Promise<{ imdbId?: string; posterPath?: string; backdropPath?: string }> {
  try {
    let tmdbId = item.ProviderIds.Tmdb;
    let response;

    if (tmdbId) {
      // Fetch directly by TMDB ID
      const endpoint = item.Type === 'Series'
        ? `${TMDB_API_BASE_URL}/tv/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`
        : `${TMDB_API_BASE_URL}/movie/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;
      response = await fetch(endpoint);
    } else {
      // Search by name and year
      const endpoint = item.Type === 'Series'
        ? `${TMDB_API_BASE_URL}/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(item.Name)}${item.ProductionYear ? `&year=${item.ProductionYear}` : ''}`
        : `${TMDB_API_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(item.Name)}${item.ProductionYear ? `&year=${item.ProductionYear}` : ''}`;
      response = await fetch(endpoint);

      const searchData = await response.json();
      if (searchData.results && searchData.results.length > 0) {
        tmdbId = searchData.results[0].id;
        // Fetch details for the first result
        const detailEndpoint = item.Type === 'Series'
          ? `${TMDB_API_BASE_URL}/tv/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`
          : `${TMDB_API_BASE_URL}/movie/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;
        response = await fetch(detailEndpoint);
      } else {
        logDebug(`No TMDB results found for "${item.Name}" (ID: ${item.Id}).`);
        return {};
      }
    }

    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status}`);
    }

    const data = await response.json();
    const imdbId = data.external_ids?.imdb_id || item.ProviderIds.Imdb || item.Id;
    const posterPath = data.poster_path
      ? `${TMDB_IMAGE_BASE_URL}w500${data.poster_path}`
      : `${server}/Items/${item.Id}/Images/Primary`;
    const backdropPath = data.backdrop_path && item.Type === 'Series'
      ? `${TMDB_IMAGE_BASE_URL}w1280${data.backdrop_path}`
      : undefined;

    return { imdbId, posterPath, backdropPath };
  } catch (error) {
    logDebug(`Error fetching TMDB data for "${item.Name}" (ID: ${item.Id}):`, error);
    return {
      imdbId: item.ProviderIds.Imdb || item.Id,
      posterPath: `${server}/Items/${item.Id}/Images/Primary`,
      backdropPath: undefined,
    };
  }
}