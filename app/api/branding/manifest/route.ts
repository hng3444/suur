import { NextResponse } from 'next/server';
import { getBranding } from '@/lib/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const branding = getBranding();
  const icons = branding.hasCustomIcon
    ? [{ src: `/api/branding/icon?v=${encodeURIComponent(branding.iconVersion)}`, sizes: 'any', type: 'image/x-icon', purpose: 'any' }]
    : [
      { src: '/icon-192.png?v=20260905-fire', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png?v=20260905-fire', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png?v=20260905-fire', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ];
  return NextResponse.json({
    name: branding.appName,
    short_name: branding.appName.slice(0, 12),
    description: 'Private, self-hosted notes that work offline.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#eef2ff',
    theme_color: '#3f5efb',
    icons,
  }, { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-store' } });
}
