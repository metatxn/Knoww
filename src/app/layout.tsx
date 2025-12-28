import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { headers } from "next/headers";
import { MainContent } from "@/components/main-content";
import { SidebarDesktopNoSSR } from "@/components/sidebar-desktop";
import ContextProvider from "@/context";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["200", "300", "400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#8b5cf6",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: {
    default: "Knoww - Know your Odds",
    template: "%s | Knoww",
  },
  description:
    "Trade on real-world events with Knoww. Explore prediction markets for politics, sports, crypto, and more.",
  keywords: ["prediction markets", "polymarket", "trading", "crypto", "odds"],
  metadataBase: new URL("https://knoww.app"),
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Knoww",
    title: "Knoww - Know your Odds",
    description: "Trade on real-world events with prediction markets",
    images: [
      {
        url: "/vercel.svg", // Placeholder until a proper OG image is added
        width: 1200,
        height: 630,
        alt: "Knoww Prediction Markets",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Knoww - Know your Odds",
    description: "Trade on real-world events with prediction markets",
    images: ["/vercel.svg"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieHeader = await headers();
  const cookies = cookieHeader.get("cookie");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Knoww",
    url: "https://knoww.app",
  };

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        className={`${plusJakartaSans.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        <ContextProvider cookies={cookies}>
          {/* Desktop sidebar (client-only to avoid rendering on mobile SSR) */}
          <SidebarDesktopNoSSR />
          {/* Main content with responsive margin */}
          <MainContent>{children}</MainContent>
        </ContextProvider>
      </body>
    </html>
  );
}
