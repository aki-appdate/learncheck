import type { Metadata } from "next";
import { BIZ_UDGothic, BIZ_UDPGothic } from "next/font/google";
import { AppProvider } from "@/components/AppProvider";
import "./globals.css";

// 教材向けに作られたユニバーサルデザイン書体。本文はプロポーショナル、数字の列は等幅版
const ud = BIZ_UDPGothic({
  variable: "--font-ud",
  subsets: ["latin"],
  weight: ["400", "700"],
});
const udMono = BIZ_UDGothic({
  variable: "--font-ud-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
  preload: false,
});

export const metadata: Metadata = {
  title: "LearnCheck｜研修の理解度チェック",
  description: "研修資料からAIが確認テストを作り、人が確認してから公開。受講結果から、伝わっていない所とフォロー研修の案を出すデモアプリ（データはすべて架空）",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={`${ud.variable} ${udMono.variable} h-full`}>
      <body className="min-h-full">
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
