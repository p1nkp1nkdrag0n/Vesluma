import { useEffect, useState } from 'react';
import { getPhotoBlob } from './storage';
export function usePhoto(photoId?: string, fallback?: string) {
  const [url, setUrl] = useState<string | undefined>(fallback);
  useEffect(() => { let active = true; let objectUrl: string | undefined; setUrl(fallback); if (photoId) getPhotoBlob(photoId).then(blob => { if (blob && active) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); } }).catch(() => {}); return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); }; }, [photoId, fallback]);
  return url;
}
