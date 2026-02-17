import Link from 'next/link';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#fef3c7,_#fed7aa_45%,_#d6d3d1)] px-4 py-8 md:px-8 md:py-12">
      <main className="mx-auto max-w-3xl">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1 text-sm font-medium text-stone-600 transition hover:text-orange-700"
        >
          <span aria-hidden="true">&larr;</span> 돌아가기
        </Link>

        <div className="rounded-3xl border border-stone-300 bg-white/95 p-6 shadow-[0_16px_40px_rgba(41,37,36,0.14)] md:p-10">
          <h1 className="mb-6 text-3xl font-bold text-stone-900">이용약관</h1>
          <p className="mb-4 text-sm text-stone-500">최종 수정일: 2026년 2월 14일</p>

          <div className="prose prose-stone max-w-none text-stone-700 space-y-6">
            <section>
              <h2 className="text-xl font-bold text-stone-900">제1조 (목적)</h2>
              <p>
                본 약관은 AI 사주 스튜디오(이하 &quot;서비스&quot;)의 이용 조건과 절차,
                이용자와 서비스 제공자 간의 권리·의무를 규정합니다.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-stone-900">제2조 (서비스 내용)</h2>
              <p>본 서비스는 다음의 AI 기반 분석 기능을 제공합니다:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>사주 분석: 생년월일시 기반 사주 해석</li>
                <li>관계 분석: 카카오톡 대화 기반 관계 심리 분석</li>
                <li>AI 대화 분석: AI 챗봇 대화 기록 기반 사고 패턴 분석</li>
                <li>관상 분석: 얼굴 사진 기반 인상 리딩</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-stone-900">제3조 (면책)</h2>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  본 서비스의 모든 분석 결과는 <strong>엔터테인먼트 목적</strong>으로
                  제공되며, 전문적인 심리 상담, 의학적 진단, 법적 판단 등을 대체하지
                  않습니다.
                </li>
                <li>분석 결과를 근거로 한 의사결정에 대해 서비스 제공자는 책임을 지지 않습니다.</li>
                <li>
                  AI 분석의 특성상 결과가 부정확하거나 편향될 수 있으며, 이에 대한 법적
                  책임을 지지 않습니다.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-stone-900">제4조 (이용자 의무)</h2>
              <ul className="list-disc pl-5 space-y-1">
                <li>타인의 개인정보(대화 내용, 사진 등)를 동의 없이 업로드하지 않아야 합니다.</li>
                <li>서비스를 악의적 목적(타인 비방, 차별, 스토킹 등)으로 사용하지 않아야 합니다.</li>
                <li>자동화된 방법으로 대량의 요청을 보내는 행위를 금지합니다.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-stone-900">제5조 (데이터 처리)</h2>
              <p>
                사용자가 제공한 모든 데이터(텍스트, 이미지)는 분석 완료 즉시 삭제되며,
                서버에 영구 저장되지 않습니다. 자세한 내용은{' '}
                <Link href="/privacy" className="text-orange-700 underline">
                  개인정보처리방침
                </Link>
                을 참조해주세요.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-stone-900">제6조 (서비스 변경 및 중단)</h2>
              <p>
                서비스 제공자는 기술적·운영적 사유로 서비스를 변경하거나 중단할 수 있으며,
                가능한 한 사전에 공지합니다.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-stone-900">제7조 (지적재산권)</h2>
              <p>
                서비스의 소프트웨어, 디자인, 콘텐츠에 대한 지적재산권은 서비스 제공자에게
                귀속됩니다. 분석 결과에 대한 이용 권한은 이용자에게 있습니다.
              </p>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
