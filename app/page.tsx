import Link from 'next/link';

const features = [
  {
    href: '/saju',
    icon: '☰',
    title: 'AI 사주 분석',
    desc: '생년월일시로 보는 내 사주 리포트',
    color: 'from-orange-600 to-amber-500',
  },
  {
    href: '/relationship',
    icon: '💬',
    title: '관계 분석',
    desc: '카카오톡 대화로 보는 관계 심리',
    color: 'from-rose-600 to-pink-500',
  },
  {
    href: '/ai-chat',
    icon: '🤖',
    title: 'AI 대화 분석',
    desc: 'AI 대화 기록으로 보는 내 사고 패턴',
    color: 'from-orange-700 to-red-600',
  },
  {
    href: '/face',
    icon: '📷',
    title: '관상 분석',
    desc: '얼굴 사진으로 보는 인상 리딩',
    color: 'from-amber-600 to-orange-500',
  },
];

export default function Home() {
  return (
    <div className="app-bg min-h-screen px-4 py-10 md:px-8 md:py-16">
      <main className="mx-auto max-w-5xl">
        <header className="relative mb-12 overflow-hidden rounded-3xl border border-orange-200/70 bg-white/80 p-8 text-center shadow-[0_18px_44px_rgba(120,53,15,0.14)] md:mb-16 md:p-10">
          <span className="hero-orb -right-10 -top-10 h-40 w-40 bg-orange-300" aria-hidden="true" />
          <span className="hero-orb -left-8 bottom-2 h-28 w-28 bg-amber-300" aria-hidden="true" />
          <p className="text-sm font-semibold tracking-[0.2em] text-orange-700">AI SAJU STUDIO</p>
          <h1 className="mt-3 text-4xl font-bold text-stone-900 md:text-5xl">사람 · 관계 · 분석</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-stone-700">
            AI가 읽어주는 나와 내 관계의 심리 리포트
          </p>
        </header>

        <section className="grid grid-cols-1 gap-5 sm:grid-cols-2" aria-label="분석 서비스 목록">
          {features.map((feature) => (
            <Link
              key={feature.href}
              href={feature.href}
              aria-label={`${feature.title} 페이지로 이동`}
              className="focus-ring group relative overflow-hidden rounded-3xl border border-stone-300 bg-white/95 p-6 shadow-[0_16px_40px_rgba(41,37,36,0.14)] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_24px_60px_rgba(41,37,36,0.24)]"
            >
              <span className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-gradient-to-br from-orange-200/70 to-amber-200/0" />
              <div
                className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${feature.color} text-2xl text-white shadow-md`}
                aria-hidden="true"
              >
                {feature.icon}
              </div>
              <h2 className="text-xl font-bold text-stone-900 transition-colors group-hover:text-orange-700">
                {feature.title}
              </h2>
              <p className="mt-2 text-sm text-stone-600">{feature.desc}</p>
              <span className="mt-4 inline-block text-sm font-medium text-orange-700 opacity-0 transition-opacity group-hover:opacity-100">
                시작하기 &rarr;
              </span>
            </Link>
          ))}
        </section>

        <section className="mt-5" aria-label="통합 분석">
          <Link
            href="/integrated"
            aria-label="통합 분석 페이지로 이동"
            className="focus-ring group relative block overflow-hidden rounded-3xl border border-violet-300/70 bg-gradient-to-r from-violet-50 via-white to-amber-50 p-6 shadow-[0_16px_40px_rgba(41,37,36,0.14)] transition-all duration-300 hover:scale-[1.01] hover:shadow-[0_24px_60px_rgba(41,37,36,0.24)] md:p-8"
          >
            <span className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-gradient-to-br from-violet-200/60 to-amber-200/30 blur-sm" />
            <span className="absolute -left-4 bottom-0 h-20 w-20 rounded-full bg-gradient-to-br from-orange-200/50 to-rose-200/30 blur-sm" />
            <div className="relative flex items-center gap-4 md:gap-6">
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-amber-500 text-3xl text-white shadow-md"
                aria-hidden="true"
              >
                ✦
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-stone-900 transition-colors group-hover:text-violet-700 md:text-2xl">
                    통합 분석
                  </h2>
                  <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700">
                    PREMIUM
                  </span>
                </div>
                <p className="mt-1 text-sm text-stone-600 md:text-base">
                  사주 + 대화 + AI 로그 + 관상을 종합한 프리미엄 브리핑 리포트
                </p>
              </div>
              <span className="text-sm font-medium text-violet-700 opacity-0 transition-opacity group-hover:opacity-100">
                시작하기 &rarr;
              </span>
            </div>
          </Link>
        </section>

        <footer className="mt-12 text-center text-xs text-stone-500 md:mt-16">
          <p>엔터테인먼트 목적의 서비스입니다. 전문 상담을 대체하지 않습니다.</p>
          <div className="mt-2 flex justify-center gap-4">
            <Link
              href="/privacy"
              aria-label="개인정보처리방침 페이지로 이동"
              className="focus-ring tap-target inline-flex items-center underline hover:text-stone-700"
            >
              개인정보처리방침
            </Link>
            <Link
              href="/terms"
              aria-label="이용약관 페이지로 이동"
              className="focus-ring tap-target inline-flex items-center underline hover:text-stone-700"
            >
              이용약관
            </Link>
          </div>
        </footer>
      </main>
    </div>
  );
}
