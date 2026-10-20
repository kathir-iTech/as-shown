import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "AsShown — See the style. Keep the story.",
  description:
    "A secondhand garment’s original condition photos, a real YouCam style preview, and a portable record of your decision.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
