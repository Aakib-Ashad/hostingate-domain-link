"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Zap, Shield, TrendingUp, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createBrowserClient } from "@/utils/supabase/client";
import { useAuth } from "@/components/providers/auth";

export default function SuccessPage() {
  const { logout } = useAuth();
  const [, setEmail] = useState<string>("your email");
  const [amount, setAmount] = useState<number>(0);
  const [codeCopySuccess, setCodeCopySuccess] = useState(false);
  const [projectID, setProjectID] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const supabase = createBrowserClient();

  // Generate random code
  function generateAlphaNumericCode(length = 12): string {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    return Array.from({ length }, () =>
      chars.charAt(Math.floor(Math.random() * chars.length)),
    ).join("");
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const e = params.get("email");
    const a = params.get("amount");
    const paymentIntentId = params.get("payment_intent");

    const fetchOrInsertPurchase = async () => {
      try {
        if (e && a) {
          // Email & amount from URL — store or fetch
          const { data: existing, error: fetchError } = await supabase
            .from("email_is_purchased")
            .select("id, code")
            .eq("email", e)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (fetchError && fetchError.code !== "PGRST116") {
            console.error("Error fetching purchase:", fetchError.message);
            return;
          }

          if (existing) {
            setProjectID(existing.code);
          } else {
            let stripeCustomerId = null;

            if (paymentIntentId) {
              try {
                const res = await fetch(
                  `/api/payment/retrieve?payment_intent_id=${paymentIntentId}`
                );
                if (res.ok) {
                  const details = await res.json();
                  stripeCustomerId = details.customerId;
                }
              } catch (err) {
                console.error("Error fetching Stripe details:", err);
              }
            }

            const newCode = generateAlphaNumericCode();
            const { error: insertError } = await supabase
              .from("email_is_purchased")
              .insert({
                email: e,
                amount: Number(a),
                purchased: true,
                code: newCode,
                stripe_customer_id: stripeCustomerId,
              });

            if (insertError) {
              console.error("Error inserting purchase:", insertError.message);
              return;
            }
            setProjectID(newCode);
          }

          setEmail(e);
          setAmount(Number(a));
        } else {
          // No email/amount in URL — fetch latest from table
          const { data: latest, error: latestError } = await supabase
            .from("email_is_purchased")
            .select("email, amount, code")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (latestError) {
            console.error(
              "Error fetching latest purchase:",
              latestError.message,
            );
            return;
          }

          if (latest) {
            setEmail(latest.email);
            setAmount(latest.amount ?? 0);
            setProjectID(latest.code);
          }
        }
      } finally {
        setLoading(false);
      }
    };

    fetchOrInsertPurchase();
  }, [supabase]);

  const handleCodeCopy = () => {
    if (!projectID) return;
    navigator.clipboard
      .writeText(projectID)
      .then(() => setCodeCopySuccess(true));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-purple-50 to-violet-50">
        <p className="text-purple-600 font-semibold animate-pulse">
          Loading purchase details...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-purple-50 to-violet-50 py-6 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto text-center">
        {/* Confirmation Card */}
        <Card className="border-0 shadow-xl p-0 bg-white/80 backdrop-blur-sm">
          <CardHeader className="bg-gradient-to-r h-[45] from-purple-500 via-purple-600 to-purple-800 text-white rounded-t-lg">
            <CardTitle className="flex items-center justify-between py-2 text-lg">
              <span className="flex items-center">
                <CheckCircle className="h-5 w-5 mr-2" />
                Project Scaling Plan Activated
              </span>
              <Badge
                variant="secondary"
                className="bg-purple-500 text-white px-2 py-0.5 text-xs"
              >
                <Rocket className="h-3 w-3 mr-1" />
                Growth Ready
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            {/* Project ID */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="text-left">
                <h2 className="text-lg font-semibold text-slate-800 mb-2 flex items-center">
                  <Zap className="h-4 w-4 mr-2 text-purple-500" />
                  Paid Amount
                </h2>
                <div className="bg-purple-50/50 p-4 border border-purple-200 rounded-lg text-purple-700 font-bold text-xl">
                  ${amount.toLocaleString()}
                </div>
              </div>
              <div className="text-left">
                <h2 className="text-lg font-semibold text-slate-800 mb-2 flex items-center">
                  <TrendingUp className="h-4 w-4 mr-2 text-purple-500" />
                  Project ID
                </h2>
                <div className="flex items-center justify-between bg-purple-50/50 p-4 border border-purple-200 rounded-lg">
                  <span className="text-purple-700 font-medium">
                    {projectID}
                  </span>
                  <Button size="sm" variant="outline" onClick={handleCodeCopy}>
                    {codeCopySuccess ? "Copied!" : "Copy"}
                  </Button>
                </div>
              </div>
            </div>

            {/* Amount */}

            {/* Success Message */}
            <div className="text-left">
              <div className="bg-purple-50/50 p-4 border border-purple-200 rounded-lg text-purple-800 font-medium">
                Payment successful! Your project scaling plan has been
                activated. Login to your dashboard to access advanced growth
                tools and resources to scale your project to new heights.
              </div>
            </div>

            {/* Feature badges */}
            <div className="text-left">
              <h3 className="text-lg font-semibold text-slate-800 mb-2 flex items-center">
                <Shield className="h-4 w-4 mr-2 text-purple-500" />
                Scaling Features Activated
              </h3>
              <div className="flex flex-wrap gap-4">
                <Badge className="items-center text-xs gap-1 rounded-full px-2 py-1 bg-purple-500/15 text-purple-700 border border-purple-300">
                  <TrendingUp className="h-3 w-3" /> Growth Analytics
                </Badge>
                <Badge className="items-center text-xs gap-1 rounded-full px-2 py-1 bg-purple-500/15 text-purple-700 border border-purple-300">
                  <Zap className="h-3 w-3" /> Performance Boost
                </Badge>
                <Badge className="items-center text-xs gap-1 rounded-full px-2 py-1 bg-purple-500/15 text-purple-700 border border-purple-300">
                  <Shield className="h-3 w-3" /> Priority Support
                </Badge>
                <Badge className="items-center text-xs gap-1 rounded-full px-2 py-1 bg-purple-500/15 text-purple-700 border border-purple-300">
                  <Rocket className="h-3 w-3" /> Scaling Tools
                </Badge>
              </div>
            </div>

            {/* Button */}
            <div className="mt-6 text-center">
              <Button
                size="lg"
                className="w-full h-12 bg-gradient-to-r from-purple-500 via-purple-600 to-purple-700 hover:from-purple-600 hover:via-purple-700 hover:to-purple-800 text-white font-bold text-lg shadow-xl shadow-purple-500/25 transition-all duration-300"
                onClick={logout}
              >
                Log out
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
