# Stremio Jellyfin Addon

[Stremio](https://www.stremio.com/) addon that enables streaming movies and TV series from your own Jellyfin server. Addon runs entirely locally, ensuring that none of your data is shared outside of your own network. It provides Stremio with a 'library' featuring your Jellyfin movies and TV series collection, allowing you to stream seamlessly both movies and series to your favorite Stremio player.

![](assets/si.png)

## Installation

This addon consists of two parts: Stremio Addon and supporting Jellyfin Extension adding Jellyfin search 
capability using IMDB identifiers. Both components are required.

### Jellyfin Stremio Companion Plugin

This version does not require the companion plugin.

### TMDB_API_KEY now required.

Had to add TMDB api call to get the show/movie name. Since for some reason Jellyfin will never play nice with IMDB? I would add Redis caching for this if you were to run this publicly. But for a localhost job, this will be just fine.

### Jellyfin Stremio Addon

Jellyfin Stremio addon should be installed in your local docker environment. To install it pull latest docker addon image:

`docker pull ghcr.io/mkcfdc/stremio-jellyfin:latest`

and then run it:

`docker run -p 60421:60421 -e JELLYSEERR_SERVER="<your jellyseerr server including port" -e JELLYSEERR_API_KEY="<your jellyseerr api key here>" -e JELLYFIN_USERNAME="<your jellyfin username>" -e JELLYFIN_PW="<your jellyfin user password>" -e JELLYFIN_SERVER="<your jellyfin server address>" -e TMDB_API_KEY="<your tmdb key here>" ghcr.io/mkcfdc/stremio-jellyfin"`

You can run it in Your docker orchestrator too (like Rancher or Unraid).

Finally, add the manifest to Stremio to install this addon:

`http://<your docker host>:60421/manifest.json`


### What's different in this version:
1. Uses Deno Typescript
2. No need for the Stremio Companion Plugin in Jellyfin.
3. Provides proxying to the Jellyfin server. Now you do not even need to provide public access to your Jellyfin server. Keeping your API keys and password secure. Run Jellyfin behind Tailscale and run this addon publicly. I recommend creating a 'stremio' user on Jellyfin.
4. Jellyseer can now be used to request content directly from Stremio, with web interface for visual tracking.

### Things that need some work:
1. Series does not quite work properly. Need to spend more time here.
