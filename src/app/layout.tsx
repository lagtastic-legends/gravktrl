import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GravKtrl — Standalone PC Controller & Antigravity Remote Bridge",
  description: "Mobile-to-PC Agent Commander and Guarded Terminal Bridge for Antigravity",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "GravKtrl",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#090D0C",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full w-full bg-[#090D0C] text-[#F7E7CE] dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="h-full w-full bg-[#090D0C] text-[#F7E7CE] overflow-hidden select-none m-0 p-0 antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
