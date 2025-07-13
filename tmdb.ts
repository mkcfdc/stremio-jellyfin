import { logDebug, logError, logInfo, logWarn } from "./utils/logging.ts";

const TMDB_API_BASE_URL = ' https://api.themoviedb.org/3';
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

export async function getTmdbNameFromImdbId(
  imdbId: string,
  type: "movie" | "series",
): Promise<string | null> {
  try {
    let url: string;
    if (type === "movie") {
      // TMDB's find endpoint is useful for external IDs
      url = `${TMDB_API_BASE_URL}/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
    } else {
      // For TV shows, the 'find' endpoint also works similarly
      url = `${TMDB_API_BASE_URL}/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
    }

    const response = await fetch(url); // Or use axios
    if (!response.ok) {
      logError(`TMDB API error for ${imdbId}: ${response.statusText}`);
      return null;
    }
    const data = await response.json();

    // pull the images from TMDB too since Jellyfin is sending the wrong headers.

    if (type === "movie" && data.movie_results && data.movie_results.length > 0) {
      logInfo(`TMDB: Found movie name "${data.movie_results[0].title}" for IMDB ID ${imdbId}`);
      return data.movie_results[0].title;
    } else if (type === "series" && data.tv_results && data.tv_results.length > 0) {
      logInfo(`TMDB: Found series name "${data.tv_results[0].name}" for IMDB ID ${imdbId}`);
      return data.tv_results[0].name;
    } else {
      logWarn(`TMDB: No results found for IMDB ID ${imdbId} (Type: ${type})`);
      return null;
    }
  } catch (error) {
    logError(`TMDB: Error fetching name for IMDB ID ${imdbId}:`, error);
    return null;
  }
}