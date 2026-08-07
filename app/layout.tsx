import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import PremiumAccessProvider from "@/app/components/premium/PremiumAccessProvider";
import ThemeProvider from "@/app/components/ThemeProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://emetsees.com"),
  title: {
    default: "EMETSEES — Bible Study & Scripture Evidence",
    template: "%s | EMETSEES",
  },
  description:
    "A Scripture evidence engine for reading the Bible, tracing source words, and following evidence across Scripture.",
  applicationName: "EMETSEES Bible Study",
  manifest: "/manifest.webmanifest",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "EMETSEES",
    title: "EMETSEES — Bible Study & Scripture Evidence",
    description:
      "Read Scripture. Trace source words. Follow the evidence across Scripture.",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "EMETSEES — Bible Study & Scripture Evidence",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "EMETSEES — Bible Study & Scripture Evidence",
    description:
      "Read Scripture. Trace source words. Follow the evidence across Scripture.",
    images: ["/twitter-image"],
  },
  appleWebApp: {
    capable: true,
    title: "EMETSEES Bible",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
    shortcut: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          id="emetsees-theme-bootstrap"
          dangerouslySetInnerHTML={{
            __html: `try {
  var stored = localStorage.getItem("emetsees-theme");
  var theme = stored === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  localStorage.setItem("emetsees-theme", theme);
  localStorage.setItem("bibleiq-theme", theme);
  localStorage.setItem("theme", theme);
} catch (_) {
  document.documentElement.dataset.theme = "light";
  document.documentElement.style.colorScheme = "light";
}`,
          }}
        />
      </head>
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <PremiumAccessProvider>
            {children}
          </PremiumAccessProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
