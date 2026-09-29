/** Candidate city content in WGS84. These polygons are intentionally illustrative:
 * they are NOT surveyed street/river boundaries or a complete city partition.
 */
export type CityId = 'nanjing' | 'xian'
export type Coordinate = [number, number] // GeoJSON: [longitude, latitude]

export interface Landmark {
  id: string
  cityId: CityId
  name: string
  shortName: string
  category: 'arrival' | 'heritage' | 'culture'
  lat: number
  lng: number
  description: string
  photoSubject: string
  regionIds: string[]
  arrivalRadiusMeters: number
  cover: string
  verification: 'candidate'
  sourceUrl: string
}

export interface Region {
  id: string
  cityId: CityId
  name: string
  polygon: Coordinate[]
  verification: 'illustrative'
  boundaryNote: string
  version: string
}

export interface City {
  id: CityId
  name: string
  enName: string
  subtitle: string
  center: [number, number] // Leaflet: [latitude, longitude]
  startPosition: { lat: number; lng: number }
  zoom: number
  bounds: [[number, number], [number, number]]
  landmarks: Landmark[]
  regions: Region[]
  contentVersion: string
  coordinateSystem: 'WGS84'
  verification: 'illustrative'
}

const region = (cityId: CityId, id: string, name: string, polygon: Coordinate[]): Region => ({
  id, cityId, name, polygon, verification: 'illustrative', version: 'prototype-1',
  boundaryNote: '原型示意区划，尚未完成现场勘察；不代表正式道路、河流边界。',
})

const landmark = (cityId: CityId, data: Omit<Landmark, 'cityId' | 'arrivalRadiusMeters' | 'verification'>): Landmark => ({
  ...data, cityId, cover: cityId === 'nanjing' ? '/images/nanjing.png' : '/images/xian.png', arrivalRadiusMeters: 250, verification: 'candidate',
})

export const cities: City[] = [
  {
    id: 'nanjing', name: '南京', enName: 'NANJING', subtitle: '从秦淮河畔，展开一座城。',
    center: [32.022579, 118.783786], startPosition: { lat: 32.088617, lng: 118.791253 },
    zoom: 14, bounds: [[32.006, 118.763], [32.098, 118.808]],
    coordinateSystem: 'WGS84', verification: 'illustrative', contentVersion: 'prototype-1',
    landmarks: [
      landmark('nanjing', { id: 'nj-station', name: '南京站', shortName: '南京站', category: 'arrival', lat: 32.088617, lng: 118.791253,
        description: '抵达南京的第一张合影。以南广场站名为候选拍照主体，记录这一程的起点。', photoSubject: '南京站站名 · 南广场候选位置', regionIds: ['nj-arrival'], cover: '/assets/nanjing-cover.png',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Nanjing_Railway_Station_20160810-2.jpg' }),
      landmark('nanjing', { id: 'nj-confucius', name: '夫子庙', shortName: '夫子庙', category: 'culture', lat: 32.022579, lng: 118.783786,
        description: '秦淮河畔的夫子庙。留下此刻的合影，让老城南的一角在你的地图上亮起。', photoSubject: '夫子庙建筑或标识', regionIds: ['nj-qinhuai'], cover: '/assets/nanjing-cover.png',
        sourceUrl: 'https://dbpedia.org/page/Nanjing_Fuzimiao' }),
      landmark('nanjing', { id: 'nj-laomendong', name: '老门东', shortName: '老门东', category: 'heritage', lat: 32.0185, lng: 118.7819,
        description: '走进城南街巷，记录老门东的砖墙与屋檐。候选中心点仍待现场核实。', photoSubject: '老门东牌坊或街区标识', regionIds: ['nj-qinhuai'], cover: '/assets/nanjing-cover.png',
        sourceUrl: 'https://commons.wikimedia.org/wiki/Category:Laomendong' }),
      landmark('nanjing', { id: 'nj-zhonghua', name: '中华门', shortName: '中华门', category: 'heritage', lat: 32.0146861, lng: 118.7764861,
        description: '在城门与秦淮河之间，记录一段属于自己的南京记忆。', photoSubject: '中华门城堡主体', regionIds: ['nj-zhonghua'], cover: '/assets/nanjing-cover.png',
        sourceUrl: 'https://commons.wikimedia.org/wiki/Category:Zhonghua_Gate' }),
      landmark('nanjing', { id: 'nj-xuanwu', name: '玄武门', shortName: '玄武门', category: 'heritage', lat: 32.0726194, lng: 118.7823389,
        description: '从城门望向湖面。留下一张合影，也留下今天湖岸的光。', photoSubject: '玄武门门楼', regionIds: ['nj-xuanwu'], cover: '/assets/nanjing-cover.png',
        sourceUrl: 'https://www.wikidata.org/wiki/Q17059567' }),
      landmark('nanjing', { id: 'nj-jiming', name: '鸡鸣寺', shortName: '鸡鸣寺', category: 'culture', lat: 32.06305, lng: 118.79003,
        description: '在湖畔与城墙之间，保存鸡鸣寺的一次到访。具体合影点有待勘察。', photoSubject: '鸡鸣寺外部标识或建筑', regionIds: ['nj-jiming'], cover: '/assets/nanjing-cover.png',
        sourceUrl: 'https://www.openstreetmap.org/way/319055520' }),
    ],
    regions: [
      region('nanjing', 'nj-arrival', '南京站示意区', [[118.780,32.096],[118.804,32.096],[118.804,32.082],[118.797,32.079],[118.780,32.082],[118.780,32.096]]),
      region('nanjing', 'nj-qinhuai', '秦淮 · 门东示意区', [[118.779,32.028],[118.794,32.028],[118.794,32.016],[118.786,32.012],[118.779,32.015],[118.779,32.028]]),
      region('nanjing', 'nj-zhonghua', '中华门示意区', [[118.768,32.025],[118.779,32.028],[118.779,32.015],[118.786,32.012],[118.775,32.008],[118.768,32.013],[118.768,32.025]]),
      region('nanjing', 'nj-xuanwu', '玄武湖西示意区', [[118.773,32.082],[118.788,32.079],[118.788,32.067],[118.782,32.062],[118.773,32.067],[118.773,32.082]]),
      region('nanjing', 'nj-jiming', '鸡鸣寺示意区', [[118.788,32.079],[118.800,32.076],[118.800,32.058],[118.782,32.062],[118.788,32.067],[118.788,32.079]]),
    ],
  },
  {
    id: 'xian', name: '西安', enName: "XI’AN", subtitle: '穿过城门，留下这一程。',
    center: [34.26101, 108.94234], startPosition: { lat: 34.377556, lng: 108.934083 },
    zoom: 14, bounds: [[34.207, 108.919], [34.389, 108.977]],
    coordinateSystem: 'WGS84', verification: 'illustrative', contentVersion: 'prototype-1',
    landmarks: [
      landmark('xian', { id: 'xa-station', name: '西安北站', shortName: '西安北站', category: 'arrival', lat: 34.377556, lng: 108.934083,
        description: '在站名下留下一张抵达合影，开启你的西安旅行。广场拍照点尚待核实。', photoSubject: '西安北站站名', regionIds: ['xa-arrival'], cover: '/assets/xian-cover.png',
        sourceUrl: 'https://en.wikipedia.org/wiki/Xi%27an_North_railway_station' }),
      landmark('xian', { id: 'xa-bell', name: '钟楼', shortName: '钟楼', category: 'heritage', lat: 34.26101, lng: 108.94234,
        description: '城中心的钟楼，见证一段新的到访。拍照与到场范围须在正式测试前核实。', photoSubject: '钟楼建筑主体', regionIds: ['xa-center'], cover: '/assets/xian-cover.png',
        sourceUrl: 'https://www.openstreetmap.org/way/254488435' }),
      landmark('xian', { id: 'xa-drum', name: '鼓楼', shortName: '鼓楼', category: 'heritage', lat: 34.26176, lng: 108.93884,
        description: '钟鼓相望，记录自己在鼓楼前的这一刻。两座地标在原型中展开同一示意区。', photoSubject: '鼓楼建筑主体', regionIds: ['xa-center'], cover: '/assets/xian-cover.png',
        sourceUrl: 'https://www.openstreetmap.org/way/254488437' }),
      landmark('xian', { id: 'xa-yongning', name: '永宁门', shortName: '永宁门', category: 'heritage', lat: 34.2531, lng: 108.94232,
        description: '走到城墙南门，保存城门、护城河与今天的记忆。', photoSubject: '永宁门城门建筑', regionIds: ['xa-yongning'], cover: '/assets/xian-cover.png',
        sourceUrl: 'https://www.openstreetmap.org/node/6817037487' }),
      landmark('xian', { id: 'xa-pagoda', name: '大雁塔', shortName: '大雁塔', category: 'culture', lat: 34.2198, lng: 108.95943,
        description: '转场之后，仍然是同一程旅行。保存大雁塔前的一次合影。', photoSubject: '大雁塔主体 · 北广场候选位置', regionIds: ['xa-pagoda'], cover: '/assets/xian-cover.png',
        sourceUrl: 'https://www.openstreetmap.org/way/92223044' }),
    ],
    regions: [
      region('xian', 'xa-arrival', '西安北站示意区', [[108.924,34.386],[108.946,34.386],[108.946,34.369],[108.936,34.366],[108.924,34.371],[108.924,34.386]]),
      region('xian', 'xa-center', '钟鼓楼示意区', [[108.929,34.270],[108.951,34.270],[108.951,34.258],[108.929,34.258],[108.929,34.270]]),
      region('xian', 'xa-yongning', '永宁门示意区', [[108.929,34.258],[108.951,34.258],[108.953,34.245],[108.939,34.243],[108.929,34.249],[108.929,34.258]]),
      region('xian', 'xa-pagoda', '大雁塔示意区', [[108.949,34.230],[108.971,34.230],[108.973,34.214],[108.958,34.210],[108.949,34.215],[108.949,34.230]]),
    ],
  },
]

export const cityById = Object.fromEntries(cities.map((city) => [city.id, city])) as Record<CityId, City>
export const getCity = (id: CityId): City => cityById[id]
export const getLandmark = (id: string): Landmark | undefined => cities.flatMap((city) => city.landmarks).find((item) => item.id === id)
export const getRegion = (id: string): Region | undefined => cities.flatMap((city) => city.regions).find((item) => item.id === id)
