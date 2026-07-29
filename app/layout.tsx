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
  title: {
    default: "EMETSEES",
    template: "%s | EMETSEES",
  },
  description:
    "Read Scripture, inspect source-word evidence, and receive Scripture-grounded EMET explanations.",
  applicationName: "EMETSEES",
  manifest: "/manifest.webmanifest",
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
