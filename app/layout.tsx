import type { Metadata } from "next";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/manrope";
import "./globals.css";
import "./reconstruction.css";
import "./publishing.css";
import { AsShownApp } from "@/components/asshown-app";
import { connection } from "next/server";
import { StudioErrorBoundary } from "@/components/error-boundary";
export const metadata: Metadata = {
  metadataBase: new URL("https://as-shown.vercel.app"),
  applicationName: "As-Shown",
  title: "As-Shown — A secondhand inspection studio",
  description:
    "A secondhand garment’s original condition photos, a real YouCam style preview, and a portable record of your decision.",
  openGraph: {
    title: "As-Shown — Try it on. Look closer.",
    siteName: "As-Shown",
    description:
      "A real YouCam style preview. Original condition photographs. Your decision, with its context.",
    type: "website",
    url: "https://as-shown.vercel.app",
  },
  twitter: {
    card: "summary_large_image",
    title: "As-Shown — Try it on. Look closer.",
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
