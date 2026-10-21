import { notFound } from "next/navigation";
const sections = ["privacy", "evidence", "examples", "storefront", "seller"];
export function generateStaticParams() {
  return sections.map((section) => ({ section }));
}
export default async function Page({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  if (!sections.includes((await params).section)) notFound();
  return null;
}
