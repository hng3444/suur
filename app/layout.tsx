import type { Metadata, Viewport } from 'next';
import './globals.css';

const publicUrl = process.env.SUUR_PUBLIC_URL || 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(publicUrl),
  title: 'Suur — Notların seninle',
  description: 'Hızlı, sade ve self-hosted not alma uygulaması.',
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
    title: 'Suur — Notların seninle',
    description: 'Hızlı, sade ve self-hosted not alma uygulaması.',
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Suur — Notların seninle' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Suur — Notların seninle',
    description: 'Hızlı, sade ve self-hosted not alma uygulaması.',
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
