import { useEffect, useLayoutEffect, useRef } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { BackLayers } from '../../lib/back-layers.ts';

const layers = new BackLayers({
  push: () => window.history.pushState({ suurOverlay: true }, ''),
  back: () => window.history.back(),
});
window.addEventListener('popstate', () => layers.popped());
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') layers.back();
});

if (Capacitor.getPlatform() === 'android') {
  void App.addListener('backButton', () => {
    // A visible drawer, sheet, reader or editor always consumes Back first.
    // Only the root notes screen is allowed to return to Android's launcher.
    if (!layers.back()) void App.minimizeApp();
  });
}

export function useBackLayer(enabled: boolean, priority: number, onBack: () => void) {
  const callback = useRef(onBack);
  useLayoutEffect(() => { callback.current = onBack; });
  useEffect(() => {
    if (enabled) return layers.add(priority, () => callback.current());
  }, [enabled, priority]);
}
