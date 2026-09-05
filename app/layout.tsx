import type { Metadata, Viewport } from 'next';
import './globals.css';
import { getBranding } from '@/lib/repository';
import { languageDirection } from '@/lib/i18n';
import { getRequestLocale } from '@/lib/server-locale';

const publicUrl = process.env.SUUR_PUBLIC_URL || 'http://localhost:3000';

export async function generateMetadata(): Promise<Metadata> {
  const branding = getBranding();
  const icon = branding.hasCustomIcon ? `/api/branding/icon?v=${encodeURIComponent(branding.iconVersion)}` : '/suuricon.png';
  return {
    metadataBase: new URL(publicUrl),
    title: branding.appName,
    description: 'A fast, multilingual, offline-first note-taking app you can self-host with Docker, SQLite, and full data ownership.',
    keywords: ['self-hosted notes', 'offline notes app', 'open source note taking', 'Docker notes app', 'CasaOS notes', 'Google Keep alternative', 'private notes', 'PWA notes'],
    applicationName: branding.appName,
    manifest: '/api/branding/manifest',
    icons: { icon: [{ url: icon }], apple: [{ url: icon }] },
    appleWebApp: { capable: true, statusBarStyle: 'default', title: branding.appName },
    openGraph: { title: branding.appName, description: 'Fast, multilingual, offline-first note-taking with Docker, SQLite, and full data ownership.', type: 'website', images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Suur self-hosted notes app' }] },
    twitter: { card: 'summary_large_image', title: branding.appName, description: 'Fast, multilingual, offline-first note-taking with Docker, SQLite, and full data ownership.', images: ['/og.png'] },
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f05a24',
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getRequestLocale();
  return (
    <html lang={locale} dir={languageDirection(locale)}>
      <body>{children}</body>
    </html>
  );
}
