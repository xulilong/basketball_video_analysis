import { PublicAppShell } from "@/components/PublicAppShell";
import { AccountProvider } from "@/components/AccountAccess";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ProductShell } from "@/components/ProductShell";

export const dynamic = "force-dynamic";
const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title:
    process.env.BASKETBALL_PRODUCT === "public"
      ? "球场时刻"
      : "MT球员统计工作台",
  description: "记录每一次上场，查看个人表现，导出精彩集锦。",
  icons:
    process.env.BASKETBALL_PRODUCT === "public"
      ? undefined
      : {
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
        <AccountProvider
          independent={process.env.BASKETBALL_PRODUCT === "public"}
        >
          {process.env.BASKETBALL_PRODUCT === "public" ? (
            <PublicAppShell>{children}</PublicAppShell>
          ) : (
            <ProductShell>{children}</ProductShell>
          )}
        </AccountProvider>
      </body>
    </html>
  );
}
