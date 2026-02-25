import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { fulfillOrder, activateSubscription } from '@/lib/payment';

/**
 * Toss Payments webhook endpoint.
 * Handles payment status changes and subscription renewals.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { eventType, data } = body;

    console.log(`[payment/webhook] Event: ${eventType}`, JSON.stringify(data).slice(0, 200));

    switch (eventType) {
      case 'PAYMENT_STATUS_CHANGED': {
        const { paymentKey, orderId, status } = data;
        
        if (supabase && orderId) {
          await supabase
            .from('orders')
            .update({
              status: status === 'DONE' ? 'paid' : status.toLowerCase(),
              payment_key: paymentKey,
            })
            .eq('order_id', orderId);

          if (status === 'DONE') {
            const { data: order } = await supabase
              .from('orders')
              .select('*')
              .eq('order_id', orderId)
              .single();
            
            if (order) {
              await fulfillOrder(order);
            }
          }
        }
        break;
      }

      case 'BILLING_STATUS_CHANGED': {
        // Subscription auto-renewal
        const { billingKey, customerKey, status } = data;
        
        if (status === 'ACTIVE' && supabase) {
          // Parse platform and userId from customerKey (format: platform_userId)
          const parts = customerKey?.split('_');
          if (parts && parts.length >= 2) {
            const platform = parts[0];
            const userId = parts.slice(1).join('_');
            await activateSubscription(platform, userId, 'basic', billingKey);
          }
        }
        break;
      }

      default:
        console.log(`[payment/webhook] Unhandled event: ${eventType}`);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[payment/webhook] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
