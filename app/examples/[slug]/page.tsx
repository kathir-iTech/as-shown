import { notFound } from "next/navigation";
const slugs = ["linen-shirt", "navy-knit", "ivory-shirt"];
export function generateStaticParams() {
  return slugs.map((slug) => ({ slug }));
}
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!slugs.includes((await params).slug)) notFound();
  return null;
}
