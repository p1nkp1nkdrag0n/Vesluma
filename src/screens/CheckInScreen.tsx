import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, Check, MapPin, LockKeyhole, UsersRound, ImagePlus, LoaderCircle, Navigation } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Camera as NativeCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import type { AppState } from '../lib/model';
import { getActiveTrip, getLandmarkVisits, validateCheckIn, createId } from '../lib/model';
import { getLandmark, getRegion } from '../data/cities';
import { savePhoto } from '../lib/storage';

export function CheckInScreen({ state, landmarkId, onBack, onArrive, onSubmit, onLocation }: { state: AppState; landmarkId: string; onBack: () => void; onArrive: () => void; onSubmit: (id: string, photoId: string, share: boolean, note: string) => void; onLocation: () => void }) {
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
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const submissionId = useRef(createId('visit'));
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 10000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (!photo) { setPhotoUrl(''); return; } const url = URL.createObjectURL(photo); setPhotoUrl(url); return () => URL.revokeObjectURL(url); }, [photo]);
  const validation = validateCheckIn(state, landmarkId, now);
  const hasVisited = getLandmarkVisits(state, landmarkId).length > 0;
  const choosePhoto = async () => { if (!Capacitor.isNativePlatform()) { input.current?.click(); return; } try { const image = await NativeCamera.getPhoto({ quality: 85, resultType: CameraResultType.Uri, source: CameraSource.Prompt, width: 1600, correctOrientation: true }); if (image.webPath) { const response = await fetch(image.webPath); setPhoto(await response.blob()); setExample(false); setError(''); } } catch { setError('还没有选定照片，可以重新拍摄或选择。'); } };
  const selectFile = (file?: File) => { if (!file) return; if (!file.type.startsWith('image/')) { setError('请选择图片文件。'); return; } if (file.size > 20 * 1024 * 1024) { setError('请选择小于 20 MB 的照片。'); return; } setPhoto(file); setExample(false); setError(''); };
  const useExample = async () => { setBusy(true); try { const response = await fetch(landmark.cover); if (!response.ok) throw new Error(); setPhoto(await response.blob()); setExample(true); setError(''); } catch { setError('示例图片没有加载成功，请选择本地照片。'); } finally { setBusy(false); } };
  const submit = async () => { if (busy || !photo || !validation.ok) return; if (example && (state.locationMode !== 'demo' || state.position?.source !== 'demo')) { setError('示例图片只用于演示模式。设备定位下请选择真实合影。'); return; } setBusy(true); setError(''); const photoId = `photo-${submissionId.current}`; try { await savePhoto(photoId, photo); onSubmit(submissionId.current, photoId, share, note); } catch (e) { setError(e instanceof Error ? e.message : '当前设备未能保存照片，请保留页面并重试。'); setBusy(false); } };
  return <div className="checkin-screen scroll-screen"><header className="simple-heading"><button className="icon-button" aria-label="返回地标详情" onClick={onBack}><ArrowLeft size={21} /></button><h2>{hasVisited ? '记录这次到访' : '留下一次抵达'}</h2><span /></header><div className="screen-padding"><div className="checkin-place"><img src={landmark.cover} alt="城市概念影像" /><div><h1>{landmark.name}</h1><p>{canReveal ? `一张合影，展开${region.name}` : '保存这次到访与照片，开图进度保持不变'}</p></div></div><div className="photo-intro"><h2>到达这里，留下一张合影。</h2><p>让这一刻，成为属于你的记忆。</p></div><input ref={input} type="file" accept="image/*" capture="user" className="sr-only" aria-label="拍摄或选择合影" onChange={e => selectFile(e.target.files?.[0])} /><button className={`photo-picker ${photoUrl ? 'has-photo' : ''}`} onClick={choosePhoto}>{photoUrl ? <><img src={photoUrl} alt={example ? "示例图片，非真实到访照片" : `${landmark.name}准备保存的到访合影`} /><span>{example ? <ImagePlus size={16} /> : <Camera size={16} />}{example ? "示例图片 · 更换照片" : "更换照片"}</span></> : <><Camera size={32} strokeWidth={1.6} /><b>拍摄或选择合影</b><small>推荐与地标建筑或标识一起入镜</small></>}</button>{state.locationMode === 'demo' && <button className="example-photo-button" disabled={busy} onClick={useExample}><ImagePlus size={14} />{example ? '当前为示例图片 · 非真实到访照片' : '使用示例图片体验流程'}</button>}<label className="field-label" htmlFor="visit-note">给这一刻写句话 <span>选填</span></label><textarea id="visit-note" value={note} maxLength={200} rows={2} onChange={e => setNote(e.target.value)} placeholder="比如，终于见到了心心念念的这座城。" /><p className="field-label">谁可以看到这张合影？</p><div className="privacy-switch" role="group" aria-label="照片共享范围"><button className={!share ? 'selected' : ''} aria-pressed={!share} onClick={() => setShare(false)}><LockKeyhole size={17} />仅自己</button><button disabled={trip?.mode !== 'squad'} className={share ? 'selected' : ''} aria-pressed={share} onClick={() => setShare(true)}><UsersRound size={17} />本次小队</button></div><div className={`location-validation ${validation.ok ? 'valid' : ''}`}><MapPin size={20} /><div><b>{validation.ok ? `${state.locationMode === 'demo' ? '演示位置' : '位置'}校验通过` : '等待有效的到场位置'}</b><small>{validation.ok ? `距离地标 ${Math.round(validation.distanceMeters ?? 0)} m · ${state.position?.accuracy ?? 0} m 精度` : validation.reason}</small></div>{validation.ok && <Check size={18} />}</div>{state.locationMode === 'demo' ? <button className="secondary-button full-width" onClick={onArrive}><Navigation size={16} />模拟抵达此地</button> : <button className="text-button full-width" onClick={onLocation}>重新获取设备位置</button>}{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button submit-checkin" disabled={!photo || !validation.ok || busy || trip?.status !== 'active'} onClick={submit}>{busy ? <LoaderCircle className="spin" size={18} /> : <Check size={18} />}{canReveal ? '保存并展开地图' : '保存这次到访'}</button><p className="quiet-note">默认私密 · 保存在当前设备<br />{state.locationMode === 'demo' ? '演示记录会单独标记，不代表真实到访。' : '本次仅记录设备实际取得的位置。'}</p></div></div>;
}
