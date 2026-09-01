import type { Metadata, Viewport } from 'next';
import './globals.css';
import { getBranding } from '@/lib/repository';

const publicUrl = process.env.SUUR_PUBLIC_URL || 'http://localhost:3000';

export async function generateMetadata(): Promise<Metadata> {
  const branding = getBranding();
  const title = `${branding.appName} — Private, self-hosted notes that work offline`;
  const icon = branding.hasCustomIcon ? `/api/branding/icon?v=${encodeURIComponent(branding.iconVersion)}` : '/suur.svg';
  return {
    metadataBase: new URL(publicUrl),
    title,
    description: 'A fast, multilingual, offline-first note-taking app you can self-host with Docker, SQLite, and full data ownership.',
    keywords: ['self-hosted notes', 'offline notes app', 'open source note taking', 'Docker notes app', 'CasaOS notes', 'Google Keep alternative', 'private notes', 'PWA notes'],
    applicationName: branding.appName,
    manifest: '/api/branding/manifest',
    icons: { icon: [{ url: icon }], apple: [{ url: icon }] },
    appleWebApp: { capable: true, statusBarStyle: 'default', title: branding.appName },
    openGraph: { title, description: 'Fast, multilingual, offline-first note-taking with Docker, SQLite, and full data ownership.', type: 'website', images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Suur self-hosted notes app' }] },
    twitter: { card: 'summary_large_image', title, description: 'Fast, multilingual, offline-first note-taking with Docker, SQLite, and full data ownership.', images: ['/og.png'] },
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#198754',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
