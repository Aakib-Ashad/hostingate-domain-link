"use client";

import React, { useState } from "react";
import { useStripe, useElements, CardElement } from "@stripe/react-stripe-js";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { PaymentMethodItem } from "@/lib/utils";
import { savePaymentMethodToDb } from "@/lib/supabase-service";

interface StripeCardFormProps {
  userEmail: string;
  setAsPrimary: boolean;
  setSetAsPrimary: (val: boolean) => void;
  onSuccess: (newCard: PaymentMethodItem) => void;
  onCancel?: () => void;
  submitButtonText?: string;
}

const cardElementOptions = {
  hidePostalCode: true,
  style: {
    base: {
      fontSize: "14px",
      color: "#0f172a",
      fontWeight: "500",
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

export default function StripeCardForm({
  userEmail,
  setAsPrimary,
  setSetAsPrimary,
  onSuccess,
  onCancel,
  submitButtonText = "Save Card & Continue",
}: StripeCardFormProps) {
  const stripe = useStripe();
  const elements = useElements();

  const [holderName, setHolderName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!holderName.trim()) {
      setErrorMsg("Please enter the cardholder name.");
      toast.error("Missing Cardholder Name");
      return;
    }

    if (!stripe || !elements) {
      setErrorMsg("Stripe has not loaded yet. Please wait a moment.");
      return;
    }

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      setErrorMsg("Card details element not found.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      // 1. Tokenize card securely using Stripe.js browser SDK
      const { paymentMethod, error } = await stripe.createPaymentMethod({
        type: "card",
        card: cardElement,
        billing_details: {
          name: holderName.trim(),
          email: userEmail,
        },
      });

      if (error || !paymentMethod) {
        throw new Error(error?.message || "Failed to validate card details.");
      }

      const cardItem: PaymentMethodItem = {
        id: paymentMethod.id,
        brand: (paymentMethod.card?.brand || "visa") as any,
        last4: paymentMethod.card?.last4 || "4242",
        expMonth: paymentMethod.card?.exp_month || 12,
        expYear: paymentMethod.card?.exp_year || 2028,
        holderName: holderName.trim(),
        isPrimary: setAsPrimary,
      };

      // 2. Attach to customer via backend API
      const savedCard = await savePaymentMethodToDb(cardItem, userEmail);
      const finalCard = savedCard || cardItem;

      toast.success("Payment Card Verified & Saved!", {
        description: `${finalCard.brand.toUpperCase()} ending in ${finalCard.last4} attached securely.`,
      });

      onSuccess(finalCard);
    } catch (err: any) {
      console.error("Stripe card tokenization error:", err);
      const message = err.message || "Could not save card.";
      setErrorMsg(message);
      toast.error("Card Tokenization Error", { description: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 border border-purple-200 bg-purple-50/40 rounded-xl space-y-3.5">
      <div className="flex items-center justify-between text-xs font-bold text-slate-800">
        <span className="flex items-center gap-1.5">
          <CreditCard className="h-4 w-4 text-purple-600" />
          Add Secure Card (Stripe Elements)
        </span>
        <Badge variant="outline" className="text-[10px] bg-white border-purple-200 text-purple-700 flex items-center gap-1">
          <Lock className="h-2.5 w-2.5" /> 256-Bit SSL
        </Badge>
      </div>

      <div className="space-y-2.5">
        <div>
          <label className="text-[11px] font-semibold text-slate-600 block mb-1">
            Cardholder Name
          </label>
          <Input
            placeholder="Name on card"
            value={holderName}
            onChange={(e) => setHolderName(e.target.value)}
            className="h-9 text-xs bg-white border-slate-200 rounded-lg"
            required
          />
        </div>

        <div>
          <label className="text-[11px] font-semibold text-slate-600 block mb-1">
            Card Details
          </label>
          <div className="bg-white border border-slate-200 rounded-lg p-2.5 transition-all focus-within:ring-2 focus-within:ring-purple-500 focus-within:border-purple-500">
            <CardElement options={cardElementOptions} />
          </div>
        </div>

        {errorMsg && (
          <div className="p-2 bg-red-50 border border-red-200 rounded-md text-red-600 text-xs font-medium flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="pt-1 flex items-center justify-between">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={setAsPrimary}
              onChange={(e) => setSetAsPrimary(e.target.checked)}
              className="rounded border-slate-300 text-purple-600 focus:ring-purple-500 h-3.5 w-3.5"
            />
            <span className="text-[11px] font-semibold text-slate-700">
              Set as Primary Card for Auto-Pay
            </span>
          </label>
        </div>
      </div>

      <div className="pt-2 flex items-center justify-end gap-2">
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={isSubmitting}
            className="text-xs h-8 text-slate-600"
          >
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          disabled={!stripe || isSubmitting}
          size="sm"
          className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs h-8 px-4 rounded-lg shadow-sm"
        >
          {isSubmitting ? (
            <span className="flex items-center gap-1.5">
              <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />
              Verifying Card...
            </span>
          ) : (
            submitButtonText
          )}
        </Button>
      </div>
    </form>
  );
}
