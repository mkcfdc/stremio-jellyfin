import { logDebug, logWarn } from "./logging.ts";

export function stringToUuid(plain: string): string | null {
  logDebug(`Attempting to format UUID: ${plain}`);

  if (!/^[0-9a-fA-F]{32}$/.test(plain)) {
    logWarn(`Invalid UUID format received: "${plain}". Returning as is.`);
    return null;
  }
  const formattedUuid = plain.replace(
    /(.{8})(.{4})(.{4})(.{4})(.{12})/,
    "$1-$2-$3-$4-$5",
  );
  logDebug(`Formatted UUID: ${formattedUuid}`);
  return formattedUuid;
}