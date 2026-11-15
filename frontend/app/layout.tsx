import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Sora } from "next/font/google";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Starfield } from "@/components/Starfield";
import { WakeBackend } from "@/components/WakeBackend";
import "./globals.css";

const sora = Sora({ variable: "--font-sora", subsets: ["latin"], weight: ["400", "600", "700", "800"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], weight: ["400", "500"] });

const DESCRIPTION =
  "Where and when to land on the Moon: sunlight and direct-to-Earth comms windows for any site, checked against real lunar terrain.";

/** Absolute base for Open Graph URLs: explicit env, else Vercel's production domain, else local dev. */
function siteUrl(): URL {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return new URL(explicit);
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return new URL(`https://${vercel}`);
  return new URL("http://localhost:3000");
}

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: { default: "Shadowline: Lunar Landing Site Navigator", template: "%s · Shadowline" },
  description: DESCRIPTION,
  applicationName: "Shadowline",
  openGraph: {
    type: "website",
    siteName: "Shadowline",
    title: "Shadowline: Lunar Landing Site Navigator",
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: "Shadowline: Lunar Landing Site Navigator", description: DESCRIPTION },
};

export const viewport: Viewport = { themeColor: "#07080F", colorScheme: "dark" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sora.variable} ${inter.variable} ${mono.variable} h-full antialiased`}>
      <body className="relative flex min-h-full flex-col">
        <Starfield />
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        <WakeBackend />
      </body>
    </html>
  );
}
