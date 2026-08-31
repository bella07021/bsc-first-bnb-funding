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
  title: '首笔原生 BNB 到账时间',
  description: '批量查询 BSC EOA 地址的首笔普通原生 BNB 入账与 CEX 来源标签。',
  openGraph: {
    title: '首笔原生 BNB 到账时间',
    description: '批量查询 BSC EOA 地址的首笔普通原生 BNB 入账与 CEX 来源标签。',
    type: 'website',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: '首笔原生 BNB 到账时间',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '首笔原生 BNB 到账时间',
    description: '批量查询 BSC EOA 地址的首笔普通原生 BNB 入账与 CEX 来源标签。',
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
