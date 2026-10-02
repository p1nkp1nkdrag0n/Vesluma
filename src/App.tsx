import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronRight, Compass, MapPin, Navigation, Pause, Play, Sparkles, UserRound, UsersRound, LockKeyhole, Globe, Copy, Image, LoaderCircle } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { cities, getCity, getLandmark } from './data/cities';
import type { CityId } from './data/cities';
import { reducer, createId, getActiveTrip, getProfileVisits, getCityProgress, validateCheckIn } from './lib/model';
import type { Action, AppState, Visit } from './lib/model';
import { loadState, saveState, getStorageError, importBackup } from './lib/storage';
import { useLocation } from './lib/useLocation';
import { usePhoto } from './lib/usePhoto';
import { useLocalSync } from './lib/localSyncHook';
import { useCompass } from './lib/useCompass';
import { useAppNavigation } from './lib/useAppNavigation';
import type { Dialog, View } from './lib/navigation';
import { stampLabel } from './lib/format';
import { MapThemePicker } from './components/MapThemePicker';
import { StatusBar, BottomNav, Modal } from './components/Primitives';
import { CityRegionsScreen, type CityRegionsContext } from './screens/CityRegionsScreen';
import { ExploreScreen } from './screens/ExploreScreen';
import { LandmarkScreen, VisitPhoto } from './screens/LandmarkScreen';
import { CheckInScreen } from './screens/CheckInScreen';
import { TripsScreen, type TripsScreenContext } from './screens/TripsScreen';
import { ProfileScreen } from './screens/ProfileScreen';

export default function App() {
  const [state, setState] = useState(loadState);
  const stateRef = useRef(state);
  const applyState = useCallback((next: AppState) => { stateRef.current = next; setState(next); }, []);
  const localSync = useLocalSync(state, stateRef, applyState);
  const dispatch = useCallback((action: Action) => applyState(reducer(stateRef.current, action)), [applyState]);
  const onCityChange = useCallback((cityId: CityId) => {
    if (stateRef.current.cityId !== cityId) dispatch({ type: 'set-city', cityId });
  }, [dispatch]);
  const { navigation, view, dialog, landmarkId, onDraftChange } = useAppNavigation(state.cityId, onCityChange);
  const checkInVersion = navigation.checkInVersion;
  const setDialog = useCallback((next: Exclude<Dialog, null>) => {
    navigation.navigate({ dialog: next });
  }, [navigation]);
  const setView = useCallback((next: View) => {
    return navigation.navigate({ view: next, dialog: null, ...(next === 'landmark' || next === 'checkin' ? {} : { landmarkId: null }) }, navigation.route.dialog ? 'replace' : 'push');
  }, [navigation]);
  const [pendingCheckIn, setPendingCheckIn] = useState(false);
  const [startName, setStartName] = useState('');
  const [startMode, setStartMode] = useState<'solo' | 'squad'>('solo');
  const [joinCode, setJoinCode] = useState('');
  const [toast, setToast] = useState('');
  const [saveError, setSaveError] = useState(getStorageError() ?? '');
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null);
  const tripContexts = useRef<Record<string, TripsScreenContext>>({});
  const [tripContextVersion, setTripContextVersion] = useState(0);
  const regionContexts = useRef<Record<string, CityRegionsContext>>({});
  const [success, setSuccess] = useState({ title: '', body: '', at: 0 });
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [scale, setScale] = useState(1);
  const city = getCity(state.cityId);
  const trip = getActiveTrip(state);
  const member = trip?.members.find(m => m.id === state.profile.id);
  const location = useLocation(state, dispatch);
  const compass = useCompass();
  const selectedVisit = state.visits.find(v => v.id === selectedVisitId && (v.public || v.userId === state.profile.id || v.recipientIds.includes(state.profile.id)));
  const photoUrl = usePhoto(selectedVisit?.photoId, selectedVisit?.photoUrl);
  const closeDialog = useCallback(() => { navigation.back(); setPendingCheckIn(false); }, [navigation]);
  const showCurrentTrip = () => {
    if (trip) tripContexts.current[state.profile.id] = { selectedId: trip.id, tab: 'timeline', replayProgress: 1000, scrollTop: 0 };
    setTripContextVersion(version => version + 1);
    setView('trips');
  };
  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => { const resize = () => setScale(window.innerWidth <= 600 ? 1 : Math.min(1, (window.innerHeight - 40) / 874)); resize(); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, []);
  useEffect(() => { if (saveState(state)) setSaveError(''); else setSaveError(getStorageError() ?? '本地保存失败，请导出备份。'); }, [state]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3300); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { if (state.locationMode === 'demo' && !state.position) dispatch({ type: 'set-position', position: { ...city.startPosition, at: Date.now(), accuracy: 5, source: 'demo' } }); }, [state.locationMode, state.position, city, dispatch]);
  useEffect(() => { if (!dialog && view !== 'checkin') setPendingCheckIn(false); }, [dialog, view]);
  const showLandmark = (id: string) => {
    const landmark = getLandmark(id);
    if (landmark) navigation.navigate({ view: 'landmark', dialog: null, landmarkId: id, cityId: landmark.cityId });
  };
  const showVisit = (visit: Visit) => { setSelectedVisitId(visit.id); setDialog('photo'); };
  const openStart = () => {
    if (trip) { setDialog('manage'); return; }
    setStartName(`${city.name} · 随心探索`); setStartMode('solo'); setDialog('start');
  };
  const startTrip = () => {
    const current = stateRef.current;
    const next = reducer(current, { type: 'start-trip', id: createId('trip'), at: Date.now(), mode: startMode, name: startName });
    if (next === current) { notify('请先结束当前旅行，再开始新的一程。'); return; }
    applyState(next);
    if (pendingCheckIn && landmarkId) { navigation.navigate({ view: 'checkin', dialog: null }, 'replace'); setPendingCheckIn(false); }
    else { closeDialog(); notify('旅程开始了，去慢慢认识这座城。'); }
  };
  const checkIn = () => {
    if (!trip || trip.cityId !== city.id) { setPendingCheckIn(true); openStart(); return; }
    if (trip.status === 'paused') { notify('恢复这段旅行后，可以记录这次到访。'); setDialog('manage'); return; }
    setView('checkin');
  };
  const setTarget = (id: string) => { dispatch({ type: 'set-target', landmarkId: id }); notify('已设为探索目标 · 仅提供方向与直线距离'); };
  const arrive = () => {
    if (!landmarkId) return;
    const landmark = getLandmark(landmarkId)!;
    const position = { lat: landmark.lat, lng: landmark.lng, at: Date.now(), accuracy: 5, source: 'demo' as const };
    dispatch({ type: 'set-position', position });
    if (trip) dispatch({ type: 'add-point', point: { ...position, id: createId('point'), cityId: city.id, tripId: trip.id, userId: state.profile.id } });
    notify('演示位置已更新 · 已记录一个演示位置点');
  };
  const submit = (id: string, photoId: string, share: boolean, note: string) => {
    if (!landmarkId) throw new Error('当前打卡页面已关闭，请重新进入地标。');
    const latest = stateRef.current;
    const existing = latest.visits.find(visit => visit.id === id);
    if (existing) {
      if (existing.landmarkId === landmarkId && existing.photoId === photoId && existing.userId === state.profile.id) return;
      throw new Error('提交标识已使用，请重新进入地标。');
    }
    if (navigation.route.view !== 'checkin' || navigation.route.landmarkId !== landmarkId || navigation.checkInVersion !== checkInVersion) {
      throw new Error('已离开这次打卡，尚未写入到访记录。请重新进入地标。');
    }
    if (latest.profile.id !== state.profile.id || latest.activeTripId !== state.activeTripId || latest.locationMode !== state.locationMode || latest.cityId !== state.cityId) {
      throw new Error('身份、旅行或位置方式已变化，请回到当前地标重新提交。');
    }
    const at = Date.now();
    const validation = validateCheckIn(latest, landmarkId, at);
    if (!validation.ok) throw new Error(validation.reason);
    const next = reducer(latest, { type: 'check-in', id, landmarkId, photoId, at, shareWithSquad: share, note });
    if (next === latest) throw new Error('这次记录没有保存，请重新检查旅行状态。');
    if (!saveState(next)) throw new Error(getStorageError() ?? '照片已保存，记录尚未写入，请重试。');
    const visit = next.visits.find(item => item.id === id)!;
    applyState(next);
    onDraftChange(false);
    setSuccess({
      title: visit.unlockedRegionIds.length ? '一片新的城市，向你展开了。' : '这次抵达，已经记下。',
      body: visit.unlockedRegionIds.length ? `${getLandmark(landmarkId)!.name} · 展开 ${visit.unlockedRegionIds.length} 片区域\n合影与这一刻，已保存在当前设备。` : `${getLandmark(landmarkId)!.name} · 新增一条到访记录\n时间与照片已保存，地图进度不变。`, at,
    });
    navigation.navigate({ view: 'landmark', dialog: 'success' }, 'replace', true);
  };
  const chooseCity = (id: CityId) => {
    if (!navigation.navigate({ cityId: id, dialog: null, view: view === 'regions' ? 'regions' : 'explore', landmarkId: null }, dialog ? 'replace' : 'push')) return;
    if (trip && trip.cityId !== id) notify('当前旅行留在原城市，可查看地图或先结束这一程。');
  };
  const joinSquad = () => {
    const current = stateRef.current;
    const found = current.trips.find(item => item.mode === 'squad' && item.status !== 'ended' && item.squadCode === joinCode.trim().toUpperCase());
    if (!found) { notify('本机没有这个邀请码，请检查后再试。'); return; }
    const next = reducer(current, { type: 'join-squad', tripId: found.id, at: Date.now() });
    if (next === current) { notify('请先结束自己的当前旅行，再加入小队。'); return; }
    applyState(next); navigation.navigate({ dialog: 'manage', cityId: next.cityId }, 'replace'); notify('已加入本机小队，之后的新记录按成员范围共享。');
  };
  const restore = async () => {
    if (!restoreFile || restoring) return;
    if (!localSync.pauseForImport()) { notify('无法安全暂停同步，备份尚未导入。请检查本地存储后重试。'); return; }
    setRestoring(true);
    try {
      const previous = JSON.stringify(stateRef.current);
      const imported = await importBackup(restoreFile);
      try { localStorage.setItem('vesluma:before-import', previous); } catch { /* The user still has the selected backup. */ }
      applyState(imported);
      navigation.navigate({ view: 'profile', dialog: null, landmarkId: null, cityId: imported.cityId }, 'replace', true);
      notify('记录与照片已从备份恢复');
    } catch (error) { notify(error instanceof Error ? error.message : '备份格式无法识别'); }
    finally { setRestoring(false); }
  };
  const locationStatus = location.error || (state.position?.source === 'device'
    ? `已获得设备位置 · 误差约 ${Math.round(state.position.accuracy)} 米${state.position.accuracy > 100 ? '，精度不足，请到开阔处重试。' : '。'}`
    : location.watching ? '正在请求设备位置。如有系统提示，请允许定位。' : '等待位置更新。');
  return <div className={`app-stage ${Capacitor.isNativePlatform() ? 'native-app' : ''}`}><div className="device-stage" style={{'--scale':scale} as React.CSSProperties}><div className="phone-shell">{!Capacitor.isNativePlatform() && <StatusBar />}<main className="app-content">
    {saveError && <div className="save-banner" role="alert">{saveError}</div>}
    {view === 'explore' && <ExploreScreen onRegions={() => setView('regions')} state={state} onCity={() => setDialog('cities')} onTrip={() => trip ? setDialog('manage') : openStart()} onLandmark={showLandmark} onTarget={setTarget} onLocation={() => setDialog('location')} onMapTheme={() => setDialog('map-theme')} compassHeading={compass.heading} />}
    {view === 'regions' && <CityRegionsScreen key={`${state.profile.id}:${state.cityId}`} initialContext={regionContexts.current[`${state.profile.id}:${state.cityId}`]} onContextChange={context => { regionContexts.current[`${state.profile.id}:${state.cityId}`] = context; }} state={state} onBack={() => navigation.back()} onCity={() => setDialog('cities')} onLandmark={showLandmark} />}
    {view === 'landmark' && landmarkId && <LandmarkScreen onRegions={() => setView('regions')} state={state} landmarkId={landmarkId} onBack={() => navigation.back()} onCheckIn={checkIn} onTarget={() => { setTarget(landmarkId); setView('explore'); }} onPublic={showVisit} />}
    {view === 'checkin' && landmarkId && <CheckInScreen key={landmarkId} state={state} landmarkId={landmarkId} locationError={location.error} onDraftChange={onDraftChange} onBack={() => navigation.back()} onArrive={arrive} onSubmit={submit} onLocation={() => { location.retry(); setDialog('location'); }} />}
    {view === 'trips' && <TripsScreen key={`${state.profile.id}:${tripContextVersion}`} initialContext={tripContexts.current[state.profile.id]} onContextChange={context => { tripContexts.current[state.profile.id] = context; }} state={state} onStart={openStart} onManage={() => setDialog('manage')} onLandmark={showLandmark} onVisit={showVisit} />}
    {view === 'profile' && <ProfileScreen state={state} sync={localSync} onAccount={() => setDialog('account')} onLocation={() => setDialog('location')} onMapTheme={() => setDialog('map-theme')} onCity={chooseCity} onImport={file => { setRestoreFile(file); setDialog('restore'); }} onGallery={() => setDialog('gallery')} onToast={notify} />}
  </main><BottomNav active={view === 'landmark' || view === 'checkin' || view === 'regions' ? 'explore' : view} onChange={next => { if (setView(next)) setPendingCheckIn(false); }} />
  {dialog && <Modal title={({cities:'去遇见哪座城？',start:'开始一段新的旅程',manage:'此刻的旅程',account:'本地体验账号',location:'位置与体验方式',join:'加入本次小队',photo:'这一刻的记忆',gallery:'我的相册',success:'抵达，已被记住',restore:'从备份恢复记录','map-theme':'地图显示主题'})[dialog]} onClose={closeDialog}>
    {dialog === 'cities' && <><p className="modal-description">每座城市的开图进度都独立保留。你可以从任何地标开始。</p><div className="modal-options">{cities.map(c => { const progress = getCityProgress(state,c.id); return <button className={`city-option ${state.cityId === c.id ? 'selected' : ''}`} key={c.id} onClick={() => chooseCity(c.id)}><img src={c.landmarks[0].cover} alt="城市概念图"/><div><b>{c.name}</b><span>{c.enName} · 已展开 {progress.unlocked} / {progress.total} 片区域</span></div>{c.id === state.cityId ? <Check size={18}/> : <ChevronRight size={17}/>}</button>; })}</div><div className="notice-box">{cities.map(item => `${item.name} ${item.regions.length} 区`).join('、')}，按完整市域规划。仅一级地标承担开图任务，二、三级地标记录游览。<br/>分区采用公开资料规划，候选拍照点仍待现场核实。</div></>}
    {dialog === 'start' && <><p className="modal-description">不规定你的路线，也不规定你的节奏。给这一程起个名字，就出发吧。</p><label className="field-label" htmlFor="trip-name">旅程名称</label><input id="trip-name" value={startName} maxLength={40} onChange={e=>setStartName(e.target.value)}/><div className="choice-row"><button className={startMode==='solo'?'selected':''} onClick={()=>setStartMode('solo')}><UserRound size={23}/>个人探索</button><button className={startMode==='squad'?'selected':''} onClick={()=>setStartMode('squad')}><UsersRound size={23}/>小队同行</button></div><button className="primary-button full-width" onClick={startTrip}>出发，留下这一程<ArrowRight size={17}/></button><button className="text-button full-width" onClick={()=>{setJoinCode('');setDialog('join');}}>已有邀请代码？加入小队</button><div className="notice-box">当前采用前台体验采样。开始／结束旅行用于本地归档，持续定位的正式生命周期仍待专门设计。</div></>}
    {dialog === 'manage' && trip && <><p className="modal-description"><b>{trip.name}</b><br/>{getCity(trip.cityId).name} · {stampLabel(trip.startedAt)} 开始 · {trip.status==='paused'?'前台采样已暂停':'进行中'}</p>{trip.cityId!==city.id && <button className="secondary-button full-width" onClick={()=>chooseCity(trip.cityId)}>回到 {getCity(trip.cityId).name} 的当前旅行</button>}{trip.mode==='squad' ? <><div className="code-box">邀请代码 · 本机体验账号可加入<strong>{trip.squadCode}</strong><button className="text-button" onClick={async()=>{try{await navigator.clipboard.writeText(trip.squadCode??'');notify('邀请代码已复制');}catch{notify(`邀请代码：${trip.squadCode}`);}}}><Copy size={13}/>复制代码</button></div><div className="member-list">{trip.members.filter(m=>m.leftAt===undefined).map(m=><div className="member-row" key={m.id}><div className="avatar">{m.name.slice(0,1)}</div><div><b>{m.name}{m.id===state.profile.id?' · 你':''}</b><small>{m.solo?'暂时独行 · 继续接收共享':'同行中'}</small></div><UsersRound size={17} color="#94af9f"/></div>)}</div><button className="secondary-button full-width" onClick={()=>{dispatch({type:'set-solo',solo:!member?.solo});notify(member?.solo?'已恢复同行':'开始临时独行，仍会接收小队共享。');}}><UserRound size={16}/>{member?.solo?'恢复同行':'临时独行'}</button></> : <button className="secondary-button full-width" onClick={()=>dispatch({type:'create-squad',at:Date.now()})}><UsersRound size={18}/>把这一程变成小队旅行</button>}<div className="choice-row"><button onClick={()=>{dispatch({type:trip.status==='paused'?'resume-trip':'pause-trip',at:Date.now()});notify(trip.status==='paused'?'已恢复前台位置点采样':'已暂停前台位置点采样');}}>{trip.status==='paused'?<Play size={19}/>:<Pause size={19}/>} {trip.status==='paused'?'恢复采样':'暂停采样'}</button><button onClick={()=>{showCurrentTrip();}}><Image size={20}/>回看这一路</button></div><button className="danger-button" onClick={()=>{dispatch({type:trip.userId===state.profile.id?'end-trip':'leave-squad',at:Date.now()});showCurrentTrip();notify('记录已归档，开图进度永久保留。');}}>{trip.userId===state.profile.id?'结束并归档本次旅行':'退出本次小队，保留已有记录'}</button><div className="notice-box">小队照片提交一次，共享给提交时的成员。独行新照片默认仅自己，加入前的内容不自动补发。本体验版共享发生在当前设备。</div></>}
    {dialog === 'account' && <><p className="modal-description">切换两个本地身份，验证个人进度隔离和小队一次提交。它们不是云端账号。</p><div className="modal-options">{state.profiles.map(p=><button key={p.id} className={`city-option ${p.id===state.profile.id?'selected':''}`} onClick={()=>{setSelectedVisitId(null);dispatch({type:'switch-profile',profile:p});navigation.navigate({view:'profile',dialog:null,landmarkId:null,cityId:stateRef.current.cityId},'replace');notify(`已切换到 ${p.name}`);}}><div className="avatar">{p.name.slice(0,1)}</div><div><b>{p.name}</b><span>{p.id===state.profile.id?'当前身份':'独立的个人记录与进度'}</span></div>{p.id===state.profile.id&&<Check size={18}/>}</button>)}</div><button className="text-button full-width" onClick={()=>{setJoinCode('');setDialog('join');}}>使用邀请代码加入本机小队</button></>}
    {dialog === 'join' && <><p className="modal-description">输入本机已创建小队的邀请代码。加入后接收新共享，既有个人进度不复制给队友。</p><input aria-label="小队邀请代码" placeholder="输入 6 位邀请代码" value={joinCode} maxLength={20} onChange={e=>setJoinCode(e.target.value.toUpperCase())}/><button className="primary-button full-width" onClick={joinSquad}><UsersRound size={17}/>加入这次旅行</button><p className="quiet-note">可在“我的”切换本地身份，体验另一位成员。</p></>}
    {dialog === 'location' && <><p className="modal-description">演示模式可以模拟抵达地标，方便在电脑体验开图闭环。设备模式只使用实际取得的位置。</p><div className="choice-row"><button className={state.locationMode==='demo'?'selected':''} onClick={()=>dispatch({type:'set-location-mode',mode:'demo'})}><Sparkles size={23}/>演示位置</button><button className={state.locationMode==='device'?'selected':''} onClick={()=>{dispatch({type:'set-location-mode',mode:'device'});location.retry();}}><MapPin size={23}/>设备定位</button></div>{state.locationMode==='device'&&<p className="modal-description">{locationStatus}</p>}<button className="secondary-button full-width" onClick={async()=>{await compass.enable();}}><Compass size={18}/>{compass.heading!==null?'方向传感器已启用':'启用方向传感器'}</button><p className="quiet-note">{compass.status==='denied'?'方向权限未获允许，保留北向参考。':compass.heading!==null?'平放手机，指南针将相对手机朝向指向目标。':'未获得可靠朝向时，箭头使用北向参考。'}</p><div className="notice-box">设备定位在前台获取，位置点按移动速度间隔保存；迷雾中也继续留下点。当前实现不承诺锁屏或后台持续记录，正式定位策略尚待设计。</div><button className="primary-button full-width" onClick={closeDialog}>回到这座城<Navigation size={16}/></button></>}
    {dialog === 'photo' && selectedVisit && <>{photoUrl ? <img className="photo-modal-image" src={photoUrl} alt="保存的到访照片"/>:<p className="modal-description">照片暂未加载，请稍后重试。</p>}<div className="photo-meta"><b>{getLandmark(selectedVisit.landmarkId)?.name}</b> · {stampLabel(selectedVisit.at)}<br/>{selectedVisit.note&&<>{selectedVisit.note}<br/></>}{selectedVisit.source==='squad'?'小队共同记录':'个人记录'} · {selectedVisit.public?'已主动公开':'私密保存'}{selectedVisit.demo&&' · 演示记录'}</div>{selectedVisit.userId===state.profile.id ? <button className="secondary-button full-width" onClick={()=>{dispatch({type:'set-public',visitId:selectedVisit.id,public:!selectedVisit.public});notify(selectedVisit.public?'已从地标相册撤下，原记录仍保留。':'已公开这张照片 · 仅在本机地标相册可见');}}>{selectedVisit.public?<LockKeyhole size={17}/>:<Globe size={17}/>} {selectedVisit.public?'撤下公开照片':'将这张照片公开到地标相册'}</button>:<p className="quiet-note">公开与撤下由原上传者操作。</p>}<p className="quiet-note">仅公开这一条内容，不包含整段位置点或其他照片。</p></>}
    {dialog === 'photo' && !selectedVisit && <p className="modal-description">该照片不属于当前身份，或已不可用。请关闭后重新选择。</p>}
    {dialog === 'gallery' && <>{getProfileVisits(state).length?<div className="visit-grid">{getProfileVisits(state).slice().reverse().map(v=><div key={v.id}><VisitPhoto visit={v} onClick={()=>showVisit(v)}/><small>{getLandmark(v.landmarkId)?.name} · {stampLabel(v.at)}</small></div>)}</div>:<div className="small-empty"><CameraEmpty/><p>还没有照片，下一次抵达时留一张吧。</p></div>}</>}
    {dialog === 'success' && <div className="success-content"><div className="success-symbol"><Check size={37} strokeWidth={1.5}/></div><h3>{success.title}</h3><p style={{whiteSpace:'pre-line'}}>{success.body}</p><small>{stampLabel(success.at)}{state.locationMode==='demo'?' · 演示记录':''}</small><button className="primary-button" onClick={()=>{setView('explore');}}>继续探索这座城<ArrowRight size={17}/></button><button className="text-button" onClick={()=>{showCurrentTrip();}}>回看这一程</button></div>}
    {dialog === 'map-theme' && <MapThemePicker value={state.mapTheme ?? 'paper'} onChange={theme => { dispatch({type:'set-map-theme',theme}); notify(theme === 'paper' ? '已切换为纸感地图' : '已切换为藏宝图'); }} />}
    {dialog === 'restore' && <><p className="modal-description">将恢复 <b>{restoreFile?.name}</b> 中的记录、照片与本地身份。当前记录会另存一份元数据恢复副本，导入前建议先导出完整备份。</p><div className="notice-box">这是替换当前设备资料的操作。无效或不完整的备份不会写入。</div><button className="primary-button full-width" disabled={restoring} onClick={restore}>{restoring?<LoaderCircle className="spin" size={16}/>:<Check size={16}/>}恢复这份备份</button><button className="text-button full-width" onClick={closeDialog}>保留当前记录</button></>}
  </Modal>}{toast && <div className="toast" role="status"><Check size={16}/>{toast}</div>}</div></div></div>;
}
function CameraEmpty(){return <Image size={25}/>;}
