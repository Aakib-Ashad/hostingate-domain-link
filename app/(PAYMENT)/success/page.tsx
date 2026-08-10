"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Zap, Shield, Globe, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

export default function SuccessPage() {
  const [email, setEmail] = useState<string>("domain@hostingate.com");
  const [amount, setAmount] = useState<number>(0);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [domainName, setDomainName] = useState<string>("sckali.com");
  const [nextPaymentDate, setNextPaymentDate] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const e = "domain@hostingate.com";
    const a = params.get("amount");
    const pi = params.get("payment_intent");

    const fetchPaymentDetails = async () => {
      try {
        setEmail(e);
        if (a) setAmount(Number(a));
        if (pi) setPaymentIntentId(pi);

        // Fetch latest transaction details from domain.stripe_payments
        let query = supabase
          .schema("domain")
          .from("stripe_payments")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(1);

        if (pi) {
          query = query.eq("payment_intent_id", pi);
        } else if (e) {
          query = query.eq("user_email", e);
        }

        const { data: transaction } = await query.maybeSingle();

        if (transaction) {
          setAmount(transaction.amount_usd ?? Number(a) ?? 97.99);
          setPaymentIntentId(transaction.payment_intent_id);
          setDomainName(transaction.domain_name);
          setNextPaymentDate(transaction.next_payment_date);
        }
      } catch (err) {
        console.error("Error fetching payment success details:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchPaymentDetails();
  }, [supabase]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-purple-50 to-violet-50">
        <p className="text-purple-600 font-semibold animate-pulse">
          Loading domain renewal receipt...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-purple-50 to-violet-50 py-6 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto text-center w-full">
        {/* Domain Renewal Confirmation Card */}
        <Card className="border-0 shadow-xl p-0 bg-white/90 backdrop-blur-sm overflow-hidden rounded-2xl">
          <CardHeader className="bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-700 text-white p-6">
            <CardTitle className="flex items-center justify-between text-xl">
              <span className="flex items-center gap-2">
                <CheckCircle className="h-6 w-6 text-emerald-300" />
                Domain Renewal Successful
              </span>
              <Badge
                variant="secondary"
                className="bg-white/20 text-white border-0 px-3 py-1 text-xs"
              >
                Active Subscription
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 sm:p-8 space-y-6">
            {/* Domain & Amount Breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="text-left bg-slate-50 p-4 border border-slate-200/80 rounded-xl">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <Globe className="h-4 w-4 text-purple-600" />
                  Domain Renewed
                </h3>
                <p className="text-lg font-bold text-slate-900">{domainName}</p>
                <p className="text-xs text-slate-500 mt-1">Email: {email}</p>
              </div>

              <div className="text-left bg-slate-50 p-4 border border-slate-200/80 rounded-xl">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <Zap className="h-4 w-4 text-purple-600" />
                  Amount Paid
                </h3>
                <p className="text-2xl font-bold text-purple-700">
                  ${amount.toFixed(2)} USD
                </p>
                {nextPaymentDate && (
                  <p className="text-xs text-slate-500 mt-1">
                    Next Due: {nextPaymentDate}
                  </p>
                )}
              </div>
            </div>

            {/* Payment Intent & Status */}
            {paymentIntentId && (
              <div className="text-left bg-purple-50/50 p-4 border border-purple-200/60 rounded-xl space-y-1">
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
                  Stripe Payment Intent ID
                </p>
                <p className="text-xs font-mono font-medium text-purple-800 break-all">
                  {paymentIntentId}
                </p>
              </div>
            )}

            {/* Feature Badges */}
            <div className="text-left space-y-3">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Services Included
              </h4>
              <div className="flex flex-wrap gap-2">
                <Badge className="items-center text-xs gap-1 rounded-lg px-2.5 py-1 bg-purple-100 text-purple-800 border-0">
                  <Shield className="h-3 w-3 text-purple-600" /> SSL Certificate Active
                </Badge>
                <Badge className="items-center text-xs gap-1 rounded-lg px-2.5 py-1 bg-purple-100 text-purple-800 border-0">
                  <CheckCircle className="h-3 w-3 text-purple-600" /> WHOIS Privacy Protection
                </Badge>
                <Badge className="items-center text-xs gap-1 rounded-lg px-2.5 py-1 bg-purple-100 text-purple-800 border-0">
                  <Globe className="h-3 w-3 text-purple-600" /> Auto-Renewal Protection
                </Badge>
              </div>
            </div>

            {/* Action Button */}
            <div className="pt-4">
              <Button
                asChild
                size="lg"
                className="w-full h-12 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold text-base shadow-lg shadow-purple-500/20 transition-all rounded-xl"
              >
                <Link href="/">
                  Return to Domain Dashboard <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
