import "@/lib/polyfills";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LearnMate",
  description: "AI-powered study assistant",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased text-gray-900 bg-gray-50">
        {children}
      </body>
    </html>
  );
}