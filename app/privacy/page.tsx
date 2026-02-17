import Link from 'next/link';

export default function PrivacyPage() {
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
          <h1 className="mb-6 text-3xl font-bold text-stone-900">개인정보처리방침</h1>
          <p className="mb-4 text-sm text-stone-500">최종 수정일: 2026년 2월 14일</p>

          <div className="prose prose-stone max-w-none text-stone-700 space-y-6">
            <section>
              <h2 className="text-xl font-bold text-stone-900">1. 수집하는 개인정보</h2>
              <p>
                본 서비스는 분석에 필요한 최소한의 정보만 처리하며, 아래 정보를 수집합니다:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>사주 분석:</strong> 생년월일, 시간, 성별 (사용자 직접 입력)</li>
                <li><strong>관계 분석:</strong> 카카오톡 대화 텍스트 (사용자 직접 붙여넣기)</li>
                <li><strong>AI 대화 분석:</strong> AI 대화 기록 텍스트 (사용자 직접 붙여넣기)</li>
                <li><strong>관상 분석:</strong> 얼굴 사진 1매 (사용자 직접 업로드)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-stone-900">2. 정보의 이용 목적</h2>
              <p>수집된 정보는 오직 해당 분석 기능 제공 목적으로만 사용됩니다.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-stone-900">3. 정보의 보관 및 삭제</h2>
              <ul className="list-disc pl-5 space-y-1">
                <li>사용자가 입력/업로드한 데이터는 <strong>서버 메모리에서만 처리</strong>되며, 디스크에 저장되지 않습니다.</li>
                <li>분석 완료 즉시 모든 데이터는 메모리에서 삭제됩니다.</li>
                <li>AI 분석 요청 시 OpenAI API로 전송되며, OpenAI의 API 데이터 정책에 따릅니다.</li>
                <li>별도의 데이터베이스에 사용자 대화 내용이나 이미지를 저장하지 않습니다.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-stone-900">4. 제3자 제공</h2>
              <p>
                분석 처리를 위해 OpenAI API에 데이터가 전송됩니다. 그 외 제3자에게
                개인정보를 제공하지 않습니다.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-stone-900">5. 이용자의 권리</h2>
              <ul className="list-disc pl-5 space-y-1">
                <li>서비스 이용 전 분석 동의를 선택적으로 제공할 수 있습니다.</li>
                <li>데이터가 저장되지 않으므로, 삭제 요청은 필요하지 않습니다.</li>
                <li>문의사항이 있으면 서비스 관리자에게 연락해주세요.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-stone-900">6. 쿠키 및 추적</h2>
              <p>본 서비스는 별도의 쿠키를 사용하지 않으며, 사용자 행동을 추적하지 않습니다.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-stone-900">7. 관상 분석 관련 특별 고지</h2>
              <p>
                관상 분석은 전통적 관상학에 기반한 엔터테인먼트 서비스입니다.
                인종, 민족, 종교, 정치 성향, 성적 지향, 건강 상태 등 민감한 속성은
                일절 추론하지 않습니다. 결과는 어떠한 차별적 판단의 근거로 사용될 수 없습니다.
              </p>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
