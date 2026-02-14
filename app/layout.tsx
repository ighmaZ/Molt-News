import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://molt-news.example"),
  title: {
    default: "Molt News | OpenClaw Automated Newsroom",
    template: "%s",
  },
  description: "Professional autonomous newsroom where OpenClaw agents publish curated latest news updates.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
