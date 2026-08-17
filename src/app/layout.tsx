import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

export const metadata: Metadata = {
  title: "CV Creator",
  description: "Create polished, modern CVs with ease.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Source+Sans+3:wght@400;500;600;700&family=Lora:wght@400;500;600;700&family=EB+Garamond:wght@400;500;600;700&family=Merriweather:wght@400;500;600;700&family=Manrope:wght@400;500;600;700&family=Noto+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased bg-gray-50 text-gray-900 h-screen h-[100dvh] overflow-hidden overscroll-none">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}