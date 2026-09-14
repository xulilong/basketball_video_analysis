import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ProductShell } from "@/components/ProductShell";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MT球员统计工作台",
  description:
    "让每次精彩进球，都能够被记录。技术统计与进球剪辑，记录个人表现，导出精彩集锦。",
  icons: {
    icon: "/assets/mt-mark.svg",
    shortcut: "/assets/mt-mark.svg",
    apple: "/assets/mt-mark.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className={inter.className} suppressHydrationWarning={true}>
        <ProductShell>{children}</ProductShell>
      </body>
    </html>
  );
}
