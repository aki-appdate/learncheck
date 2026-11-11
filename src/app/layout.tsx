import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";
import { AppProvider } from "@/components/AppProvider";
import "./globals.css";

const noto = Noto_Sans_JP({
  variable: "--font-noto",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "LearnCheck｜研修の理解度チェック",
  description: "研修資料からAIが確認テストを作り、人が確認してから公開。受講結果から、伝わっていない所とフォロー研修の案を出すデモアプリ（データはすべて架空）",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={`${noto.variable} h-full`}>
      <body className="min-h-full">
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
