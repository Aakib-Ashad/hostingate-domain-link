"use client";
import DomainCheckout from "@/components/domain-checkout";
import { useAuth } from "@/components/providers/auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function DomainPage() {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push("/auth");
    }
  }, [isAuthenticated, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }
  return (
    <div>
      <DomainCheckout />
    </div>
  );
}
