import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Equi - Personal AI Lifestyle Architect",
  description: "AI-powered personal assistant for lifestyle optimization",
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
