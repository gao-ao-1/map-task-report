import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "县域报告地图 · Atlas",
  description: "全国县域报告任务协作与管理",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
