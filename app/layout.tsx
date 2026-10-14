import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AuthProvider from "@/src/providers/AuthProvider";
import FeedbackHost from "@/src/components/ui/feedback/FeedbackHost";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Finance Smart",
  description: "Powered by FKT System",
};

// No Chrome Android o teclado virtual, por padrão, só cobre a página. Com
// "resizes-content" a viewport encolhe, e painéis fixos (rodapé de ações dos
// formulários) continuam acima do teclado.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      data-theme="dark"
      data-theme-preference="system"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=localStorage.getItem("finance-smart-theme")||"system";var d=p==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):p;var e=document.documentElement;e.dataset.theme=d;e.dataset.themePreference=p}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          {children}
        </AuthProvider>
        <FeedbackHost />
      </body>
    </html>
  );
}
