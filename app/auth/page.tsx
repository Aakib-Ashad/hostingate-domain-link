"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/components/providers/auth";
import { createClient } from "@/lib/supabase/client";

export default function AuthPage() {
  const { verifyCodeAndEmail, loading: authLoading } = useAuth();
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const success = await verifyCodeAndEmail(code, email);

    if (success) {
      router.push("/checkout");
    } else {
      setError(
        "Invalid code or email. Please check your details and try again.",
      );
    }

    setLoading(false);
  };

  const fetchData = async () => {
    const { data, error } = await supabase
      .schema("domain")
      .from("domain_is_purchased")
      .select("*");
    if (error) console.log("error is:", error);
    console.log("data is:", data);
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">
            Enter Access Details
          </CardTitle>
          <p className="text-sm text-gray-600 mt-2">
            Please enter your purchase code and email to access the application
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading || authLoading}
                className="w-full"
                required
              />
            </div>
            <div>
              <Input
                type="text"
                placeholder="Enter your access code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={loading || authLoading}
                className="w-full"
                required
              />
            </div>

            {error && (
              <p className="text-red-500 text-sm text-center bg-red-50 p-2 rounded">
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={loading || authLoading || !code.trim() || !email.trim()}
            >
              {loading ? "Verifying..." : "Verify Access"}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-500">
            <p>Don&apos;t have access?</p>
            <p>Contact support to get your access code.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
