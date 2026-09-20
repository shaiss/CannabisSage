import Link from 'next/link';
import { CheckoutButton } from '@/components/CheckoutButton';

export default function CancelPage() {
  return (
    <main className="panel">
      <h1>Checkout canceled</h1>
      <p className="muted">No charge was made. You can restart Checkout whenever you’re ready.</p>
      <CheckoutButton label="Try Checkout again" />
      <p style={{ marginTop: '1rem' }}>
        <Link href="/">Back to CannabisSage</Link>
      </p>
    </main>
  );
}
