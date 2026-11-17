import type { Metadata, Viewport } from "next";
import { Fraunces, Nunito } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
  axes: ["SOFT", "opsz"],
});

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Santa Secreto", template: "%s · Santa Secreto" },
  description: "El amigo secreto de nuestra familia.",
  applicationName: "Santa Secreto",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#082419",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${fraunces.variable} ${nunito.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
