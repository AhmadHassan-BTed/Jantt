/**
 * Compares two composite timestamps of format "${ISO_STRING}#${clientId}" or "${ISO_STRING}".
 * Provides total ordering: lexicographical timestamp first, client ID tie-breaker second.
 */
export function compareCompositeTimestamps(tsA?: string, tsB?: string): number {
  if (!tsA && !tsB) return 0;
  if (tsA && !tsB) return 1;
  if (!tsA && tsB) return -1;
  if (tsA === tsB) return 0;

  const [isoA, clientA = ""] = (tsA || "").split("#");
  const [isoB, clientB = ""] = (tsB || "").split("#");

  if (isoA !== isoB) {
    return isoA.localeCompare(isoB);
  }
  return clientA.localeCompare(clientB);
}
