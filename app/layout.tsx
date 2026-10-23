import type { Metadata } from "next";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/manrope";
import "./globals.css";
import "./reconstruction.css";
import "./publishing.css";
import "./fitting-room.css";
import { AsShownApp } from "@/components/asshown-app";
import { connection } from "next/server";
import { StudioErrorBoundary } from "@/components/error-boundary";
export const metadata: Metadata = {
  metadataBase: new URL("https://as-shown.vercel.app"),
  applicationName: "As-Shown",
  title: "As-Shown — Your secondhand fitting room",
  description:
    "Try on your next thrift find. Upload a garment, preview the look with YouCam, and keep original condition details beside it in your own rack.",
  openGraph: {
    title: "As-Shown — Try on your next thrift find.",
    siteName: "As-Shown",
    description:
      "A real YouCam style preview. Original condition photographs. Your decision, with its context.",
    type: "website",
    url: "https://as-shown.vercel.app",
  },
  twitter: {
    card: "summary_large_image",
    title: "As-Shown — Try on your next thrift find.",
  },
};
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  return (
    <html lang="en">
      <body>
        <StudioErrorBoundary>
          <AsShownApp>{children}</AsShownApp>
        </StudioErrorBoundary>
      </body>
    </html>
  );
}
