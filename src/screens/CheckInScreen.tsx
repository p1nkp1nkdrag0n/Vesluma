import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, Check, MapPin, LockKeyhole, UsersRound, ImagePlus, LoaderCircle, Navigation } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Camera as NativeCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import type { AppState } from '../lib/model';
import { getActiveTrip, getLandmarkVisits, validateCheckIn, createId } from '../lib/model';
import { getLandmark, getRegion } from '../data/cities';
import { deletePhoto, savePhoto } from '../lib/storage';

interface CheckInProps {
  state: AppState;
  landmarkId: string;
  onBack: () => void;
  onArrive: () => void;
  onSubmit: (id: string, photoId: string, share: boolean, note: string) => void;
  onLocation: () => void;
  locationError?: string;
  onDraftChange?: (dirty: boolean) => void;
}

type PhotoOperation = 'example' | 'camera' | 'saving' | null;

export function CheckInScreen({ state, landmarkId, onBack, onArrive, onSubmit, onLocation, locationError = '', onDraftChange }: CheckInProps) {
  const landmark = getLandmark(landmarkId)!;
  const trip = getActiveTrip(state);
  const canReveal = landmark.tier === 1 && landmark.regionIds.some(id => !state.unlocks.some(u => u.userId === state.profile.id && u.regionId === id));
  const region = getRegion(landmark.regionId)!;
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState('');
  const [example, setExample] = useState(false);
  const [share, setShare] = useState(trip?.mode === 'squad' && !trip.members.find(m => m.id === state.profile.id)?.solo);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<PhotoOperation>(null);
  const busyRef = useRef<PhotoOperation>(null);
  const input = useRef<HTMLInputElement>(null);
  const submissionId = useRef(createId('visit'));
  const mounted = useRef(true);
  const photoOperation = useRef(0);
  const photoRequest = useRef<AbortController | null>(null);
  const [, setClockTick] = useState(0);
  const dirty = Boolean(photo || note.trim() || busy);
  const saving = busy === 'saving';
  const setOperation = (value: PhotoOperation) => { busyRef.current = value; setBusy(value); };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      photoOperation.current++;
      photoRequest.current?.abort();
      onDraftChange?.(false);
    };
  }, [onDraftChange]);
  useEffect(() => { onDraftChange?.(dirty); }, [dirty, onDraftChange]);
  useEffect(() => { const timer = setInterval(() => setClockTick(tick => tick + 1), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (!photo) { setPhotoUrl(''); return; } const url = URL.createObjectURL(photo); setPhotoUrl(url); return () => URL.revokeObjectURL(url); }, [photo]);
  const validation = validateCheckIn(state, landmarkId, Date.now());
  const hasVisited = getLandmarkVisits(state, landmarkId).length > 0;
  const cancelPhotoRequest = () => {
    photoOperation.current++;
    photoRequest.current?.abort();
    photoRequest.current = null;
  };
  const acceptPhoto = (image: Blob, isExample: boolean) => {
    if (!image.type.startsWith('image/') || image.size === 0) throw new Error('请选择有效的图片文件。');
    if (image.size > 20 * 1024 * 1024) throw new Error('请选择小于 20 MB 的照片。');
    setPhoto(image); setExample(isExample); setError('');
  };
  const choosePhoto = async () => {
    if (busyRef.current === 'saving' || busyRef.current === 'camera') return;
    cancelPhotoRequest();
    setOperation(null);
    if (!Capacitor.isNativePlatform()) { input.current?.click(); return; }
    const operation = photoOperation.current;
    setOperation('camera');
    try {
      const image = await NativeCamera.getPhoto({ quality: 85, resultType: CameraResultType.Uri, source: CameraSource.Prompt, width: 1600, correctOrientation: true });
      if (!mounted.current || operation !== photoOperation.current) return;
      if (!image.webPath) throw new Error('还没有选定照片，可以重新拍摄或选择。');
      const request = new AbortController();
      photoRequest.current = request;
      const deadline = setTimeout(() => request.abort(), 15_000);
      try {
        const response = await fetch(image.webPath, { signal: request.signal });
        if (!response.ok) throw new Error('照片读取失败，请重新选择。');
        const blob = await response.blob();
        if (mounted.current && operation === photoOperation.current) acceptPhoto(blob, false);
      } finally { clearTimeout(deadline); }
    } catch (cause) {
      if (mounted.current && operation === photoOperation.current) {
        setError(cause instanceof Error && !['AbortError', 'TypeError'].includes(cause.name) ? cause.message
          : cause instanceof Error && cause.name === 'AbortError' ? '照片读取超时或中断，请重新拍摄或选择。'
          : '照片没有读取成功，请检查网络后重试，或重新选择本地照片。');
      }
    } finally {
      if (mounted.current && operation === photoOperation.current) { photoRequest.current = null; setOperation(null); }
    }
  };
  const selectFile = (file?: File) => {
    if (!file || busyRef.current === 'saving') return;
    cancelPhotoRequest();
    setOperation(null);
    try { acceptPhoto(file, false); } catch (cause) { setError(cause instanceof Error ? cause.message : '照片无法读取。'); }
  };
  const useExample = async () => {
    if (busyRef.current) return;
    cancelPhotoRequest();
    const operation = photoOperation.current;
    const request = new AbortController();
    photoRequest.current = request;
    setOperation('example');
    const deadline = setTimeout(() => request.abort(), 15_000);
    try {
      const response = await fetch(landmark.cover, { signal: request.signal });
      if (!response.ok) throw new Error('示例图片没有加载成功，请选择本地照片或重试。');
      const blob = await response.blob();
      if (mounted.current && operation === photoOperation.current) acceptPhoto(blob, true);
    } catch (cause) {
      if (mounted.current && operation === photoOperation.current) {
        setError(cause instanceof Error && !['AbortError', 'TypeError'].includes(cause.name) ? cause.message
          : cause instanceof Error && cause.name === 'AbortError' ? '示例图片加载超时，请选择本地照片或重试。'
          : '示例图片没有加载成功，请选择本地照片或重试。');
      }
    } finally {
      clearTimeout(deadline);
      if (mounted.current && operation === photoOperation.current) { photoRequest.current = null; setOperation(null); }
    }
  };
  const submit = async () => {
    if (busyRef.current || !photo) return;
    const currentValidation = validateCheckIn(state, landmarkId, Date.now());
    if (!currentValidation.ok) { setError(currentValidation.reason); return; }
    if (example && (state.locationMode !== 'demo' || state.position?.source !== 'demo')) {
      setError('示例图片只用于演示模式。设备定位下请选择真实合影。'); return;
    }
    setOperation('saving'); setError('');
    const photoId = `photo-${submissionId.current}`;
    try {
      await savePhoto(photoId, photo);
      if (!mounted.current) { void deletePhoto(photoId).catch(() => {}); return; }
      onSubmit(submissionId.current, photoId, share, note);
    } catch (cause) {
      if (mounted.current) { setError(cause instanceof Error ? cause.message : '当前设备未能保存照片，请保留页面并重试。'); setOperation(null); }
    }
  };
  return <div className="checkin-screen scroll-screen">
    <header className="simple-heading"><button className="icon-button" aria-label="返回地标详情" onClick={onBack}><ArrowLeft size={21} /></button><h2>{hasVisited ? '记录这次到访' : '留下一次抵达'}</h2><span /></header>
    <div className="screen-padding">
      <div className="checkin-place"><img src={landmark.cover} alt="城市概念影像" /><div><h1>{landmark.name}</h1><p>{canReveal ? `一张合影，展开${region.name}` : '保存这次到访与照片，开图进度保持不变'}</p></div></div>
      <div className="photo-intro"><h2>到达这里，留下一张合影。</h2><p>让这一刻，成为属于你的记忆。</p></div>
      <input ref={input} type="file" accept="image/*" capture="user" className="sr-only" aria-label="拍摄或选择合影" disabled={saving} onChange={e => { selectFile(e.target.files?.[0]); e.target.value = ''; }} />
      <button className={`photo-picker ${photoUrl ? 'has-photo' : ''}`} disabled={saving || busy === 'camera'} onClick={choosePhoto}>
        {photoUrl ? <><img src={photoUrl} alt={example ? '示例图片，非真实到访照片' : `${landmark.name}准备保存的到访合影`} /><span>{example ? <ImagePlus size={16} /> : <Camera size={16} />}{example ? '示例图片 · 更换照片' : '更换照片'}</span></> : <><Camera size={32} strokeWidth={1.6} /><b>拍摄或选择合影</b><small>推荐与地标建筑或标识一起入镜</small></>}
      </button>
      {state.locationMode === 'demo' && <button className="example-photo-button" disabled={Boolean(busy)} onClick={useExample}><ImagePlus size={14} />{busy === 'example' ? '示例图片加载中 · 可改选本地照片' : example ? '当前为示例图片 · 非真实到访照片' : '使用示例图片体验流程'}</button>}
      <label className="field-label" htmlFor="visit-note">给这一刻写句话 <span>选填</span></label>
      <textarea id="visit-note" value={note} maxLength={200} rows={2} disabled={saving} onChange={e => setNote(e.target.value)} placeholder="比如，终于见到了心心念念的这座城。" />
      <p className="field-label">谁可以看到这张合影？</p>
      <div className="privacy-switch" role="group" aria-label="照片共享范围"><button disabled={saving} className={!share ? 'selected' : ''} aria-pressed={!share} onClick={() => setShare(false)}><LockKeyhole size={17} />仅自己</button><button disabled={saving || trip?.mode !== 'squad'} className={share ? 'selected' : ''} aria-pressed={share} onClick={() => setShare(true)}><UsersRound size={17} />本次小队</button></div>
      <div className={`location-validation ${validation.ok ? 'valid' : ''}`}><MapPin size={20} /><div><b>{validation.ok ? `${state.locationMode === 'demo' ? '演示位置' : '位置'}校验通过` : '等待有效的到场位置'}</b><small>{validation.ok ? `距离地标 ${Math.round(validation.distanceMeters ?? 0)} m · ${state.position?.accuracy ?? 0} m 精度` : state.locationMode === 'device' && locationError ? locationError : validation.reason}</small></div>{validation.ok && <Check size={18} />}</div>
      {state.locationMode === 'demo' ? <button className="secondary-button full-width" disabled={saving} onClick={onArrive}><Navigation size={16} />模拟抵达此地</button> : <button className="text-button full-width" disabled={saving} onClick={onLocation}>重新获取设备位置</button>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button submit-checkin" disabled={!photo || !validation.ok || Boolean(busy) || trip?.status !== 'active'} onClick={submit}>{busy ? <LoaderCircle className="spin" size={18} /> : <Check size={18} />}{saving ? '正在保存到当前设备' : canReveal ? '保存并展开地图' : '保存这次到访'}</button>
      <p className="quiet-note">默认私密 · 保存在当前设备<br />{state.locationMode === 'demo' ? '演示记录会单独标记，不代表真实到访。' : '本次仅记录设备实际取得的位置。'}<br />未保存的照片和备注暂存在本页，刷新或离开后不会保留。</p>
    </div>
  </div>;
}
