import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GravKtrl — Remote Agent Commander & Terminal Bridge",
  description: "Mobile-to-PC Agent Commander and Terminal Bridge for Google Antigravity",
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
  themeColor: "#08090d",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full w-full bg-[#08090d]">
      <body className="h-full w-full bg-[#08090d] text-slate-100 overflow-hidden select-none m-0 p-0 antialiased">
        {children}
      </body>
    </html>
  );
}
