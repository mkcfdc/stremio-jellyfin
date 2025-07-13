import { addonInterface } from "./addon.ts";
import { serveHTTP } from "stremio-addon-sdk";

const PORT = Number(Deno.env.get("PORT") ?? "60421");

const corsOptions = {
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true, 
    optionsSuccessStatus: 204 
};

serveHTTP(addonInterface, {
    port: PORT, 
    cors: corsOptions 
});