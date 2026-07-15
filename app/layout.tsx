import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import GlobalAskButton from "@/app/components/GlobalAskButton";
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
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <PremiumAccessProvider>
            {children}
            <GlobalAskButton />
          </PremiumAccessProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
