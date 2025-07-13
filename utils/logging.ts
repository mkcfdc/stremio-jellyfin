// deno-lint-ignore-file no-explicit-any
const DEBUG_MODE = Deno.env.get("DENO_ENV") === "production" ? false : true; // Set to false for production

export function logDebug(message: string, ...args: any[]) {
  if (DEBUG_MODE) {
    console.log(`[DEBUG] ${new Date().toISOString()} - ${message}`, ...args);
  }
}

export function logInfo(message: string, ...args: any[]) {
  console.info(`[INFO] ${new Date().toISOString()} - ${message}`, ...args);
}

export function logWarn(message: string, ...args: any[]) {
  console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, ...args);
}

export function logError(message: string, error?: any, ...args: any[]) {
  console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, ...args);
  if (error) {
    console.error(error); // Log the full error object
  }
}