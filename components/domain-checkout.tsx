"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Shield, Lock, Zap, Database, Globe } from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import LoadingSkeleton from "./LoadingSkeleton";
import { redirect } from "next/navigation";
import DomainPaymentDashboard from "./DomainPaymentDashboard";

export default function DomainCheckout() {
  const [isLoading, setIsLoading] = useState(true);
  const [isPurchased, setIsPurchased] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const supabase = createClientComponentClient();

  const storeOrFetchPurchase = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user?.email) {
        setUserEmail(session.user.email);
      }

      const { data: existing } = await supabase
        .from("email_is_purchased")
        .select("*")
        .eq("purchased", true)
        .single();

      if (existing) {
        setIsPurchased(true);
      }
    } catch (error) {
      console.error("Error checking purchase status:", error);
    }
  };

  useEffect(() => {
    storeOrFetchPurchase();
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading) return <LoadingSkeleton />;
  if (isPurchased) redirect("/success");

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-violet-50 py-6 px-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* User Info & Portal Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <Globe className="h-7 w-7 text-purple-600" />
              Hostingate Domain Payment Portal
            </h1>
            <p className="text-slate-500 text-xs mt-0.5">
              Manage top domain renewal deadlines, auto-pay options, and manual renewal checkouts.
            </p>
          </div>

          {userEmail && (
            <Badge
              variant="secondary"
              className="bg-white/90 text-slate-700 border border-slate-200 px-3 py-1.5 shadow-sm text-xs w-fit"
            >
              <Database className="h-3.5 w-3.5 mr-1.5 text-purple-600" />
              Signed in: {userEmail}
            </Badge>
          )}
        </div>

        {/* Dedicated Domain Renewals & Auto-Pay Dashboard */}
        <DomainPaymentDashboard />

        {/* Trust Badges */}
        <div className="mt-8 text-center">
          <div className="flex flex-wrap justify-center items-center gap-3">
            {[
              { icon: Shield, text: "PCI DSS Compliant" },
              { icon: Database, text: "Secure Hosting" },
              { icon: Lock, text: "256-bit Encryption" },
              { icon: Zap, text: "Instant Setup" },
            ].map((item, index) => (
              <div
                key={index}
                className="flex items-center text-slate-600 bg-white/60 px-3 py-1.5 rounded-full text-xs"
              >
                <item.icon className="h-3 w-3 mr-1 text-purple-500" />
                {item.text}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
