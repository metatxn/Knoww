import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "Knoww - Know your Odds",
  description: "Know your Odds",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieHeader = await headers();
  const cookies = cookieHeader.get("cookie");

  return (
    <html lang="en" suppressHydrationWarning>
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
