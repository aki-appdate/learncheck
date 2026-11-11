import { AppShell } from "@/components/AppShell";

// 中身はブラウザ側で保存データを読んでから描画するため、瞬時表示の検証の対象外にする
export const instant = false;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
