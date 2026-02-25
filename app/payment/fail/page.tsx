'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function FailContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get('code') ?? '';
  const message = searchParams.get('message') ?? '결제가 취소되었습니다.';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white p-6">
      <div className="text-center max-w-md">
        <div className="text-4xl mb-4">😢</div>
        <h1 className="text-2xl font-bold mb-4">결제 실패</h1>
        <p className="text-gray-300 mb-2">{message}</p>
        {code && <p className="text-gray-500 text-sm">코드: {code}</p>}
        <p className="text-gray-500 text-sm mt-4">
          카카오톡으로 돌아가서 다시 시도해주세요.
        </p>
      </div>
    </div>
  );
}

export default function PaymentFailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-900" />}>
      <FailContent />
    </Suspense>
  );
}
