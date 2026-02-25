'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

function SuccessContent() {
  const searchParams = useSearchParams();
  const paymentKey = searchParams.get('paymentKey') ?? '';
  const orderId = searchParams.get('orderId') ?? '';
  const amount = searchParams.get('amount') ?? '0';
  const [status, setStatus] = useState<'confirming' | 'success' | 'error'>('confirming');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const confirm = async () => {
      try {
        const res = await fetch('/api/payment/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentKey,
            orderId,
            amount: Number(amount),
          }),
        });

        const data = await res.json();
        if (data.success) {
          setStatus('success');
        } else {
          setStatus('error');
          setErrorMsg(data.error || '결제 확인 실패');
        }
      } catch {
        setStatus('error');
        setErrorMsg('서버 오류');
      }
    };

    if (paymentKey && orderId) {
      confirm();
    }
  }, [paymentKey, orderId, amount]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white p-6">
      <div className="text-center max-w-md">
        {status === 'confirming' && (
          <>
            <div className="text-4xl mb-4">⏳</div>
            <p className="text-xl">결제 확인 중...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="text-4xl mb-4">✅</div>
            <h1 className="text-2xl font-bold mb-4">결제 완료!</h1>
            <p className="text-gray-300 mb-6">
              카카오톡으로 돌아가서 질문을 이어가세요.
            </p>
            <p className="text-gray-500 text-sm">
              이 창은 닫아도 됩니다.
            </p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="text-4xl mb-4">❌</div>
            <h1 className="text-2xl font-bold mb-4">결제 오류</h1>
            <p className="text-gray-400">{errorMsg}</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-900" />}>
      <SuccessContent />
    </Suspense>
  );
}
