import { handleRequest } from "./routes.ts";
import { logInfo } from "./utils/logging.ts";

const PORT = Number(Deno.env.get("PORT") ?? "60421");
logInfo(
  `Starting in ${Deno.env.get("DENO_ENV") === "production" ? "Production" : "Development"} mode.`,
);
logInfo(`JellyfinSeerr is: ${Deno.env.get("JELLYSEERR_SERVER") && Deno.env.get("JELLYSEERR_API_KEY") && Deno.env.get("ADDON_SERVER") ? "ACTIVE" : "NOT ACTIVE"}`)

Deno.serve({ port: PORT }, handleRequest);