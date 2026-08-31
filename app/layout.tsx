import type { Metadata, Viewport } from 'next';
import './globals.css';

const publicUrl = process.env.SUUR_PUBLIC_URL || 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(publicUrl),
  title: 'Suur — Private, self-hosted notes that work offline',
  description: 'A fast, multilingual, offline-first note-taking app you can self-host with Docker, SQLite, and full data ownership.',
  keywords: ['self-hosted notes', 'offline notes app', 'open source note taking', 'Docker notes app', 'CasaOS notes', 'Google Keep alternative', 'private notes', 'PWA notes'],
  applicationName: 'Suur',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/suur.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: [{ url: '/icon-192.png', type: 'image/png', sizes: '192x192' }],
  },
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Suur' },
  openGraph: {
    title: 'Suur — Private, self-hosted notes that work offline',
    description: 'Fast, multilingual, offline-first note-taking with Docker, SQLite, and full data ownership.',
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Suur self-hosted notes app' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Suur — Private, self-hosted notes that work offline',
    description: 'Fast, multilingual, offline-first note-taking with Docker, SQLite, and full data ownership.',
    images: ['/og.png'],
  },
  robots: { index: false, follow: false },
};

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
