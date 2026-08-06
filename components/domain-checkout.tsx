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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-violet-50 py-4 sm:py-8 px-3 sm:px-6">
      <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6">
        {/* User Info & Portal Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 bg-white/40 backdrop-blur-xs p-4 rounded-2xl border border-white/60 shadow-xs">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <Globe className="h-6 w-6 sm:h-7 sm:w-7 text-purple-600 shrink-0" />
              <span>Hostingate Domain Payment Portal</span>
            </h1>
            <p className="text-slate-500 text-xs sm:text-sm mt-1">
              Manage top domain renewal deadlines, auto-pay options, and manual renewal checkouts.
            </p>
          </div>

          {userEmail && (
            <Badge
              variant="secondary"
              className="bg-white/90 text-slate-700 border border-slate-200 px-3 py-1.5 shadow-xs text-xs w-fit shrink-0 self-start sm:self-auto"
            >
              <Database className="h-3.5 w-3.5 mr-1.5 text-purple-600" />
              Signed in: {userEmail}
            </Badge>
          )}
        </div>

        {/* Dedicated Domain Renewals & Auto-Pay Dashboard */}
        <DomainPaymentDashboard />

        {/* Trust Badges */}
        <div className="mt-6 sm:mt-8 text-center">
          <div className="flex flex-wrap justify-center items-center gap-2 sm:gap-3">
            {[
              { icon: Shield, text: "PCI DSS Compliant" },
              { icon: Database, text: "Secure Hosting" },
              { icon: Lock, text: "256-bit Encryption" },
              { icon: Zap, text: "Instant Setup" },
            ].map((item, index) => (
              <div
                key={index}
                className="flex items-center text-slate-600 bg-white/70 backdrop-blur-xs border border-slate-200/60 px-3 py-1.5 rounded-full text-xs font-medium shadow-2xs"
              >
                <item.icon className="h-3.5 w-3.5 mr-1.5 text-purple-500 shrink-0" />
                {item.text}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
