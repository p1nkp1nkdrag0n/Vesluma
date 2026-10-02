import { describe, expect, it } from 'vitest'
import { chooseRoadLabels, containsPoint, containsRegionPoint, isPointUnlocked, polygonIntersectsBox, roadRestriction,
  type MapCoordinates, type RoadLabelCandidate } from './mapGeometry'

const square: MapCoordinates[] = [[0, 0], [4, 0], [4, 4], [0, 4]]
const overlappingSquare: MapCoordinates[] = [[2, 2], [6, 2], [6, 6], [2, 6]]
const concave: MapCoordinates[] = [[0, 0], [6, 0], [6, 2], [2, 2], [2, 6], [0, 6]]
const candidate = (id: string, fields: Partial<RoadLabelCandidate> = {}): RoadLabelCandidate => ({
  id, name: id, x: 100, y: 100, angle: 0, width: 80, height: 16, priority: 2, ...fields,
})

describe('map rights use the geographic union of unlocked regions', () => {
  it('preserves MultiPolygon pieces and excluded holes', () => {
    const island: MapCoordinates[] = [[10, 10], [12, 10], [12, 12], [10, 12], [10, 10]]
    const hole: MapCoordinates[] = [[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]]
    const region = { id: 'pieces', geometry: { type: 'MultiPolygon' as const, coordinates: [[square, hole], [island]] } }
    expect(containsRegionPoint([0.5, 2], region)).toBe(true)
    expect(containsRegionPoint([2, 2], region)).toBe(false)
    expect(containsRegionPoint([11, 11], region)).toBe(true)
    expect(isPointUnlocked([2, 2], [region], new Set(['pieces']))).toBe(false)
    expect(isPointUnlocked([11, 11], [region], new Set(['pieces']))).toBe(true)
  })
  it('includes polygon edges and vertices without filling a concave excluded area', () => {
    expect(containsPoint([0, 2], square)).toBe(true)
    expect(containsPoint([4, 4], square)).toBe(true)
    expect(containsPoint([1, 5], concave)).toBe(true)
    expect(containsPoint([5, 1], concave)).toBe(true)
    expect(containsPoint([4, 4], concave)).toBe(false)
    expect(containsPoint([7, 1], concave)).toBe(false)
  })

  it('never treats malformed coordinates or incomplete polygons as detailed regions', () => {
    expect(containsPoint([NaN, 2], square)).toBe(false)
    expect(containsPoint([2, Infinity], square)).toBe(false)
    expect(containsPoint([2, 2], [])).toBe(false)
    expect(containsPoint([2, 2], [[0, 0], [4, 4]])).toBe(false)
    expect(containsPoint([2, 2], [[0, 0], [4, NaN], [4, 4], [0, 4]])).toBe(false)
  })

  it('retains a shared overlap as unlocked and ignores a right for an unconfigured region', () => {
    const regions = [{ id: 'first', polygon: square }, { id: 'second', polygon: overlappingSquare }]
    expect(isPointUnlocked([3, 3], regions, new Set(['first', 'second']))).toBe(true)
    expect(isPointUnlocked([1, 1], regions, new Set(['second']))).toBe(false)
    expect(isPointUnlocked([5, 5], regions, new Set(['second']))).toBe(true)
    expect(isPointUnlocked([3, 3], regions, new Set(['missing']))).toBe(false)
    expect(isPointUnlocked([3, 3], regions, new Set())).toBe(false)
  })
})

describe('unlocked geometry and road label areas', () => {
  it('detects an edge crossing a label even when neither polygon vertices nor box corners are contained', () => {
    const narrowStrip = [{ x: 2, y: -10 }, { x: 3, y: -10 }, { x: 3, y: 10 }, { x: 2, y: 10 }]
    expect(polygonIntersectsBox({ left: 0, top: 0, right: 5, bottom: 1 }, narrowStrip)).toBe(true)
  })

  it('keeps a label in a concave empty area while rejecting a label on the revealed polygon', () => {
    const polygon = concave.map(([x, y]) => ({ x, y }))
    expect(polygonIntersectsBox({ left: 3, top: 3, right: 5, bottom: 5 }, polygon)).toBe(false)
    expect(polygonIntersectsBox({ left: 0.5, top: 3, right: 1.5, bottom: 5 }, polygon)).toBe(true)
    expect(polygonIntersectsBox({ left: -1, top: -1, right: 7, bottom: 7 }, polygon)).toBe(true)
  })

  it('prioritizes a principal road label when nearby candidates collide', () => {
    const lowerPriority = candidate('secondary', { priority: 1 })
    const higherPriority = candidate('primary', { priority: 3 })
    const separate = candidate('separate', { x: 300, priority: 1 })
    const source = [lowerPriority, higherPriority, separate]
    expect(chooseRoadLabels(source).map(label => label.id)).toEqual(['primary', 'separate'])
    expect(source).toEqual([lowerPriority, higherPriority, separate])
  })

  it('does not duplicate the same road name or cover a landmark obstacle', () => {
    const source = [candidate('road-1', { name: '中央路', priority: 3 }),
      candidate('road-2', { name: '中央路', x: 300, priority: 2 }),
      candidate('near-pin', { name: '北京东路', x: 500, priority: 2 }),
      candidate('clear', { name: '中山路', x: 700, priority: 1 })]
    const labels = chooseRoadLabels(source, [{ left: 470, top: 80, right: 530, bottom: 120 }])
    expect(labels.map(label => label.id)).toEqual(['road-1', 'clear'])
  })

  it('reserves the rotated label footprint rather than letting a vertical name cover a marker', () => {
    const vertical = candidate('vertical', { angle: Math.PI / 2, width: 100 })
    const clear = candidate('clear', { x: 300 })
    expect(chooseRoadLabels([vertical, clear], [{ left: 92, top: 140, right: 108, bottom: 150 }])
      .map(label => label.id)).toEqual(['clear'])
  })
})

describe('known road restrictions preserve pedestrian meaning', () => {
  it('keeps an explicit pedestrian restriction even when general access is permitted', () => {
    expect(roadRestriction({ foot: 'no', access: 'yes' })).toBe('no-foot')
    expect(roadRestriction({ foot: 'use_sidepath' })).toBe('no-foot')
    expect(roadRestriction({ foot: 'private', access: 'yes' })).toBe('restricted')
  })

  it('does not label pedestrian-permitted segments as restricted by a broader access tag', () => {
    expect(roadRestriction({ foot: 'yes', access: 'no' })).toBeNull()
    expect(roadRestriction({ foot: 'designated', access: 'private' })).toBeNull()
    expect(roadRestriction({ foot: 'permissive', access: 'private' })).toBeNull()
    expect(roadRestriction({ access: 'no' })).toBe('restricted')
    expect(roadRestriction({ access: 'private' })).toBe('restricted')
  })

  it('does not infer walking permission or a prohibition when the source has no supporting tag', () => {
    expect(roadRestriction({})).toBeNull()
    expect(roadRestriction({ access: 'yes' })).toBeNull()
    expect(roadRestriction({ foot: 'unknown' })).toBeNull()
  })
})
