import type { Metadata } from "next";
import Nav from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "SEO Office",
  description: "Local-first SEO agency operating system.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-abyss text-white">
        <Nav />
        <main className="min-h-screen">{children}</main>
      </body>
    </html>
  );
}
