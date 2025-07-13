import { logDebug, logError, logInfo, logWarn } from "./utils/logging.ts";

export interface JellyfinSession {
  Id: string;
  UserId: string;
  UserName: string;
  Client: string;
  DeviceName: string;
  LastActivityDate: string;
}

export interface JellyfinMediaStream {
  DisplayTitle?: string;
  Codec?: string;
  Type?: string;
  IsMain?: boolean;
}

export interface JellyfinMediaSource {
  Id: string;
  Path?: string;
  MediaStreams: JellyfinMediaStream[];
  Container?: string;
  Size?: number;
}

export interface JellyfinItem {
  Id: string;
  Type: string; 
  Name: string;
  OriginalTitle: string;
  ProviderIds: {
    Imdb?: string;
    Tmdb?: string;
    [key: string]: string | undefined;
  };
  MediaSources: JellyfinMediaSource[];
  IndexNumber?: number; 
  ParentIndexNumber?: number; 
  SeriesId?: string;
  SeasonId?: string;
  Overview?: string; 
  ProductionYear?: number;
  RunTimeTicks?: number; 
  CommunityRating?: number; 
  OfficialRating?: string; 
  Genres?: string[];
  Studios?: { Name: string }[];
  ImageTags?: { Primary?: string; Backdrop?: string; Logo?: string }; 
}

export interface JellyfinUser {
  Id: string;
  Name: string;
}

export interface JellyfinSeason {
  Id: string;
  Name: string;
  IndexNumber?: number;
  Type: string;
  SeriesId: string;
}

export interface JellyfinEpisode {
  Id: string;
  Name: string;
  IndexNumber?: number;
  ParentIndexNumber?: number;
  Type: string; 
  SeriesId: string;
  SeasonId: string;
  Overview?: string;
  ImageTags?: { Primary?: string };
}

export interface JellyfinProviderIdSearchResult {
  ItemId: string;
  ItemType: string;
}

export interface JellyfinAuthenticationResult {
  AccessToken: string;
  User: {
    Id: string;
    Name: string;
  };
  SessionInfo: {
    Id: string;
  };
}

interface PagedResult<T> {
  Items: T[];
  TotalRecordCount: number;
}

export const server = Deno.env.get("JELLYFIN_SERVER");
if (!server) {
  logError("JELLYFIN_SERVER environment variable is required");
  throw new Error("JELLYFIN_SERVER environment variable is required");
}

const username = Deno.env.get("JELLYFIN_USERNAME");
if (!username) {
  logError("JELLYFIN_USERNAME environment variable is required");
  throw new Error("JELLYFIN_USERNAME environment variable is required");
}

const password = Deno.env.get("JELLYFIN_PW");
if (!password) {
  logError("JELLYFIN_PASSWORD environment variable is required");
  throw new Error("JELLYFIN_PASSWORD environment variable is required");
}

export const itemsLimit = 20; // Default limit for catalog requests

export const device = "deno-client";
export const deviceId = `deno-${crypto.randomUUID()}`;
export const clientName = "DenoJellyfinClient";
export const clientVersion = "1.0.0";

export class JellyfinApi {
  public userId: string | null = null;
  private accessToken: string | null = null; 
  public currentSessionId: string | null = null;

  /**
   * Authenticate using username and password to get an access token.
   * This uses the /Users/AuthenticateByName endpoint.
   */
  async authenticate(): Promise<void> {
    logInfo(
      `JellyfinApi: Connecting to Jellyfin server: ${server} using username and password`,
    );

    const authBody = {
      Username: username,
      Pw: password,
    };

    try {
      const res = await fetch(`${server}/Users/AuthenticateByName`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Emby-Authorization": this.authHeaderValueWithoutToken(),
        },
        body: JSON.stringify(authBody),
      });

      if (!res.ok) {
        const body = await res.text();
        if (res.status === 401) {
          throw new Error(
            `Authentication failed: Invalid username or password. Server response: ${body}`,
          );
        }
        throw new Error(`Authentication failed: ${res.status} ${body}`);
      }

      const authResult: JellyfinAuthenticationResult = await res.json();
      this.accessToken = authResult.AccessToken;
      this.userId = authResult.User.Id;
      this.currentSessionId = authResult.SessionInfo?.Id;
      logInfo(
        `JellyfinApi: Authenticated successfully as user ${this.userId} (${authResult.User.Name})`,
      );
    } catch (error) {
      logError("JellyfinApi: Authentication failed.", error);
      throw error;
    }
  }

  /**
   * Retrieves a list of all active sessions for the current user.
   */
  async getSessions(): Promise<JellyfinSession[]> {
    if (!this.accessToken || !this.userId) {
      logError("JellyfinApi: Not authenticated. Cannot get sessions.");
      return [];
    }
    try {
      const sessions = await this.request<JellyfinSession[]>(
        "/Sessions",
        {}, 
        "GET", 
      );
      logDebug(`JellyfinApi: Retrieved ${sessions.length} sessions.`);
      return sessions;
    } catch (error) {
      logError("JellyfinApi: Error getting sessions:", error);
      return [];
    }
  }

  /**
   * Deletes one or more specific sessions.
   * @param sessionIds An array of session IDs to delete.
   */
  async deleteSessions(sessionIds: string[]): Promise<void> {
    if (!this.accessToken || !this.userId) {
      logError("JellyfinApi: Not authenticated. Cannot delete sessions.");
      return;
    }
    if (sessionIds.length === 0) {
      logDebug("JellyfinApi: No session IDs provided to delete.");
      return;
    }
    try {
      logInfo(
        `JellyfinApi: Attempting to delete sessions: ${sessionIds.join(", ")}`,
      );
      await this.request(
        "/Sessions/Logout",
        undefined, // No query parameters for POST body
        "POST",
        { SessionIds: sessionIds }, // Request body
      );
      logInfo(`JellyfinApi: Successfully deleted sessions.`);
    } catch (error) {
      logError(
        `JellyfinApi: Error deleting sessions ${sessionIds.join(", ")}:`,
        error,
      );
    }
  }

  /**
   * Public getter for the access token.
   */
  public getAccessToken(): string {
    if (!this.accessToken) {
      logError(
        "JellyfinApi: Access token not available. Call authenticate() first.",
      );
      throw new Error("Access token not available. Call authenticate() first.");
    }
    return this.accessToken;
  }

  /**
   * Constructs the X-Emby-Authorization header value.
   * Jellyfin's auth header format:
   * MediaBrowser Client="YourClient", Device="YourDevice", DeviceId="YourDeviceId", Version="YourVersion", Token="YourToken"
   */
  private authHeaderValueWithToken(): string {
    return `MediaBrowser Client="${clientName}", Device="${device}", DeviceId="${deviceId}", Version="${clientVersion}", Token="${this.getAccessToken()}"`;
  }

  /**
   * Constructs the X-Emby-Authorization header value without a token,
   * used for the initial authentication request.
   */
  private authHeaderValueWithoutToken(): string {
    return `MediaBrowser Client="${clientName}", Device="${device}", DeviceId="${deviceId}", Version="${clientVersion}"`;
  }

  /**
   * Helper to perform GET/POST requests and parse JSON.
   */
  private async request<T>(
    path: string,
    queryParams?: Record<string, string | number | boolean | undefined>,
    method: string = "GET",
    body?: any,
  ): Promise<T> {
    const url = new URL(`${server}${path}`);
    if (queryParams) {
      for (const [key, value] of Object.entries(queryParams)) {
        if (value !== undefined && value !== null) { // Only add defined and non-null values
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers: HeadersInit = {
      "Content-Type": "application/json",
      "X-Emby-Authorization": this.authHeaderValueWithToken(),
    };

    logDebug(`JellyfinApi: Sending ${method} request to: ${url.toString()}`);
    if (body) {
      // logDebug("JellyfinApi: Request body:", body);
    }

    try {
      const res = await fetch(url.toString(), {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!res.ok) {
        const errorBody = await res.text();
        const errorMsg =
          `Jellyfin request failed (${res.status}) ${res.statusText} for ${path}: ${errorBody}`;
        logError(`JellyfinApi: ${errorMsg}`);
        throw new Error(errorMsg);
      }

      const data = await res.json();
      //logDebug(`JellyfinApi: Received response from ${path}:`, data);
      return data as T;
    } catch (error) {
      logError(`JellyfinApi: Error during request to ${path}:`, error);
      throw error;
    }
  }

  /**
   * Fetch a single item by its internal Jellyfin ID.
   */
  getItemById(itemId: string): Promise<JellyfinItem> {
    if (!this.userId) {
      logError("JellyfinApi: userId is not set. Cannot call getItemById.");
      throw new Error("userId is not set. Authenticate first.");
    }
    logInfo(`JellyfinApi: Fetching item by internal ID: ${itemId}`);
    return this.request<JellyfinItem>(`/Users/${this.userId}/Items/${itemId}`);
  }

  /**
   * Search items in the Jellyfin library, optionally filtering by type and search term.
   * This is used for Stremio's catalog requests.
   */
  async searchItems(
    skip = 0,
    isMovie = false,
    searchTerm?: string,
  ): Promise<JellyfinItem[]> {
    if (!this.userId) {
      logError("JellyfinApi: userId is not set. Cannot call searchItems.");
      return [];
    }

    logInfo(
      `JellyfinApi: Searching items for catalog: skip=${skip}, isMovie=${isMovie}, searchTerm=${
        searchTerm || "N/A"
      }`,
    );

    const params: Record<string, string | number | boolean | undefined> = {
      userId: this.userId,
      Recursive: true, // Search all sub-items
      StartIndex: skip,
      Limit: itemsLimit,
      SortBy: "SortName",
      SortOrder: "Ascending", // Default sort order
      Fields:
        "ProviderIds,Overview,Genres,ProductionYear,RunTimeTicks,CommunityRating,OfficialRating,ImageTags,MediaSources,Chapters,MediaStreams,SeasonCollection,Studios", // Request all necessary fields
    };

    if (searchTerm) {
      params.SearchTerm = searchTerm;
    }

    if (isMovie) {
      params.IncludeItemTypes = "Movie";
    } else {
      params.IncludeItemTypes = "Series"; // For series catalog, we only want top-level series
    }

    try {
      const data = await this.request<PagedResult<JellyfinItem>>(
        "/Items",
        params,
      );
      logInfo(
        `JellyfinApi: Found ${data.Items.length} items for catalog search.`,
      );
      logDebug(
        "JellyfinApi: Search results (first 5):",
        data.Items.slice(0, 5).map((i) => ({
          Id: i.Id,
          Name: i.Name,
          Type: i.Type,
        })),
      );
      return data.Items;
    } catch (error) {
      logError("JellyfinApi: Error during searchItems:", error);
      return [];
    }
  }

  /**
   * Fetches the full JellyfinItem details given an IMDB ID.
   * This is the correct way to find an item in your library by its IMDB ID.
   */
async getFullItemByImdbId(
  imdbId: string,
  type: "series" | "movie",
  itemName?: string
): Promise<JellyfinItem | null> {

  if (!this.userId) {
    logError(
      "JellyfinApi: userId is not set. Cannot call getFullItemByImdbId.",
    );
    return null;
  }

  logInfo(`JellyfinApi: Attempting to find item by IMDB ID: ${imdbId}`);

  if (!itemName) {
    logWarn(`JellyfinApi: Could not retrieve item name from TMDB for IMDB ID: ${imdbId}. Cannot proceed with Jellyfin search.`);
    return null;
  }

  try {
    const params: Record<string, string | number | boolean | undefined> = {
      userId: this.userId,
      Recursive: true,
      IncludeItemTypes: type === "movie" ? "Movie" : "Series",
      Limit: 5, // Increased limit to find variations if needed, but searchTerm helps narrow
      Fields:
        "ProviderIds,Overview,Genres,ProductionYear,RunTimeTicks,CommunityRating,OfficialRating,ImageTags,MediaSources,Chapters,MediaStreams,SeasonCollection,Studios",
      Filters: "HasExternalId", // Still good to only get items that have *some* external ID
      searchTerm: itemName, // <<< Pass the name obtained from TMDB here
      // No "ProviderIds.Imdb" or "ProviderIdEquals" here
    };

    const result = await this.request<PagedResult<JellyfinItem>>(
      "/Items",
      params,
    );

    if (result.Items && result.Items.length > 0) {
      const foundItem = result.Items.find(
        (item) => item.ProviderIds?.Imdb === imdbId,
      );

      if (foundItem) {
        logInfo(
          `JellyfinApi: Successfully found item "${foundItem.Name}" (ID: ${foundItem.Id}) with matching IMDB ID ${imdbId} after client-side filtering.`,
        );
        return foundItem;
      } else {
        logWarn(
          `JellyfinApi: Jellyfin returned items for "${itemName}", but none had the exact IMDB ID: ${imdbId}. ` +
            `This might indicate a metadata discrepancy in Jellyfin.`,
        );
        return null;
      }
    } else {
      logWarn(
        `JellyfinApi: No items returned from Jellyfin for search term "${itemName}" (IMDB ID: ${imdbId}).`,
      );
      return null;
    }
  } catch (error) {
    logError(`JellyfinApi: Error fetching item by IMDB ID ${imdbId}:`, error);
    return null;
  }
}

  /**
   * Get seasons for a given series item.
   */
  async getSeasonsBySeriesId(
    seriesId: string,
  ): Promise<JellyfinSeason[]> {
    if (!this.userId) {
      logError(
        "JellyfinApi: userId is not set. Cannot call getSeasonsBySeriesId.",
      );
      return [];
    }
    logInfo(`JellyfinApi: Fetching seasons for series ID: ${seriesId}`);
    try {
      const data = await this.request<PagedResult<JellyfinSeason>>(
        `/Shows/${seriesId}/Seasons`,
        { userId: this.userId, Fields: "ImageTags" }, // Request image tags for thumbnails
      );
      logInfo(
        `JellyfinApi: Found ${data.Items.length} seasons for series ID ${seriesId}.`,
      );
      return data.Items;
    } catch (error) {
      logError(
        `JellyfinApi: Error fetching seasons for series ID ${seriesId}:`,
        error,
      );
      return [];
    }
  }

  /**
   * Get episodes for a given season.
   */
  async getEpisodesBySeasonId(
    seriesId: string,
    seasonId: string,
  ): Promise<JellyfinEpisode[]> {
    if (!this.userId) {
      logError(
        "JellyfinApi: userId is not set. Cannot call getEpisodesBySeasonId.",
      );
      return [];
    }
    logInfo(
      `JellyfinApi: Fetching episodes for series ID: ${seriesId}, Season ID: ${seasonId}`,
    );
    try {
      const data = await this.request<PagedResult<JellyfinEpisode>>(
        `/Shows/${seriesId}/Episodes`,
        {
          seasonId,
          userId: this.userId,
          Fields: "ImageTags,Overview,RunTimeTicks",
        }, 
      );
      logInfo(
        `JellyfinApi: Found ${data.Items.length} episodes for series ID ${seriesId}, Season ID ${seasonId}.`,
      );
      return data.Items;
    } catch (error) {
      logError(
        `JellyfinApi: Error fetching episodes for series ID ${seriesId}, Season ID ${seasonId}:`,
        error,
      );
      return [];
    }
  }
}

export async function cleanupSession(jellyfin: JellyfinApi) {
    logInfo("Server shutting down. Attempting to delete Jellyfin session...");
    if (jellyfin.currentSessionId) {
        try {
            // Ensure deleteSessions method is implemented in JellyfinApi
            await jellyfin.deleteSessions([jellyfin.currentSessionId]);
            logInfo(`Successfully deleted Jellyfin session: ${jellyfin.currentSessionId}`);
        } catch (error) {
            logError(`Failed to delete Jellyfin session ${jellyfin.currentSessionId}:`, error);
        }
    } else {
        logWarn("No specific add-on session ID to delete during shutdown.");
    }
}
