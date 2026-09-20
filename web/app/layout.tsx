import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CannabisSage — Chem insights for dispensary shopping',
  description:
    'Chrome extension for Sunnyside & Zen Leaf: cannabinoid/terpene badges, compare, filters, taste-map. Not medical advice. Pro unlock via Stripe Checkout.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
