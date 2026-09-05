/* eslint-disable @next/next/no-img-element */

import type { BrandingSettings } from '@/lib/types';

export function BrandMark({ branding, original = false }: { branding: BrandingSettings; original?: boolean }) {
  if (!original && branding.hasCustomIcon) {
    return <img className="brand-logo-image" src={`/api/branding/icon?v=${encodeURIComponent(branding.iconVersion)}`} alt="" aria-hidden="true" />;
  }
  return <img className="brand-logo-image" src="/suuricon.png" alt="" aria-hidden="true" />;
}
