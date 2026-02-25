import { NextRequest, NextResponse } from 'next/server';
import { confirmPayment, fulfillOrder } from '@/lib/payment';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const { paymentKey, orderId, amount } = await req.json();

    if (!paymentKey || !orderId || !amount) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 },
      );
    }

    // 1. Verify order exists and amount matches
    if (supabase) {
      const { data: order } = await supabase
        .from('orders')
        .select('*')
        .eq('order_id', orderId)
        .single();

      if (!order) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      }

      if (order.amount !== amount) {
        return NextResponse.json({ error: 'Amount mismatch' }, { status: 400 });
      }

      if (order.status === 'paid') {
        return NextResponse.json({ error: 'Already paid' }, { status: 409 });
      }
    }

    // 2. Confirm with Toss
    const result = await confirmPayment(paymentKey, orderId, amount);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Payment failed' },
        { status: 400 },
      );
    }

    // 3. Fulfill order (add credits, activate subscription, etc.)
    if (supabase) {
      const { data: order } = await supabase
        .from('orders')
        .select('*')
        .eq('order_id', orderId)
        .single();

      if (order) {
        await fulfillOrder(order);
      }
    }

    return NextResponse.json({ success: true, data: result.data });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[payment/confirm] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
