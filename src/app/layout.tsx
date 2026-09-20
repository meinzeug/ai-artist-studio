import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "AI Artist Studio",
  description: "Dein privates Studio für virtuelle Musikkünstler",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
