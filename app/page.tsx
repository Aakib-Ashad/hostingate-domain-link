"use client";

import { useAuth } from "@/components/providers/auth";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (isAuthenticated) {
        router.push("/checkout");
      } else {
        router.push("/auth");
      }
    }
  }, [isAuthenticated, loading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
    </div>
  );
}