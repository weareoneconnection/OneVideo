import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "OneVideo Studio",
  description: "AI-native short video generation OS"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
