import type { Metadata } from 'next';
import './globals.css';

const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const publicOrigin = process.env.NEXT_PUBLIC_SITE_URL
  ? process.env.NEXT_PUBLIC_SITE_URL
  : productionHost
    ? `https://${productionHost}`
    : 'https://bsc-first-bnb-funding.qian75751.chatgpt.site';

export const metadata: Metadata = {
  metadataBase: new URL(publicOrigin),
  title: 'BNB 链上中台工具',
  description: '集中使用 CEX 首笔 BNB 到账查询与 BNB 地址转账关系检查工具。',
  openGraph: {
    title: 'BNB 链上中台工具',
    description: '集中使用 CEX 首笔 BNB 到账查询与 BNB 地址转账关系检查工具。',
    type: 'website',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'BNB 链上中台工具',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BNB 链上中台工具',
    description: '集中使用 CEX 首笔 BNB 到账查询与 BNB 地址转账关系检查工具。',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
