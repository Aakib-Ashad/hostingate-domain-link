import Stripe from "stripe";
import { NextResponse } from "next/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-08-27.basil",
});

export async function POST(req: Request) {
  try {
    const { amount, coupon } = await req.json();
    if (!coupon) {
      return NextResponse.json(
        { valid: false, message: "No coupon provided" },
        { status: 400 }
      );
    }

    const amtCents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(amtCents) || amtCents <= 0) {
      return NextResponse.json(
        { valid: false, message: "Invalid amount" },
        { status: 400 }
      );
    }

    // Find active promotion code by code text
    const promos = await stripe.promotionCodes.list({
      code: coupon,
      active: true,
      limit: 1,
    });
    if (!promos.data.length) {
      return NextResponse.json(
        { valid: false, message: "Coupon not found or inactive" },
        { status: 400 }
      );
    }

    const promo = promos.data[0];
    const couponObj = promo.coupon;
    if (!couponObj) {
      return NextResponse.json(
        { valid: false, message: "Invalid promotion code" },
        { status: 400 }
      );
    }

    // Check expiry
    if (couponObj.redeem_by && Date.now() / 1000 > couponObj.redeem_by) {
      return NextResponse.json(
        { valid: false, message: "Coupon expired" },
        { status: 400 }
      );
    }

    // Compute final amount (in cents)
    let finalCents = amtCents;
    if (couponObj.amount_off) {
      // amount_off is in cents
      finalCents = Math.max(0, amtCents - couponObj.amount_off);
    } else if (couponObj.percent_off) {
      finalCents = Math.round(amtCents * (1 - couponObj.percent_off / 100));
    }

    return NextResponse.json({
      valid: true,
      message: "Coupon valid",
      originalAmountCents: amtCents,
      finalAmountCents: finalCents,
      discountCents: amtCents - finalCents,
      promotionCodeId: promo.id,
      couponId: couponObj.id,
    });
  } catch (err) {
      const message =
    err && typeof err === "object" && "message" in err
      ? (err as { message: string }).message
      : "server error"
    return NextResponse.json(
      { valid: false, message },
      { status: 500 }
    );
  }
}
