import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Консультант ekt.kz",
  description: "Демонстрационный чат консультанта и корзина электротоваров",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
