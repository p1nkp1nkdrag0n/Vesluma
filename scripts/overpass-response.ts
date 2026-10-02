/** Node 24's native type stripping lets the importer and Vitest share this gate. */
export function completeOverpassResponse(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const body = value as Record<string, unknown>;
  const metadata = body.osm3s as Record<string, unknown> | undefined;
  // An offshore partition can legitimately have no selected roads or inland
  // waters. A remark, including one accompanying useful features, means partial.
  return !body.remark && Array.isArray(body.elements)
    && typeof body.generator === 'string' && body.generator.startsWith('Overpass API')
    && typeof metadata?.timestamp_osm_base === 'string'
    && Number.isFinite(Date.parse(metadata.timestamp_osm_base));
}
