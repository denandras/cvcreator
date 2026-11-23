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
        {/* CV fonts are SELF-HOSTED from /public/fonts/cv (fonts.css, generated
            by scripts/build-fonts.py): the SAME merged TTF bytes the PDF
            exporter embeds, with GPOS/GSUB stripped so the browser and jsPDF
            reduce to identical cmap+hmtx advances. The old Google Fonts css2
            link is gone on purpose — Google was observed serving two
            *different builds* of the same family to the same machine on
            different page loads (Inter digits 0.616em vs 0.572em), which made
            the preview↔PDF row widths wobble by 2–4% and the parity gate
            unrunnable (REPORT.md §4 Step 8). */}
        <link rel="stylesheet" href="/fonts/cv/fonts.css" />
      </head>
      <body className="antialiased bg-stone-100 text-stone-900 h-screen h-[100dvh] overflow-hidden overscroll-none">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}