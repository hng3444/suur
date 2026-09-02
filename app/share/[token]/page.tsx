import { redirect } from 'next/navigation';

type Props = { params: Promise<{ token: string }> };

export const dynamic = 'force-dynamic';

export default async function LegacySharedNotePage({ params }: Props) {
  redirect(`/s/${encodeURIComponent((await params).token)}`);
}
