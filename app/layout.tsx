import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://bsc-first-bnb-funding.qian75751.chatgpt.site'),
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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
