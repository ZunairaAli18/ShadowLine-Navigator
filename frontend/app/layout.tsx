import type { Metadata } from "next";
import { Inter, Sora } from "next/font/google";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Starfield } from "@/components/Starfield";
import "./globals.css";

const sora = Sora({ variable: "--font-sora", subsets: ["latin"], weight: ["400", "600", "700", "800"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Shadowline: Lunar Landing Site Navigator", template: "%s · Shadowline" },
  description:
    "Where and when to land on the Moon: sunlight and direct-to-Earth comms windows for any site, checked against real lunar terrain.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sora.variable} ${inter.variable} h-full antialiased`}>
      <body className="relative flex min-h-full flex-col">
        <Starfield />
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
