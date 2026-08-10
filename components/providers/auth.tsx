"use client";

import { createClient } from "@/lib/supabase/client";
import { createContext, useContext, useState, useEffect } from "react";

interface AuthContextType {
  isAuthenticated: boolean;
  loading: boolean;
  verifyCodeAndEmail: (code: string, email: string) => Promise<boolean>;
  email: string | null;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);

  // Check authentication status on mount
  useEffect(() => {
    const checkAuth = () => {
      try {
        const saved = localStorage.getItem("domain_auth");
        const savedEmail = localStorage.getItem("user_email");

        if (saved) {
          setIsAuthenticated(true);
          if (savedEmail) setEmail(savedEmail);
        }
      } catch (error) {
        console.error("Auth check failed:", error);
        localStorage.removeItem("domain_auth");
        localStorage.removeItem("user_email");
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const verifyCodeAndEmail = async (code: string, email: string) => {
    if (!code.trim() || !email.trim()) return false;

    try {
      const { data, error } = await supabase
        .schema("domain")
        .from("domain_is_purchased")
        .select("id, code, email, purchased")
        .eq("code", code.trim())
        .eq("email", email.trim().toLowerCase())
        .single();

      if (error || !data) {
        console.error("Verification error:", error);
        return false;
      }

      // Check if purchase is valid
      if (!data.purchased) {
        console.error("Purchase not completed");
        return false;
      }

      // Store both code and email for future reference if needed
      localStorage.setItem("domain_auth", "true");
      localStorage.setItem("user_email", email.trim().toLowerCase());
      localStorage.setItem("user_code", code.trim());

      setIsAuthenticated(true);
      setEmail(email.trim().toLowerCase());
      return true;
    } catch (error) {
      console.error("Verification failed:", error);
      return false;
    }
  };

  const logout = () => {
    localStorage.removeItem("domain_auth");
    localStorage.removeItem("user_email");
    localStorage.removeItem("user_code");
    setEmail(null);
    setIsAuthenticated(false);
    // Redirect to auth page after logout
    if (typeof window !== "undefined") {
      window.location.href = "/auth";
    }
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        loading,
        email,
        verifyCodeAndEmail,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
