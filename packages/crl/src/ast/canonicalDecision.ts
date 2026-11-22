// REFACTOR:grounded: an authored local handoff names an absolute canonical, optionally versioned.
export function canonicalDecisionParts(value: string): { url: string; version?: string } | undefined {
  const [url, version, ...extra] = value.split("|");
  if (extra.length || !/^[A-Za-z][A-Za-z0-9+.-]*:[^\s|#]+$/.test(url) || (value.includes('|') && (!version || /[\s|#]/.test(version)))) return undefined;
  try { new URL(url); } catch { return undefined; }
  return { url, ...(version ? { version } : {}) };
}
