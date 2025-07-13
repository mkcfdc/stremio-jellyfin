import { logError, logInfo, logWarn } from "./utils/logging.ts";

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