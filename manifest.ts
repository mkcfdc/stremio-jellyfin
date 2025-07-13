import { type Manifest } from 'stremio-addon-sdk';

export const manifest: Manifest = {
    "id": "community.stremiojellyfin",
    "version": "1.0.0",
    "catalogs": [
        {
            "type": "movie",
            "id": "jellyfin-movies", 
            "name": "Jellyfin Movies",
            "extra": [
                { "name": "skip", "isRequired": true },
                { "name": "search", "isRequired": false }
            ]
        },
        {
            "type": "series",
            "id": "jellyfin-series",
            "name": "Jellyfin Series",
            "extra": [
                { "name": "skip", "isRequired": true },
                { "name": "search", "isRequired": false }
            ]
        }
    ],
    "resources": [
        "catalog",
        "stream",
    ],
    "types": [
        "movie",
        "series"
    ],
    "name": "Jellyfin", 
    "description": "Stremio Jellyfin integration"
}