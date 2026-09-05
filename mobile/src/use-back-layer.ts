import { useEffect, useLayoutEffect, useRef } from 'react';
import { BackLayers } from '../../lib/back-layers.ts';

const layers = new BackLayers({
  push: () => window.history.pushState({ suurOverlay: true }, ''),
  back: () => window.history.back(),
});
window.addEventListener('popstate', () => layers.popped());
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') layers.back();
});

export function useBackLayer(enabled: boolean, priority: number, onBack: () => void) {
  const callback = useRef(onBack);
  useLayoutEffect(() => { callback.current = onBack; });
  useEffect(() => {
    if (enabled) return layers.add(priority, () => callback.current());
  }, [enabled, priority]);
}
