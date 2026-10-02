import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { completeOverpassResponse } from '../../../scripts/overpass-response';
import offshoreReceipt from './fixtures/shenzhen-offshore-empty.receipt.json';

const offshoreRaw = readFileSync(new URL('./fixtures/shenzhen-offshore-empty.json', import.meta.url), 'utf8');
const offshore: { elements: unknown[]; generator: string; osm3s: { timestamp_osm_base: string } } = JSON.parse(offshoreRaw);

describe('complete versus partial Overpass imports', () => {
  it('accepts the actual fully answered empty offshore partition and retains its original receipt', () => {
    expect(createHash('sha256').update(offshoreRaw).digest('hex')).toBe(offshoreReceipt.sha256);
    expect(offshore.elements).toEqual([]);
    expect(offshoreReceipt.query).toContain('water');
    expect(completeOverpassResponse(offshore)).toBe(true);
  });

  it('rejects a timeout or memory remark even when the service also returns useful features', () => {
    for (const remark of ['runtime error: Query timed out', 'runtime error: out of memory']) {
      expect(completeOverpassResponse({ ...offshore, remark })).toBe(false);
      expect(completeOverpassResponse({ ...offshore, remark, elements: [{ type: 'node', id: 1, lat: 22, lon: 114 }] })).toBe(false);
    }
  });

  it('does not confuse missing or malformed source metadata with a valid empty response', () => {
    for (const malformed of [null, {}, [], { elements: [] }, { ...offshore, generator: 'unrelated service' },
      { ...offshore, osm3s: {} }, { ...offshore, osm3s: { timestamp_osm_base: 'bad-date' } }, { ...offshore, elements: null }]) {
      expect(completeOverpassResponse(malformed)).toBe(false);
    }
  });
});
