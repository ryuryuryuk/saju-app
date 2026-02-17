import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI 사주 스튜디오 — 사람·관계·분석',
  description:
    'AI가 읽어주는 사주, 관계 심리, 대화 패턴, 관상 분석. 나와 내 관계를 깊이 이해하는 심리 리포트.',
  openGraph: {
    title: 'AI 사주 스튜디오',
    description: 'AI가 읽어주는 사주·관계·대화·관상 분석 서비스',
    type: 'website',
    locale: 'ko_KR',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
