import { redirect } from 'next/navigation';

// The real report screen is /reports, backed by interview_reports. This static
// version existed only to check the design.
export default function Page() {
  redirect('/reports');
}
