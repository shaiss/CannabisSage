import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CannabisSage — Shop dispensary menus with chemistry on the page',
  description:
    'Chrome extension for cannabissage.app: badges, compare, and Pro filters, taste-map match, and multi-store support on dispensary menus. Stripe Checkout — not medical advice.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
