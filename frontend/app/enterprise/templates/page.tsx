import { redirect } from 'next/navigation';

// The real templates screen is /panels — it reads the panels you have actually
// saved. This static version existed only to check the design.
export default function Page() {
  redirect('/panels');
}
