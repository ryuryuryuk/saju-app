'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

const TOSS_CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? '';

function PaymentContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId') ?? '';
  const product = searchParams.get('product') ?? '';
  const [status, setStatus] = useState<'loading' | 'ready' | 'processing' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  const PRICING: Record<string, { amount: number; name: string }> = {
    SINGLE_READING: { amount: 1900, name: '1회 열람권' },
    THREE_READINGS: { amount: 4900, name: '3회 열람권 패키지' },
    CREDIT_10: { amount: 9900, name: '크레딧 10개' },
    CREDIT_30: { amount: 24900, name: '크레딧 30개' },
    MONTHLY_BASIC: { amount: 9900, name: '월간 베이직 구독' },
    MONTHLY_PREMIUM: { amount: 19900, name: '월간 프리미엄 구독' },
    YEARLY_FORTUNE: { amount: 12900, name: '2026년 신년운세 리포트' },
    COMPATIBILITY_DEEP: { amount: 3900, name: '궁합 프리미엄 분석' },
  };

  const productInfo = PRICING[product];

  useEffect(() => {
    if (!orderId || !productInfo) {
      setStatus('error');
      setErrorMsg('잘못된 결제 요청입니다.');
      return;
    }
    setStatus('ready');
  }, [orderId, productInfo]);

  const handlePayment = async () => {
    if (!productInfo) return;
    setStatus('processing');

    try {
      // Load Toss Payments SDK
      const { loadTossPayments } = await import('@tosspayments/tosspayments-sdk');
      const tossPayments = await loadTossPayments(TOSS_CLIENT_KEY);
      const payment = tossPayments.payment({ customerKey: 'anonymous' });
      
      await payment.requestPayment({
        method: 'CARD',
        amount: { currency: 'KRW', value: productInfo.amount },
        orderId,
        orderName: productInfo.name,
        successUrl: `${window.location.origin}/payment/success`,
        failUrl: `${window.location.origin}/payment/fail`,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '결제 오류';
      setStatus('error');
      setErrorMsg(msg);
    }
  };

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white p-6">
        <div className="text-center">
          <p className="text-xl mb-4">결제 오류</p>
          <p className="text-gray-400">{errorMsg}</p>
        </div>
      </div>
    );
  }

  if (!productInfo) return null;

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold mb-6 text-center">사주비서 결제</h1>
        
        <div className="bg-gray-800 rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-semibold mb-2">{productInfo.name}</h2>
          <p className="text-3xl font-bold text-purple-400">
            {productInfo.amount.toLocaleString()}원
          </p>
        </div>

        <button
          onClick={handlePayment}
          disabled={status === 'processing'}
          className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white font-bold py-4 px-6 rounded-xl text-lg transition-colors"
        >
          {status === 'processing' ? '결제 진행 중...' : '결제하기'}
        </button>

        <p className="text-gray-500 text-sm text-center mt-4">
          결제 완료 후 카카오톡으로 돌아가면 자동으로 적용됩니다.
        </p>
      </div>
    </div>
  );
}

export default function PaymentPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-900" />}>
      <PaymentContent />
    </Suspense>
  );
}
