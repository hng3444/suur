import { useLayoutEffect, useRef, type ReactNode } from 'react';

/** Keep source/keyboard order row-wise while allowing cards of different heights. */
export function NotesLayout({ children, grid }: { children: ReactNode; grid: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const cards = Array.from(root.current?.children || []) as HTMLElement[];
    if (!grid) { cards.forEach((card) => card.style.removeProperty('grid-row-end')); return; }
    const measure = (card: HTMLElement) => {
      const span = Math.ceil(card.getBoundingClientRect().height + 12);
      if (card.style.gridRowEnd !== `span ${span}`) card.style.gridRowEnd = `span ${span}`;
    };
    const observer = new ResizeObserver((entries) => entries.forEach((entry) => measure(entry.target as HTMLElement)));
    cards.forEach((card) => { measure(card); observer.observe(card); });
    return () => observer.disconnect();
  }, [children, grid]);
  return <div ref={root} className="notes-layout">{children}</div>;
}
