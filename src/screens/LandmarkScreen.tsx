import { useState } from 'react';
import { ArrowLeft, Camera, Navigation, MapPin, LockKeyhole, UsersRound, Check, CloudOff, Globe, ImagePlus } from 'lucide-react';
import type { AppState, Visit } from '../lib/model';
import { getLandmarkVisits, getActiveTrip } from '../lib/model';
import { getCity, getLandmark, getRegion, tierLabels } from '../data/cities';
import { usePhoto } from '../lib/usePhoto';
import { stampLabel } from '../lib/format';
export function VisitPhoto({ visit, onClick }: { visit: Visit; onClick?: () => void }) {
  const url = usePhoto(visit.photoId, visit.photoUrl);
  const landmark = getLandmark(visit.landmarkId);
  const seconds = String(new Date(visit.at).getSeconds()).padStart(2, '0');
  const caption = `${getCity(visit.cityId).name} · ${landmark?.name || '到访地标'} · ${stampLabel(visit.at)}:${seconds}`;
  return <button type="button" className="visit-photo" onClick={onClick} aria-label={`查看${caption}的${visit.demo ? '演示' : '到访'}照片`}>{url ? <img src={url} alt={`${caption}，${visit.demo ? '演示记录' : '到访合影'}`} /> : <ImagePlus size={24} />}<span>{visit.demo ? '演示记录' : '到访记录'}</span></button>;
}
export function LandmarkScreen({ state, landmarkId, onBack, onCheckIn, onTarget, onPublic, onRegions }: { state: AppState; landmarkId: string; onBack: () => void; onCheckIn: () => void; onTarget: () => void; onPublic: (v: Visit) => void; onRegions: () => void }) {
  const landmark = getLandmark(landmarkId)!;
  const city = getCity(landmark.cityId);
  const region = getRegion(landmark.regionId)!;
  const anchor = getLandmark(region.anchorLandmarkId)!;
  const canReveal = landmark.tier === 1 && !state.unlocks.some(u => u.userId === state.profile.id && u.regionId === region.id);
  const visits = getLandmarkVisits(state, landmarkId).sort((a, b) => a.at - b.at);
  const [tab, setTab] = useState<'mine' | 'public'>('mine');
  const publicVisits = state.visits.filter(v => v.landmarkId === landmarkId && v.public);
  const shownVisits = tab === 'mine' ? visits : publicVisits;
  const trip = getActiveTrip(state);
  return <div className="landmark-screen scroll-screen"><div className="detail-top"><button className="icon-button" aria-label="返回探索" onClick={onBack}><ArrowLeft size={21} /></button><span>一处地标，一段记忆</span></div><div className="landmark-cover"><img src={landmark.cover} alt={`${city.name}城市概念图，非实地核验照片`} /><span>城市概念影像</span></div><div className="screen-padding"><div className="landmark-title"><div><h1>{landmark.name}</h1><p>{city.name} · {landmark.photoSubject}</p></div><span className={`state-tag ${visits.length ? 'green' : ''}`}><i />{visits.length ? '已到访' : '未到访'}</span></div><span className={`landmark-tier tier-${landmark.tier}`}>{tierLabels[landmark.tier]}</span><div className="landmark-region-info"><b>{region.name}</b> · 约 {region.areaKm2.toLocaleString()} km²<br />{landmark.tier === 1 ? '到访这处代表地标，展开整个区域。' : `由${anchor.name}统一开图；这里保存到访与照片。`}<br /><button onClick={onRegions}>查看全市分区 ↗</button></div><p className="landmark-description">{landmark.description}</p><div className="landmark-actions"><button className="secondary-button" onClick={onTarget}><Navigation size={16} />{state.targetLandmarkId === landmarkId ? '当前探索目标' : '设为下一站'}</button><button className="primary-button" onClick={onCheckIn}><Camera size={17} />{canReveal ? '拍照开图' : '记录这次到访'}</button></div><p className="content-note"><MapPin size={13} />候选拍照点与区划待现场核实</p>{visits.length > 0 && <div className="first-visit"><Check size={16} /><div><b>首次到访 · {stampLabel(visits[0].at)}</b><span>{visits[0].userId === state.profile.id ? '你的记忆，从这里开始' : '来自小队的共享记录'} · 重访保留原时间</span></div></div>}<div className="section-tabs"><button className={tab === 'mine' ? 'active' : ''} aria-pressed={tab === 'mine'} onClick={() => setTab('mine')}>{trip?.mode === 'squad' ? <UsersRound size={16} /> : <LockKeyhole size={16} />}我的记录 {visits.length}</button><button className={tab === 'public' ? 'active' : ''} aria-pressed={tab === 'public'} onClick={() => setTab('public')}><Globe size={16} />地标相册 {publicVisits.length}</button></div>{shownVisits.length ? <div className="visit-grid">{shownVisits.map(v => <div key={v.id}><VisitPhoto visit={v} onClick={() => onPublic(v)} /><small>{stampLabel(v.at)}</small><span className="photo-caption">{v.source === 'squad' ? '小队共同记录' : '个人记录'}{v.public ? ' · 已公开' : ' · 私密'}</span></div>)}</div> : <div className="small-empty"><Camera size={25} /><p>{tab === 'mine' ? '第一张合影，等你来留下。' : '这里还没有公开的照片。'}</p><small>{tab === 'public' ? '仅展示在本机主动公开的记录' : '照片默认保存在个人或本次小队空间'}</small></div>}<p className="storage-note"><CloudOff size={13} />本地体验版 · 记录保存在当前设备</p></div></div>;
}
