import { notFound } from "next/navigation";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!/^[a-zA-Z0-9-]{1,80}$/.test((await params).id)) notFound();
  return null;
}
