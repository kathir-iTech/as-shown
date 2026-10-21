import { notFound } from "next/navigation";
export const metadata = { robots: { index: false, follow: false } };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!/^[a-f0-9]{40}$/.test((await params).id)) notFound();
  return null;
}
