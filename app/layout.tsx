import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chat AI",
  description: "A simple ChatGPT-style interface powered by 9Router",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
