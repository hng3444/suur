'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { BackLayers } from '@/lib/back-layers';

let webLayers: BackLayers | null = null;

function layers() {
  if (webLayers) return webLayers;
  webLayers = new BackLayers({
    push: () => window.history.pushState({ suurSurface: true }, ''),
    back: () => window.history.back(),
  });
  window.addEventListener('popstate', () => webLayers?.popped());
  return webLayers;
}

/** Makes browser and installed-PWA Back close the foremost Suur surface first. */
export function useWebBackLayer(enabled: boolean, priority: number, onBack: () => void) {
  const callback = useRef(onBack);
  useLayoutEffect(() => { callback.current = onBack; });
  useEffect(() => {
    if (enabled) return layers().add(priority, () => callback.current());
  }, [enabled, priority]);
}
