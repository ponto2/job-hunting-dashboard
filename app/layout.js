import { IBM_Plex_Sans_JP } from "next/font/google";
import "./globals.css";

// Self-hosted at build time. The Japanese glyphs ship as unicode-range
// slices, so the browser downloads only the slices a page uses.
const plexSansJP = IBM_Plex_Sans_JP({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-plex",
});

export const metadata = {
  title: "就活ダッシュボード",
  description: "企業リサーチ × 選考管理 - 業界別に企業情報を一覧・管理できるダッシュボード",
};

export const viewport = {
  themeColor: "#13233A",
  colorScheme: "dark",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja" className={plexSansJP.variable}>
      <body>{children}</body>
    </html>
  );
}
