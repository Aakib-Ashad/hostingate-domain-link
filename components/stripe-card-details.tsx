"use client";

import type React from "react";
import { useEffect, useState } from "react";
import { useStripe, useElements, CardElement } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Lock, CreditCard } from "lucide-react";
import { countries } from "@/lib/utils";

export default function AdvancedCheckoutForm({
  amount,
  coupon,
  setCoupon,
  setPayableAmount,
}: {
  amount: number;
  coupon: string | null;
  setCoupon: React.Dispatch<React.SetStateAction<string | null>>;
  setPayableAmount: React.Dispatch<React.SetStateAction<number>>;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [email, setEmail] = useState("domain@hostingate.com");
  const [couponInput, setCouponInput] = useState<string>(coupon ?? "");
  const [couponStatus, setCouponStatus] = useState<string | null>(null);

  const cardElementOptions = {
    hidePostalCode: true,
    style: {
      base: {
        fontSize: "16px",
        color: "#1e293b",
        fontFamily: '"Inter", system-ui, sans-serif',
        "::placeholder": {
          color: "#94a3b8",
        },
      },
      invalid: {
        color: "#ef4444",
        iconColor: "#ef4444",
      },
    },
  };

  const handleApplyCoupon = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setCouponStatus(null);

    try {
      const res = await fetch("/api/payment/validate-coupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, coupon: couponInput }),
      });

      const data = await res.json();
      if (!res.ok) {
        setCouponStatus(data?.message || "Invalid coupon");
        return;
      }

      setCoupon(couponInput);
      setPayableAmount(amount - (data.discountCents ?? 0) / 100);
      setCouponStatus(
        `Applied: saved ${((data.discountCents ?? 0) / 100).toFixed(2)} USD`
      );
    } catch (err) {
      const message =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "Failed to validate coupon";
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  const createPaymentIntent = async () => {
    try {
      const res = await fetch("/api/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          coupon: couponInput || null,
          email,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to create payment intent");
      }

      const data = await res.json();
      return {
        clientSecret: data.clientSecret,
        paymentIntentId: data.paymentIntentId,
      };
    } catch (error) {
      const message =
        error && typeof error === "object" && "message" in error
          ? (error as { message: string }).message
          : "Failed to create payment";
      setErrorMessage(message);
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!stripe || !elements) {
      setErrorMessage(
        "Stripe has not loaded properly. Please refresh the page."
      );
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      // Create PaymentIntent only when user actually submits the form
      const paymentData = await createPaymentIntent();
      if (!paymentData || !paymentData.clientSecret) {
        throw new Error("Failed to initialize payment");
      }
      const { clientSecret, paymentIntentId } = paymentData;

      const cardElement = elements.getElement(CardElement);
      if (!cardElement) throw new Error("Card details not found");

      const formattedAmount = Number(amount.toFixed(2));

      const { error, paymentIntent } = await stripe.confirmCardPayment(
        clientSecret,
        {
          payment_method: {
            card: cardElement,
            billing_details: { email, name: "Customer" },
          },
          return_url: `${
            window.location.origin
          }/success?amount=${formattedAmount}&email=${email}&payment_intent=${paymentIntentId}&coupon=${encodeURIComponent(
            couponInput || ""
          )}`,
        }
      );

      if (error) {
        throw new Error(error.message || "Payment failed");
      }

      if (paymentIntent?.status === "succeeded") {
        window.location.href = `/success?amount=${formattedAmount}&email=${email}&payment_intent=${paymentIntentId}&coupon=${encodeURIComponent(
          couponInput || ""
        )}`;
      } else {
        setErrorMessage(
          "Payment processing. Please check your email for confirmation."
        );
      }
    } catch (err) {
      const message =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "Payment failed";
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8 ">
      <form onSubmit={handleSubmit} className="space-y-2 ">
        <Label
          htmlFor="coupon"
          className="text-sm font-semibold mb-1 text-slate-800"
        >
          <h3 className="text-lg font-semibold text-slate-800 flex items-center">
            <CreditCard className="h-5 w-5 mr-2 text-purple-500" />
            Payment Details
          </h3>
        </Label>
        <div className="space-y-1">
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            disabled
            className="h-11 text-sm hover:shadow-none bg-white/80"
          />
        </div>
        <div className="space-y-2">
          <CardElement
            options={cardElementOptions}
            className="border py-3 px-4 rounded-sm"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-1">
              <Select defaultValue="us">
                <SelectTrigger className="h-12 py-5 w-full border-2 border-slate-200 text-sm bg-white/80 backdrop-blur-sm">
                  <SelectValue placeholder="Select your country" />
                </SelectTrigger>
                <SelectContent>
                  {countries.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <div className="flex gap-2  items-center">
                <Input
                  id="coupon"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value)}
                  placeholder="Promo code"
                  className="h-11 text-sm"
                />
                <Button
                  type="button"
                  onClick={handleApplyCoupon}
                  disabled={isLoading || !couponInput}
                  className="text-sm"
                >
                  {isLoading ? "Checking…" : "Apply"}
                </Button>
              </div>
              {couponStatus && (
                <div
                  className={`text-sm ${
                    couponStatus.includes("Applied")
                      ? "text-purple-600"
                      : "text-red-600"
                  }`}
                >
                  {couponStatus}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="pt-4">
          <Button
            type="submit"
            disabled={!stripe || isLoading || !elements}
            className="w-full h-12 bg-gradient-to-r from-purple-500 via-purple-600 to-purple-700 hover:from-purple-600 hover:via-purple-700 hover:to-purple-800 text-white font-bold text-lg shadow-xl shadow-purple-500/25 transition-all duration-300 transform hover:scale-[1.02]"
          >
            {isLoading ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mr-3"></div>
                Processing Payment...
              </div>
            ) : (
              <div className="flex items-center justify-center">
                <Lock className="h-5 w-5 mr-3" />
                Complete Payment
              </div>
            )}
          </Button>
        </div>

        {errorMessage && (
          <div className="p-4 bg-red-50 border-2 border-red-200 rounded-lg text-red-700 text-base flex items-start">
            <div className="w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs font-bold mr-3 mt-0.5 flex-shrink-0">
              !
            </div>
            <div>{errorMessage}</div>
          </div>
        )}
      </form>
    </div>
  );
}
