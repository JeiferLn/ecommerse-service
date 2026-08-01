import type { Metadata } from "next";
import { Roboto } from "next/font/google";

import { QueryProvider } from "@/providers/query-provider";
import { SessionProvider } from "@/providers/session-provider";

import "./globals.css";

const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Commerce AI SaaS",
    template: "%s | Commerce AI SaaS",
  },
  description:
    "Plataforma multi-tenant de comercio conversacional con Inteligencia Artificial para WhatsApp.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${roboto.variable} antialiased`}>
        <QueryProvider>
          <SessionProvider>{children}</SessionProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
