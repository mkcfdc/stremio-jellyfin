import { type Manifest } from 'stremio-addon-sdk';

export const manifest: Manifest = {
    "id": "community.stremiojellyfin",
    "version": "1.0.0",
    "catalogs": [
        {
            "type": "movie",
            "id": "jellyfin-movies", // Make sure this is unique and descriptive
            "name": "Jellyfin Movies", // This name will show in Stremio UI
            "extra": [
                { "name": "skip", "isRequired": true },
                { "name": "search", "isRequired": false }
            ]
        },
        {
            "type": "series",
            "id": "jellyfin-series", // Make sure this is unique and descriptive
            "name": "Jellyfin Series", // This name will show in Stremio UI
            "extra": [
                { "name": "skip", "isRequired": true },
                { "name": "search", "isRequired": false }
            ]
        }
    ],
    "resources": [
        "catalog",
        "stream",
       // "meta"
    ],
    "types": [
        "movie",
        "series"
    ],
    "name": "Jellyfin", 
    "description": "Stremio Jellyfin integration"
}