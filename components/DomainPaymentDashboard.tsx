"use client";

import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  CreditCard,
  Zap,
  Search,
  ShieldCheck,
  RefreshCw,
  Lock,
  Globe,
  Check,
  Plus,
  Trash2,
} from "lucide-react";
import {
  domainPaymentItems,
  DomainPaymentInfo,
  PaymentMethodItem,
  initialPaymentMethods,
  isCardExpired,
  isCardExpiringSoon,
} from "@/lib/utils";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  updateDomainAutoPayInDb,
  fetchUserPaymentMethods,
  savePaymentMethodToDb,
  setPrimaryPaymentMethodInDb,
  deletePaymentMethodFromDb,
  fetchDomainSubscriptions,
} from "@/lib/supabase-service";

import { useAuth } from "@/components/providers/auth";

export default function DomainPaymentDashboard() {
  const { email: authEmail } = useAuth();
  const userEmail = authEmail || "domain@hostingate.com";

  const [domainsList, setDomainsList] = useState<DomainPaymentInfo[]>(domainPaymentItems);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "urgent" | "expiring" | "healthy">("all");
  const [selectedDomainIds, setSelectedDomainIds] = useState<string[]>([]);

  // Saved Payment Cards State
  const [savedCards, setSavedCards] = useState<PaymentMethodItem[]>(initialPaymentMethods);

  // Fetch saved cards & domain subscriptions from Supabase on mount
  React.useEffect(() => {
    const loadInitialData = async () => {
      const dbCards = await fetchUserPaymentMethods(userEmail);
      if (dbCards && dbCards.length > 0) {
        setSavedCards(dbCards);
        const primary = dbCards.find((c) => c.isPrimary) || dbCards[0];
        if (primary) setSelectedPaymentMethodId(primary.id);
      }

      // Fetch domain subscriptions & next payment dates from Supabase
      const dbSubs = await fetchDomainSubscriptions(userEmail);
      if (dbSubs && dbSubs.length > 0) {
        setDomainsList((prev) =>
          prev.map((item) => {
            const sub = dbSubs.find((s) => s.domain_id === item.id || s.full_domain_name === item.fullDomainName);
            if (sub) {
              const days = Math.max(0, Math.ceil((new Date(sub.next_payment_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
              return {
                ...item,
                status: sub.status as any,
                dueDate: sub.next_payment_date,
                daysRemaining: days,
                autoPayEnabled: sub.auto_pay_enabled,
                autoPayMethod: sub.auto_pay_method || undefined,
                lastPaymentDate: sub.last_payment_date || item.lastPaymentDate,
              };
            }
            return item;
          })
        );
      }
    };
    loadInitialData();
  }, [userEmail]);

  // Primary card selection helper
  const primaryCard = savedCards.find((c) => c.isPrimary) || savedCards[0];

  // Checkout Modal State
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [checkoutTarget, setCheckoutTarget] = useState<"single" | "bulk">("single");
  const [singleCheckoutDomain, setSingleCheckoutDomain] = useState<DomainPaymentInfo | null>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [autoPayOnCheckout, setAutoPayOnCheckout] = useState(true);

  // Checkout Payment Method Selection State
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string>(
    primaryCard?.id || "pm-1"
  );
  const [isAddingNewCardInCheckout, setIsAddingNewCardInCheckout] = useState(false);
  const [setNewCardAsPrimary, setSetNewCardAsPrimary] = useState(false);

  // New Card Form Details
  const [newCardForm, setNewCardForm] = useState({
    number: "",
    holderName: "",
    expMonth: "08",
    expYear: "2028",
    cvc: "",
    brand: "visa" as "visa" | "mastercard" | "amex" | "discover",
  });

  // Card Manager Dialog State
  const [isCardManagerOpen, setIsCardManagerOpen] = useState(false);
  const [isAddingInManager, setIsAddingInManager] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isRunningAutoPay, setIsRunningAutoPay] = useState(false);

  // Trigger Auto-Pay Renewal Engine via Stripe Off-Session Charges
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleRunAutoPayNow = async () => {
    if (!primaryCard) {
      toast.error("Primary Card Required", {
        description: "Please set a Primary Card in Saved Payment Methods to execute Auto-Pay renewals.",
      });
      setIsCardManagerOpen(true);
      return;
    }

    if (isCardExpired(primaryCard.expMonth, primaryCard.expYear)) {
      toast.error("Primary Card Expired", {
        description: "Your primary card has expired. Please add or set a valid primary card to execute Auto-Pay.",
      });
      setIsCardManagerOpen(true);
      return;
    }

    setIsRunningAutoPay(true);
    try {
      const res = await fetch("/api/stripe/auto-pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail }),
      });

      const data = await res.json();
      if (data.success && Array.isArray(data.processed)) {
        const succeededCount = data.processed.filter((p: any) => p.success).length;
        if (succeededCount > 0) {
          toast.success("Auto-Pay Executed Successfully!", {
            description: `Automatically renewed ${succeededCount} Auto-Pay domain(s) using primary card ending in ${primaryCard.last4}.`,
          });

          // Refresh domain list from Supabase
          const dbSubs = await fetchDomainSubscriptions("domain@hostingate.com");
          if (dbSubs && dbSubs.length > 0) {
            setDomainsList((prev) =>
              prev.map((item) => {
                const sub = dbSubs.find((s) => s.domain_id === item.id || s.full_domain_name === item.fullDomainName);
                if (sub) {
                  const days = Math.max(0, Math.ceil((new Date(sub.next_payment_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
                  return {
                    ...item,
                    status: sub.status as any,
                    dueDate: sub.next_payment_date,
                    daysRemaining: days,
                    autoPayEnabled: sub.auto_pay_enabled,
                    autoPayMethod: sub.auto_pay_method || undefined,
                    lastPaymentDate: sub.last_payment_date || item.lastPaymentDate,
                  };
                }
                return item;
              })
            );
          }
        } else {
          toast.info("No Auto-Pay enabled domains required renewal at this moment.");
        }
      } else {
        toast.info(data.error || "No Auto-Pay domains ready for renewal.");
      }
    } catch (err) {
      console.error("Auto-Pay execution error:", err);
      toast.error("Auto-Pay Execution Error");
    } finally {
      setIsRunningAutoPay(false);
    }
  };

  // Change Primary Card Handler (Updates State & Supabase)
  const handleSetPrimaryCard = async (cardId: string) => {
    const targetCard = savedCards.find((c) => c.id === cardId);
    if (!targetCard) return;

    if (isCardExpired(targetCard.expMonth, targetCard.expYear)) {
      toast.error("Cannot Set Expired Card", {
        description: "This payment card has expired. Please add a valid card to use as your Primary Auto-Pay method.",
      });
      return;
    }

    setSavedCards((prev) =>
      prev.map((card) => ({
        ...card,
        isPrimary: card.id === cardId,
      }))
    );

    // Synchronize primary card across all auto-pay enabled domains
    setDomainsList((prev) =>
      prev.map((item) =>
        item.autoPayEnabled
          ? { ...item, autoPayMethod: `•••• ${targetCard.last4}` }
          : item
      )
    );

    // Persist primary card update in Supabase
    await setPrimaryPaymentMethodInDb(cardId, "domain@hostingate.com");

    toast.success("Primary Card Updated!", {
      description: `${targetCard.brand.toUpperCase()} ending in ${targetCard.last4} is now set as your primary card in Supabase for Auto-Pay renewals.`,
    });
  };

  // Add New Card Handler (Updates State & Saves to Supabase)
  const handleAddNewCard = async (setAsPrimary: boolean): Promise<PaymentMethodItem> => {
    const cleanNumber = newCardForm.number.replace(/\s+/g, "");
    const last4 = cleanNumber.length >= 4 ? cleanNumber.slice(-4) : "9942";
    const brand =
      newCardForm.brand || (cleanNumber.startsWith("5") ? "mastercard" : "visa");

    const newCardTemp: PaymentMethodItem = {
      id: `pm-${Date.now()}`,
      brand,
      last4,
      expMonth: parseInt(newCardForm.expMonth, 10) || 8,
      expYear: parseInt(newCardForm.expYear, 10) || 2028,
      isPrimary: setAsPrimary || savedCards.length === 0,
      holderName: newCardForm.holderName || "Hostingate User",
    };

    // Save Card directly into Supabase domain.payment_methods table
    const savedDbCard = await savePaymentMethodToDb(newCardTemp, "domain@hostingate.com");
    const newCard = savedDbCard || newCardTemp;

    setSavedCards((prev) => {
      if (setAsPrimary) {
        return [...prev.map((c) => ({ ...c, isPrimary: false })), newCard];
      }
      return [...prev, newCard];
    });

    if (setAsPrimary) {
      setDomainsList((prev) =>
        prev.map((item) =>
          item.autoPayEnabled
            ? { ...item, autoPayMethod: `•••• ${last4}` }
            : item
        )
      );
    }

    setSelectedPaymentMethodId(newCard.id);

    // Reset Form
    setNewCardForm({
      number: "",
      holderName: "",
      expMonth: "08",
      expYear: "2028",
      cvc: "",
      brand: "visa",
    });

    toast.success("New Payment Card Added!", {
      description: `${brand.toUpperCase()} ending in ${last4} was saved to Supabase.`,
    });

    return newCard;
  };

  // Delete Saved Card Handler (Updates State & Deletes from Supabase)
  const handleDeleteCard = async (cardId: string) => {
    const cardToDelete = savedCards.find((c) => c.id === cardId);
    if (!cardToDelete) return;

    if (savedCards.length <= 1) {
      toast.error("Cannot Remove Card", {
        description: "You must keep at least one saved payment method.",
      });
      return;
    }

    if (cardToDelete.isPrimary) {
      toast.error("Cannot Remove Primary Card", {
        description: "Please assign a different primary card before removing this method.",
      });
      return;
    }

    setSavedCards((prev) => prev.filter((c) => c.id !== cardId));

    // Delete card from Supabase domain.payment_methods table
    await deletePaymentMethodFromDb(cardId, "domain@hostingate.com");

    toast.info("Payment Card Removed", {
      description: `${cardToDelete.brand.toUpperCase()} ending in ${cardToDelete.last4} was deleted from Supabase.`,
    });
  };

  // Calculate total price for a single domain including addons (SSL mandatory $29, Protection optional $49)
  const getDomainItemTotal = (item: DomainPaymentInfo) => {
    const ssl = item.sslPrice || 29;
    const protection = item.domainProtectionEnabled ? item.domainProtectionPrice || 49 : 0;
    return (item.renewalPrice + ssl + protection) * item.periodYears;
  };

  // Grouped domains
  const urgentDomains = domainsList.filter((d) => d.status === "due");
  const expiringDomains = domainsList.filter((d) => d.status === "closer_to_due");
  const healthyDomains = domainsList.filter((d) => d.status === "already_paid");

  // Total cost calculations for "Pay All Due"
  const urgentTotalCost = urgentDomains.reduce(
    (sum, item) => sum + getDomainItemTotal(item),
    0
  );
  const expiringTotalCost = expiringDomains.reduce(
    (sum, item) => sum + getDomainItemTotal(item),
    0
  );

  // Multi-select handler
  const toggleSelectDomain = (id: string) => {
    setSelectedDomainIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Pay All Due action: Selects all Urgent + Expiring domains and launches checkout
  const handlePayAllDue = () => {
    const allDueIds = [...urgentDomains, ...expiringDomains].map((d) => d.id);
    if (allDueIds.length === 0) {
      toast.info("No due or expiring domains to pay!");
      return;
    }
    setSelectedDomainIds(allDueIds);
    setCheckoutTarget("bulk");
    setAutoPayOnCheckout(true);
    setIsAddingNewCardInCheckout(false);
    setIsCheckoutOpen(true);
  };

  // Toggle Auto-Pay per domain (Requires a Primary Card to enable)
  const toggleAutoPay = async (id: string, domainName: string) => {
    const targetDomain = domainsList.find((d) => d.id === id);
    if (!targetDomain) return;

    const isTurningOn = !targetDomain.autoPayEnabled;

    // Rule: Auto-Pay can ONLY be enabled if payment has already happened (status === 'already_paid')
    if (isTurningOn && targetDomain.status !== "already_paid") {
      toast.error("Payment Required First", {
        description: "Auto-Pay can only be enabled for domains that have already been paid. Please complete domain payment first.",
      });
      openSinglePayment(targetDomain);
      return;
    }

    if (isTurningOn && (!primaryCard || !savedCards.some((c) => c.isPrimary))) {
      toast.error("Primary Card Required", {
        description: "Auto-Pay can only be enabled if you have a Primary Card set. Please set a Primary Card in Saved Payment Methods.",
      });
      setIsCardManagerOpen(true);
      return;
    }

    const currentPrimary = primaryCard ? `•••• ${primaryCard.last4}` : "•••• 4242";
    const nextState = !targetDomain.autoPayEnabled;
    const autoPayMethod = nextState ? targetDomain.autoPayMethod || currentPrimary : undefined;

    setDomainsList((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              autoPayEnabled: nextState,
              autoPayMethod,
            }
          : item
      )
    );

    toast.success(
      nextState
        ? `Auto-Pay Enabled for ${domainName}`
        : `Auto-Pay Disabled for ${domainName}`,
      {
        description: nextState
          ? `Auto-Pay will charge primary card (${currentPrimary}) prior to expiration.`
          : "Manual payment will be required prior to expiration.",
      }
    );

    // Sync Auto-Pay toggle state directly into Supabase domain_subscriptions
    await updateDomainAutoPayInDb({
      domainId: id,
      fullDomainName: domainName,
      autoPayEnabled: nextState,
      autoPayMethod,
      paymentMethodId: primaryCard?.id,
    });
  };

  // Toggle Domain Protection ($49 optional) per domain
  const toggleDomainProtection = (id: string, domainName: string) => {
    const targetDomain = domainsList.find((d) => d.id === id);
    if (!targetDomain) return;

    const nextState = !targetDomain.domainProtectionEnabled;

    setDomainsList((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, domainProtectionEnabled: nextState } : item
      )
    );

    toast.info(
      nextState
        ? `Domain Protection Enabled for ${domainName} (+$49/yr)`
        : `Domain Protection Removed for ${domainName}`,
      {
        description: nextState
          ? "Protects domain WHOIS privacy and shields against unauthorized transfers."
          : "Domain protection disabled.",
      }
    );
  };

  // Update Year Duration (1 Yr, 2 Yrs, 3 Yrs)
  const updatePeriodYears = (id: string, years: number) => {
    setDomainsList((prev) =>
      prev.map((item) => (item.id === id ? { ...item, periodYears: years } : item))
    );
  };

  // Open single domain checkout
  const openSinglePayment = (domain: DomainPaymentInfo) => {
    setSingleCheckoutDomain(domain);
    setCheckoutTarget("single");
    setAutoPayOnCheckout(true);
    setIsAddingNewCardInCheckout(false);
    setIsCheckoutOpen(true);
  };

  // Open selected domains bulk checkout
  const openSelectedPayment = () => {
    if (selectedDomainIds.length === 0) {
      toast.error("Please select at least one domain to pay");
      return;
    }
    setCheckoutTarget("bulk");
    setAutoPayOnCheckout(true);
    setIsAddingNewCardInCheckout(false);
    setIsCheckoutOpen(true);
  };

  // Calculate items in checkout modal
  const checkoutItems =
    checkoutTarget === "single" && singleCheckoutDomain
      ? [singleCheckoutDomain]
      : domainsList.filter((d) => selectedDomainIds.includes(d.id));

  const checkoutTotalAmount = checkoutItems.reduce(
    (sum, item) => sum + getDomainItemTotal(item),
    0
  );

  // Complete Payment Action
  const processCheckoutPayment = async () => {
    setIsProcessingPayment(true);

    let activeCard: PaymentMethodItem | undefined;

    if (isAddingNewCardInCheckout) {
      activeCard = await handleAddNewCard(setNewCardAsPrimary);
    } else {
      activeCard = savedCards.find((c) => c.id === selectedPaymentMethodId) || primaryCard;
      if (setNewCardAsPrimary && activeCard && !activeCard.isPrimary) {
        await handleSetPrimaryCard(activeCard.id);
      }
    }

    const cardSuffix = activeCard ? `•••• ${activeCard.last4}` : "•••• 4242";
    const cardBrand = activeCard ? activeCard.brand.toUpperCase() : "VISA";

    try {
      const itemsPayload = checkoutItems.map((item) => ({
        domainId: item.id,
        domainName: item.fullDomainName,
        periodYears: item.periodYears,
        amountUsd: getDomainItemTotal(item),
        renewalPrice: item.renewalPrice,
        sslPrice: item.sslPrice,
        domainProtectionEnabled: item.domainProtectionEnabled,
        domainProtectionPrice: item.domainProtectionPrice,
      }));

      const paymentRes = await fetch("/api/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: checkoutTotalAmount,
          email: userEmail,
          domainId: checkoutItems[0]?.id || "dom-1",
          domainName: checkoutItems[0]?.fullDomainName || "sckali.com",
          periodYears: checkoutItems[0]?.periodYears || 1,
          renewalPrice: checkoutItems[0]?.renewalPrice,
          sslPrice: checkoutItems[0]?.sslPrice,
          domainProtectionEnabled: checkoutItems[0]?.domainProtectionEnabled,
          domainProtectionPrice: checkoutItems[0]?.domainProtectionPrice,
          paymentMethodId: activeCard?.id,
          autoPayEnabled: autoPayOnCheckout,
          items: itemsPayload,
        }),
      });

      const paymentData = await paymentRes.json();

      if (!paymentRes.ok || !paymentData.success) {
        throw new Error(paymentData.error || "Payment execution failed");
      }

      // Re-fetch updated domain subscriptions from Supabase to sync UI state
      const dbSubs = await fetchDomainSubscriptions("domain@hostingate.com");
      if (dbSubs && dbSubs.length > 0) {
        setDomainsList((prev) =>
          prev.map((item) => {
            const sub = dbSubs.find(
              (s) => s.domain_id === item.id || s.full_domain_name === item.fullDomainName
            );
            if (sub) {
              const days = Math.max(
                0,
                Math.ceil((new Date(sub.next_payment_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
              );
              return {
                ...item,
                status: sub.status as any,
                dueDate: sub.next_payment_date,
                daysRemaining: days,
                autoPayEnabled: sub.auto_pay_enabled,
                autoPayMethod: sub.auto_pay_method || undefined,
                lastPaymentDate: sub.last_payment_date || item.lastPaymentDate,
              };
            }
            return item;
          })
        );
      } else {
        const paidIds = checkoutItems.map((d) => d.id);
        setDomainsList((prev) =>
          prev.map((item) => {
            if (paidIds.includes(item.id)) {
              return {
                ...item,
                status: "already_paid",
                daysRemaining: 365 * item.periodYears,
                dueDate: new Date(
                  Date.now() + 365 * item.periodYears * 24 * 60 * 60 * 1000
                )
                  .toISOString()
                  .split("T")[0],
                autoPayEnabled: autoPayOnCheckout ? true : item.autoPayEnabled,
                autoPayMethod: autoPayOnCheckout ? cardSuffix : item.autoPayMethod,
                lastPaymentDate: new Date().toISOString().split("T")[0],
              };
            }
            return item;
          })
        );
      }

      const paidIds = checkoutItems.map((d) => d.id);
      setSelectedDomainIds((prev) => prev.filter((id) => !paidIds.includes(id)));

      toast.success("Payment Processed & Saved to Supabase!", {
        description: `Renewed ${checkoutItems.length} domain(s) using ${cardBrand} ending in ${activeCard?.last4 || "4242"}. Total Paid: $${checkoutTotalAmount.toFixed(
          2
        )}`,
      });
    } catch (err: any) {
      console.error("Checkout payment error:", err);
      toast.error("Payment Execution Failed", {
        description: err.message || "Could not process transaction.",
      });
    } finally {
      setIsProcessingPayment(false);
      setIsCheckoutOpen(false);
    }
  };

  // Search filter helper
  const filterBySearch = (items: DomainPaymentInfo[]) =>
    items.filter((item) =>
      item.fullDomainName.toLowerCase().includes(searchTerm.toLowerCase())
    );

  const filteredUrgent = filterBySearch(urgentDomains);
  const filteredExpiring = filterBySearch(expiringDomains);
  const filteredHealthy = filterBySearch(healthyDomains);

  return (
    <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
      {/* Sleek Minimal Header Bar */}
      <div className="bg-white rounded-2xl p-3.5 sm:p-5 border border-slate-200/80 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
        {/* Left: Search Bar */}
        <div className="relative w-full lg:w-auto lg:flex-1 max-w-full lg:max-w-xs">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
          <Input
            type="text"
            placeholder="Search domain..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-10 border-slate-200 rounded-xl bg-slate-50 text-xs focus:bg-white transition-all w-full"
          />
        </div>

        {/* Middle: Filter Tabs (Urgent, Expiring Soon, Healthy) */}
        <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl text-xs font-medium overflow-x-auto w-full lg:w-auto no-scrollbar scroll-smooth shrink-0">
          <button
            onClick={() => setActiveTab("all")}
            className={`px-3 py-1.5 rounded-lg transition-all shrink-0 ${activeTab === "all"
                ? "bg-white text-slate-900 font-bold shadow-xs"
                : "text-slate-600 hover:text-slate-900"
              }`}
          >
            All ({domainsList.length})
          </button>
          <button
            onClick={() => setActiveTab("urgent")}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 shrink-0 ${activeTab === "urgent"
                ? "bg-red-600 text-white font-bold shadow-xs"
                : "text-red-600 hover:bg-red-50"
              }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
            Urgent ({urgentDomains.length})
          </button>
          <button
            onClick={() => setActiveTab("expiring")}
            className={`px-3 py-1.5 rounded-lg transition-all shrink-0 ${activeTab === "expiring"
                ? "bg-amber-500 text-white font-bold shadow-xs"
                : "text-amber-700 hover:bg-amber-50"
              }`}
          >
            Expiring ({expiringDomains.length})
          </button>
          <button
            onClick={() => setActiveTab("healthy")}
            className={`px-3 py-1.5 rounded-lg transition-all shrink-0 ${activeTab === "healthy"
                ? "bg-emerald-600 text-white font-bold shadow-xs"
                : "text-emerald-700 hover:bg-emerald-50"
              }`}
          >
            Healthy ({healthyDomains.length})
          </button>
        </div>

        {/* Right: Payment Cards Manager & Pay All Due */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full lg:w-auto justify-stretch sm:justify-end">
          {/* Saved Cards Management Button */}
          <Button
            onClick={() => setIsCardManagerOpen(true)}
            variant="outline"
            size="sm"
            className="border-slate-200 text-slate-700 hover:bg-purple-50 hover:border-purple-200 text-xs font-semibold rounded-xl h-10 px-3 flex items-center justify-center gap-1.5 flex-1 sm:flex-none"
            title="Manage Payment Cards & Primary Auto-Pay Method"
          >
            <CreditCard className="h-4 w-4 text-purple-600 shrink-0" />
            <span className="truncate">
              Primary:{" "}
              <strong className="font-extrabold text-purple-700">
                {primaryCard ? `${primaryCard.brand.toUpperCase()} •••• ${primaryCard.last4}` : "None"}
              </strong>
            </span>
          </Button>

          {/* Trigger Auto-Pay Engine Button */}
          <Button
            onClick={handleRunAutoPayNow}
            disabled={isRunningAutoPay}
            variant="outline"
            size="sm"
            className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-xs font-bold rounded-xl h-10 px-3 flex items-center justify-center gap-1.5 flex-1 sm:flex-none"
            title="Trigger Auto-Pay Off-Session Charges via Stripe for Auto-Pay Enabled Domains"
          >
            <Zap className={`h-4 w-4 text-emerald-600 ${isRunningAutoPay ? "animate-spin" : ""}`} />
            <span className="truncate">{isRunningAutoPay ? "Auto-Paying..." : "Run Auto-Pay"}</span>
          </Button>

          {selectedDomainIds.length > 0 && (
            <Button
              onClick={openSelectedPayment}
              variant="outline"
              size="sm"
              className="border-purple-200 text-purple-700 hover:bg-purple-50 text-xs font-semibold rounded-xl h-10 px-3 flex-1 sm:flex-none"
            >
              Pay Selected ({selectedDomainIds.length})
            </Button>
          )}

          <Button
            onClick={handlePayAllDue}
            disabled={urgentDomains.length === 0 && expiringDomains.length === 0}
            className="bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-bold text-xs rounded-xl h-10 px-4 sm:px-5 shadow-xs flex items-center justify-center gap-2 flex-1 sm:flex-none"
          >
            <CreditCard className="h-4 w-4 shrink-0" />
            <span className="truncate">Pay All (${(urgentTotalCost + expiringTotalCost).toFixed(2)})</span>
          </Button>
        </div>
      </div>

      {/* Main Clean Domain List */}
      <div className="space-y-6">
        {/* SECTION 1: URGENT (DUE NOW / OVERDUE) */}
        {(activeTab === "all" || activeTab === "urgent") && filteredUrgent.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center space-x-2 px-1">
              <AlertTriangle className="h-4 w-4 text-red-600 animate-pulse" />
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                Urgent Action Required ({filteredUrgent.length})
              </h3>
            </div>
            <div className="space-y-2">
              {filteredUrgent.map((domain) => (
                <SimpleDomainRow
                  key={domain.id}
                  domain={domain}
                  isSelected={selectedDomainIds.includes(domain.id)}
                  onToggleSelect={() => toggleSelectDomain(domain.id)}
                  onToggleAutoPay={() => toggleAutoPay(domain.id, domain.fullDomainName)}
                  onToggleProtection={() => toggleDomainProtection(domain.id, domain.fullDomainName)}
                  onUpdatePeriod={(years) => updatePeriodYears(domain.id, years)}
                  onPayNow={() => openSinglePayment(domain)}
                  getDomainTotal={getDomainItemTotal}
                />
              ))}
            </div>
          </div>
        )}

        {/* SECTION 2: EXPIRING SOON */}
        {(activeTab === "all" || activeTab === "expiring") && filteredExpiring.length > 0 && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center space-x-2 px-1">
              <Clock className="h-4 w-4 text-amber-600" />
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                Expiring Soon ({filteredExpiring.length})
              </h3>
            </div>
            <div className="space-y-2">
              {filteredExpiring.map((domain) => (
                <SimpleDomainRow
                  key={domain.id}
                  domain={domain}
                  isSelected={selectedDomainIds.includes(domain.id)}
                  onToggleSelect={() => toggleSelectDomain(domain.id)}
                  onToggleAutoPay={() => toggleAutoPay(domain.id, domain.fullDomainName)}
                  onToggleProtection={() => toggleDomainProtection(domain.id, domain.fullDomainName)}
                  onUpdatePeriod={(years) => updatePeriodYears(domain.id, years)}
                  onPayNow={() => openSinglePayment(domain)}
                  getDomainTotal={getDomainItemTotal}
                />
              ))}
            </div>
          </div>
        )}

        {/* SECTION 3: HEALTHY (ALREADY PAID) */}
        {(activeTab === "all" || activeTab === "healthy") && filteredHealthy.length > 0 && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center space-x-2 px-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                Healthy &amp; Active Domains ({filteredHealthy.length})
              </h3>
            </div>
            <div className="space-y-2">
              {filteredHealthy.map((domain) => (
                <SimpleDomainRow
                  key={domain.id}
                  domain={domain}
                  isSelected={selectedDomainIds.includes(domain.id)}
                  onToggleSelect={() => toggleSelectDomain(domain.id)}
                  onToggleAutoPay={() => toggleAutoPay(domain.id, domain.fullDomainName)}
                  onToggleProtection={() => toggleDomainProtection(domain.id, domain.fullDomainName)}
                  onUpdatePeriod={(years) => updatePeriodYears(domain.id, years)}
                  onPayNow={() => openSinglePayment(domain)}
                  getDomainTotal={getDomainItemTotal}
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty Search Result */}
        {filteredUrgent.length === 0 &&
          filteredExpiring.length === 0 &&
          filteredHealthy.length === 0 && (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-200/80">
              <Globe className="h-10 w-10 text-slate-300 mx-auto mb-2 animate-pulse" />
              <p className="text-xs text-slate-500 font-semibold">No domains found</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchTerm("");
                  setActiveTab("all");
                }}
                className="mt-2 text-xs text-purple-600 hover:bg-purple-50"
              >
                Reset Search
              </Button>
            </div>
          )}
      </div>

      {/* DEDICATED CARD MANAGER MODAL */}
      <Dialog open={isCardManagerOpen} onOpenChange={setIsCardManagerOpen}>
        <DialogContent className="w-[94vw] max-w-md p-0 overflow-hidden rounded-2xl border-0 shadow-2xl max-h-[90vh] flex flex-col">
          <DialogHeader className="bg-slate-900 text-white p-4 sm:p-6 shrink-0">
            <DialogTitle className="text-base sm:text-lg font-bold flex items-center justify-between">
              <span className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 sm:h-5 sm:w-5 text-purple-400 shrink-0" />
                Saved Payment Methods
              </span>
              <Badge variant="secondary" className="bg-white/10 text-slate-200 text-[10px] sm:text-xs">
                {savedCards.length} Saved {savedCards.length === 1 ? "Card" : "Cards"}
              </Badge>
            </DialogTitle>
            <DialogDescription className="text-slate-300 text-[11px] sm:text-xs mt-1">
              Select your primary card for domain Auto-Pay or save new payment cards.
            </DialogDescription>
          </DialogHeader>

          <div className="p-4 sm:p-6 space-y-4 bg-white max-h-[68vh] overflow-y-auto">
            {/* Saved Cards List */}
            <div className="space-y-2.5">
              <div className="text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider block">
                Your Saved Cards
              </div>

              {savedCards.length === 0 ? (
                <div className="p-6 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                  <CreditCard className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-700">No Payment Cards Saved</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Add a new card below to attach it to your Stripe Customer account.
                  </p>
                </div>
              ) : (
                savedCards.map((card) => {
                  const expired = isCardExpired(card.expMonth, card.expYear);
                  const expiringSoon = isCardExpiringSoon(card.expMonth, card.expYear);

                  return (
                    <div
                      key={card.id}
                      className={`p-3 sm:p-3.5 rounded-xl border flex flex-col xs:flex-row xs:items-center justify-between gap-2.5 transition-all ${expired
                          ? "border-red-200 bg-red-50/40"
                          : card.isPrimary
                            ? "border-emerald-300 bg-emerald-50/40 shadow-2xs"
                            : "border-slate-200 bg-slate-50/50"
                        }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div
                          className={`p-2.5 rounded-lg shrink-0 ${expired
                              ? "bg-red-500 text-white"
                              : card.isPrimary
                                ? "bg-emerald-600 text-white"
                                : "bg-slate-200 text-slate-700"
                            }`}
                        >
                          <CreditCard className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-900 flex flex-wrap items-center gap-1.5">
                            <span>
                              {card.brand.toUpperCase()} ending in {card.last4}
                            </span>
                            {card.isPrimary && (
                              <Badge className="bg-emerald-600 text-white text-[9px] px-1.5 py-0 font-bold shrink-0">
                                Primary Auto-Pay
                              </Badge>
                            )}
                            {expired && (
                              <Badge className="bg-red-600 text-white text-[9px] px-1.5 py-0 font-bold shrink-0">
                                Expired
                              </Badge>
                            )}
                            {!expired && expiringSoon && (
                              <Badge className="bg-amber-500 text-white text-[9px] px-1.5 py-0 font-bold shrink-0">
                                Expiring Soon
                              </Badge>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            Expires {String(card.expMonth).padStart(2, "0")}/{card.expYear} • {card.holderName}
                          </div>
                        </div>
                      </div>

                  <div className="flex items-center space-x-1.5 self-end xs:self-auto">
                    {!card.isPrimary ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleSetPrimaryCard(card.id)}
                        className="h-7 text-[10px] font-bold border-purple-200 text-purple-700 hover:bg-purple-50 rounded-lg px-2"
                      >
                        Set Primary
                      </Button>
                    ) : null}

                    <button
                      type="button"
                      disabled={card.isPrimary || savedCards.length <= 1}
                      onClick={() => handleDeleteCard(card.id)}
                      className={`p-1.5 rounded-lg transition-all ${card.isPrimary || savedCards.length <= 1
                          ? "text-slate-300 cursor-not-allowed"
                          : "text-red-500 hover:bg-red-50 hover:text-red-700"
                        }`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
            </div>

            {/* Add New Card Section */}
            <div className="pt-3 border-t border-slate-100">
              {!isAddingInManager ? (
                <Button
                  type="button"
                  onClick={() => setIsAddingInManager(true)}
                  variant="outline"
                  className="w-full h-10 border-dashed border-purple-300 text-purple-700 hover:bg-purple-50 text-xs font-bold rounded-xl flex items-center justify-center gap-2"
                >
                  <Plus className="h-4 w-4" /> Add New Payment Card
                </Button>
              ) : (
                <div className="p-3.5 sm:p-4 border border-purple-200 bg-purple-50/50 rounded-xl space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-900">
                    <span>Add New Card</span>
                    <button
                      type="button"
                      onClick={() => setIsAddingInManager(false)}
                      className="text-[10px] text-slate-500 hover:text-slate-800"
                    >
                      Cancel
                    </button>
                  </div>

                  <div className="space-y-2">
                    <Input
                      placeholder="Cardholder Name"
                      value={newCardForm.holderName}
                      onChange={(e) =>
                        setNewCardForm({ ...newCardForm, holderName: e.target.value })
                      }
                      className="h-9 text-xs bg-white border-slate-200 rounded-lg"
                    />
                    <Input
                      placeholder="Card Number (4242 4242 4242 4242)"
                      value={newCardForm.number}
                      onChange={(e) =>
                        setNewCardForm({ ...newCardForm, number: e.target.value })
                      }
                      maxLength={19}
                      className="h-9 text-xs bg-white border-slate-200 rounded-lg font-mono"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <Input
                        placeholder="MM"
                        value={newCardForm.expMonth}
                        onChange={(e) =>
                          setNewCardForm({ ...newCardForm, expMonth: e.target.value })
                        }
                        maxLength={2}
                        className="h-9 text-xs bg-white border-slate-200 font-mono text-center"
                      />
                      <Input
                        placeholder="YY"
                        value={newCardForm.expYear}
                        onChange={(e) =>
                          setNewCardForm({ ...newCardForm, expYear: e.target.value })
                        }
                        maxLength={4}
                        className="h-9 text-xs bg-white border-slate-200 font-mono text-center"
                      />
                      <Input
                        placeholder="CVC"
                        type="password"
                        value={newCardForm.cvc}
                        onChange={(e) =>
                          setNewCardForm({ ...newCardForm, cvc: e.target.value })
                        }
                        maxLength={4}
                        className="h-9 text-xs bg-white border-slate-200 font-mono text-center"
                      />
                    </div>

                    <div className="flex items-center space-x-2 pt-1">
                      <input
                        type="checkbox"
                        id="managerSetPrimary"
                        checked={setNewCardAsPrimary}
                        onChange={(e) => setSetNewCardAsPrimary(e.target.checked)}
                        className="rounded border-slate-300 text-purple-600 focus:ring-purple-500 h-3.5 w-3.5"
                      />
                      <label
                        htmlFor="managerSetPrimary"
                        className="text-[11px] font-semibold text-slate-700 cursor-pointer"
                      >
                        Set as Primary Card for Auto-Pay
                      </label>
                    </div>

                    <Button
                      type="button"
                      onClick={() => {
                        handleAddNewCard(setNewCardAsPrimary);
                        setIsAddingInManager(false);
                      }}
                      className="w-full h-9 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-lg mt-2"
                    >
                      Save New Card
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="bg-slate-50 p-3.5 sm:p-4 border-t border-slate-100 shrink-0">
            <Button
              onClick={() => setIsCardManagerOpen(false)}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl h-10"
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DOMAIN RENEWAL CHECKOUT MODAL WITH PAYMENT METHOD SELECTOR & NEW CARD OPTION */}
      <Dialog open={isCheckoutOpen} onOpenChange={setIsCheckoutOpen}>
        <DialogContent className="w-[94vw] max-w-md p-0 overflow-hidden rounded-2xl border-0 shadow-2xl max-h-[90vh] flex flex-col">
          <DialogHeader className="bg-gradient-to-r from-purple-600 via-indigo-600 to-violet-700 text-white p-4 sm:p-6 shrink-0">
            <DialogTitle className="text-lg sm:text-xl font-bold flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Lock className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
                <span>Domain Renewal Checkout</span>
              </span>
              <Badge variant="secondary" className="bg-white/20 text-white text-[10px] sm:text-xs">
                SSL 256-Bit
              </Badge>
            </DialogTitle>
            <DialogDescription className="text-purple-100 text-[11px] sm:text-xs mt-1">
              Review domain renewal fees and select or add your payment card.
            </DialogDescription>
          </DialogHeader>

          <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 bg-white max-h-[68vh] overflow-y-auto">
            {/* Itemized domain list */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                Selected Domains ({checkoutItems.length})
              </label>
              <div className="space-y-3">
                {checkoutItems.map((item) => {
                  const itemTotal = getDomainItemTotal(item);
                  return (
                    <div
                      key={item.id}
                      className="p-3 border border-slate-200/80 rounded-xl bg-slate-50/50 space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-900">{item.fullDomainName}</span>
                        <span className="font-extrabold text-purple-700">
                          ${itemTotal.toFixed(2)}
                        </span>
                      </div>

                      <div className="text-[11px] space-y-1 text-slate-600 pt-1 border-t border-slate-200/60">
                        <div className="flex justify-between">
                          <span>Domain Renewal ({item.periodYears} yr)</span>
                          <span>${(item.renewalPrice * item.periodYears).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-emerald-700 font-medium">
                          <span className="flex items-center gap-1">
                            <Lock className="h-3 w-3" /> Wildcard SSL (Mandatory)
                          </span>
                          <span>${((item.sslPrice || 29) * item.periodYears).toFixed(2)}</span>
                        </div>
                        {item.domainProtectionEnabled && (
                          <div className="flex justify-between text-indigo-700 font-medium">
                            <span className="flex items-center gap-1">
                              <ShieldCheck className="h-3 w-3" /> Domain Protection (Default)
                            </span>
                            <span>
                              ${((item.domainProtectionPrice || 49) * item.periodYears).toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Auto Pay Consent Toggle in Checkout */}
            <div className="p-3.5 bg-purple-50/70 border border-purple-200 rounded-xl flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-purple-600" />
                  <span>Pay once &amp; enable Auto-Pay</span>
                </div>
                <div className="text-[10px] text-slate-500">
                  Automatically renew this domain before future expiration dates.
                </div>
              </div>

              <button
                type="button"
                onClick={() => setAutoPayOnCheckout(!autoPayOnCheckout)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${autoPayOnCheckout ? "bg-purple-600" : "bg-slate-300"
                  }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${autoPayOnCheckout ? "translate-x-5" : "translate-x-0"
                    }`}
                />
              </button>
            </div>

            {/* Payment Method Selector (Select Saved Card OR Add New Card) */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                  Payment Method
                </label>
                <button
                  type="button"
                  onClick={() => setIsAddingNewCardInCheckout(!isAddingNewCardInCheckout)}
                  className="text-xs font-bold text-purple-600 hover:text-purple-800 flex items-center gap-1"
                >
                  {isAddingNewCardInCheckout ? (
                    "← Use Saved Card"
                  ) : (
                    <>
                      <Plus className="h-3.5 w-3.5" /> Add New Card
                    </>
                  )}
                </button>
              </div>

              {!isAddingNewCardInCheckout ? (
                /* Saved Cards List Selector */
                <div className="space-y-2">
                  {savedCards.map((card) => {
                    const isSelected = selectedPaymentMethodId === card.id;
                    return (
                      <div
                        key={card.id}
                        onClick={() => setSelectedPaymentMethodId(card.id)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${isSelected
                            ? "border-purple-600 bg-purple-50/50 shadow-xs"
                            : "border-slate-200 hover:border-slate-300 bg-white"
                          }`}
                      >
                        <div className="flex items-center space-x-3">
                          <div
                            className={`p-2 rounded-lg ${isSelected
                                ? "bg-purple-600 text-white"
                                : "bg-slate-100 text-slate-600"
                              }`}
                          >
                            <CreditCard className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
                              <span>
                                {card.brand.toUpperCase()} ending in {card.last4}
                              </span>
                              {card.isPrimary && (
                                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[9px] px-1.5 py-0 font-bold">
                                  Primary
                                </Badge>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              Expires {String(card.expMonth).padStart(2, "0")}/{card.expYear} • {card.holderName}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2">
                          {!card.isPrimary && isSelected && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSetPrimaryCard(card.id);
                              }}
                              className="text-[10px] font-semibold text-purple-700 bg-purple-100 hover:bg-purple-200 px-2 py-0.5 rounded-md transition-all"
                            >
                              Make Primary
                            </button>
                          )}
                          <div
                            className={`h-4 w-4 rounded-full border flex items-center justify-center ${isSelected
                                ? "border-purple-600 bg-purple-600 text-white"
                                : "border-slate-300"
                              }`}
                          >
                            {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Add New Card Form Inline in Checkout */
                <div className="p-4 border border-purple-200 bg-purple-50/40 rounded-xl space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                    <span className="flex items-center gap-1.5">
                      <CreditCard className="h-4 w-4 text-purple-600" />
                      Add New Card &amp; Pay
                    </span>
                    <Badge variant="outline" className="text-[10px] bg-white border-purple-200 text-purple-700">
                      Stripe 256-Bit SSL
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    <Input
                      placeholder="Cardholder Name"
                      value={newCardForm.holderName}
                      onChange={(e) =>
                        setNewCardForm({ ...newCardForm, holderName: e.target.value })
                      }
                      className="h-9 text-xs bg-white border-slate-200 rounded-lg"
                    />
                    <div className="relative">
                      <Input
                        placeholder="Card Number (4242 4242 4242 4242)"
                        value={newCardForm.number}
                        onChange={(e) =>
                          setNewCardForm({ ...newCardForm, number: e.target.value })
                        }
                        maxLength={19}
                        className="h-9 text-xs bg-white border-slate-200 rounded-lg pr-12 font-mono"
                      />
                      <span className="absolute right-2.5 top-2.5 text-[10px] font-bold text-slate-400 uppercase">
                        {newCardForm.number.startsWith("5") ? "Mastercard" : "Visa"}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <Input
                        placeholder="MM (08)"
                        value={newCardForm.expMonth}
                        onChange={(e) =>
                          setNewCardForm({ ...newCardForm, expMonth: e.target.value })
                        }
                        maxLength={2}
                        className="h-9 text-xs bg-white border-slate-200 rounded-lg font-mono text-center"
                      />
                      <Input
                        placeholder="YY (28)"
                        value={newCardForm.expYear}
                        onChange={(e) =>
                          setNewCardForm({ ...newCardForm, expYear: e.target.value })
                        }
                        maxLength={4}
                        className="h-9 text-xs bg-white border-slate-200 rounded-lg font-mono text-center"
                      />
                      <Input
                        placeholder="CVC (123)"
                        type="password"
                        value={newCardForm.cvc}
                        onChange={(e) =>
                          setNewCardForm({ ...newCardForm, cvc: e.target.value })
                        }
                        maxLength={4}
                        className="h-9 text-xs bg-white border-slate-200 rounded-lg font-mono text-center"
                      />
                    </div>

                    <div className="pt-1 flex items-center justify-between">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={setNewCardAsPrimary}
                          onChange={(e) => setSetNewCardAsPrimary(e.target.checked)}
                          className="rounded border-slate-300 text-purple-600 focus:ring-purple-500 h-3.5 w-3.5"
                        />
                        <span className="text-[11px] font-semibold text-slate-700">
                          Set as Primary Card for Auto-Pay
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Total Cost Summary */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-500 font-medium">Total Amount Due</span>
                <div className="text-2xl font-extrabold text-purple-700">
                  ${checkoutTotalAmount.toFixed(2)}
                </div>
              </div>
              <div className="text-right text-[10px] text-slate-400">
                Includes SSL ($29/yr) &amp; Protection ($49/yr)
              </div>
            </div>
          </div>

          <DialogFooter className="bg-slate-50 p-4 border-t border-slate-100">
            <Button
              variant="outline"
              onClick={() => setIsCheckoutOpen(false)}
              disabled={isProcessingPayment}
              className="border-slate-300 text-slate-600 text-xs rounded-xl h-10"
            >
              Cancel
            </Button>
            <Button
              onClick={processCheckoutPayment}
              disabled={isProcessingPayment}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl h-10 px-6 shadow-md"
            >
              {isProcessingPayment ? (
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Processing Payment...</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4" />
                  <span>Confirm &amp; Pay ${checkoutTotalAmount.toFixed(2)}</span>
                </div>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Streamlined, Ultra-Clean Domain Row
function SimpleDomainRow({
  domain,
  isSelected,
  onToggleSelect,
  onToggleAutoPay,
  onToggleProtection,
  onUpdatePeriod,
  onPayNow,
  getDomainTotal,
}: {
  domain: DomainPaymentInfo;
  isSelected: boolean;
  onToggleSelect: () => void;
  onToggleAutoPay: () => void;
  onToggleProtection: () => void;
  onUpdatePeriod: (years: number) => void;
  onPayNow: () => void;
  getDomainTotal: (item: DomainPaymentInfo) => number;
}) {
  const isUrgent = domain.status === "due";
  const isExpiring = domain.status === "closer_to_due";
  const isHealthy = domain.status === "already_paid";
  const domainTotal = getDomainTotal(domain);

  return (
    <motion.div layout transition={{ duration: 0.15 }}>
      <div
        className={`bg-white rounded-xl p-3 sm:p-4 border transition-all space-y-2.5 ${isUrgent
            ? "border-red-200 hover:border-red-300 shadow-xs"
            : isExpiring
              ? "border-amber-200 hover:border-amber-300 shadow-xs"
              : "border-slate-200/70 hover:border-slate-300"
          }`}
      >
        {/* Main Row Content */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          {/* Left Side: Checkbox + Globe + Name + Status Badge + Date */}
          <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0 flex-1">
            {!isHealthy && (
              <button
                onClick={onToggleSelect}
                className={`flex items-center justify-center h-4 w-4 rounded border transition-all shrink-0 ${isSelected
                    ? "bg-purple-600 border-purple-600 text-white"
                    : "border-slate-300 bg-white hover:border-purple-400"
                  }`}
              >
                {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
              </button>
            )}

            <Globe className="h-4 w-4 text-purple-600 shrink-0" />

            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
              <span className="text-xs sm:text-sm font-bold text-slate-900 truncate max-w-[140px] xs:max-w-[200px] sm:max-w-none">
                {domain.fullDomainName}
              </span>

              {/* Badges: Urgent, Expiring Soon, Healthy */}
              {isUrgent && (
                <Badge className="bg-red-600 text-white text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0 font-semibold shrink-0">
                  Urgent
                </Badge>
              )}
              {isExpiring && (
                <Badge className="bg-amber-500 text-white text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0 font-semibold shrink-0">
                  Expiring Soon
                </Badge>
              )}
              {isHealthy && (
                <Badge className="bg-emerald-600 text-white text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0 font-semibold shrink-0">
                  Healthy
                </Badge>
              )}

              <span className="text-[10px] sm:text-xs text-slate-400 shrink-0">
                Renews: <strong className="text-slate-600 font-medium">{domain.dueDate}</strong>
              </span>
            </div>
          </div>

          {/* Right Side: Year Selectors + Price + Auto-Pay + Pay Now */}
          <div className="flex flex-wrap sm:flex-nowrap items-center justify-between sm:justify-end gap-2.5 sm:gap-3 shrink-0 border-t xl:border-t-0 pt-2.5 xl:pt-0 border-slate-100/80 w-full xl:w-auto">
            {/* Year selector */}
            {!isHealthy && (
              <div className="flex items-center space-x-0.5 sm:space-x-1 bg-slate-100 p-0.5 rounded-lg text-[10px] sm:text-[11px] shrink-0">
                {[1, 2, 3].map((yr) => (
                  <button
                    key={yr}
                    onClick={() => onUpdatePeriod(yr)}
                    className={`px-1.5 sm:px-2 py-0.5 rounded-md font-semibold transition-all ${domain.periodYears === yr
                        ? "bg-white text-purple-700 shadow-2xs"
                        : "text-slate-500 hover:text-slate-800"
                      }`}
                  >
                    {yr} {yr === 1 ? "Yr" : "Yrs"}
                  </button>
                ))}
              </div>
            )}

            {/* Price Total */}
            <div className="text-right shrink-0">
              <span className="text-xs sm:text-sm font-extrabold text-slate-900">
                ${domainTotal.toFixed(2)}
              </span>
              <span className="text-[9px] sm:text-[10px] text-slate-400 block">
                /{domain.periodYears}yr total
              </span>
            </div>

            {/* Auto-Pay Switch with card method label */}
            <div className="flex items-center space-x-1.5 pl-1 border-l border-slate-100 shrink-0">
              <div className="text-[9px] sm:text-[10px] font-bold text-slate-500 flex flex-col items-end">
                <span>Auto-Pay</span>
                {domain.autoPayEnabled && domain.autoPayMethod && (
                  <span className="text-[8px] sm:text-[9px] font-semibold text-emerald-600">
                    {domain.autoPayMethod}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={onToggleAutoPay}
                className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-1 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${domain.autoPayEnabled ? "bg-emerald-500" : "bg-slate-300"
                  }`}
              >
                <span
                  className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-2xs ring-0 transition duration-200 ease-in-out ${domain.autoPayEnabled ? "translate-x-3" : "translate-x-0"
                    }`}
                />
              </button>
            </div>

            {/* Pay Now button */}
            <div className="shrink-0">
              {!isHealthy ? (
                <Button
                  onClick={onPayNow}
                  size="sm"
                  className={`text-xs font-bold rounded-lg px-2.5 sm:px-3 py-1 h-8 transition-all ${isUrgent
                      ? "bg-red-600 hover:bg-red-700 text-white"
                      : "bg-purple-600 hover:bg-purple-700 text-white"
                    }`}
                >
                  Pay Now
                </Button>
              ) : (
                <span className="text-[10px] sm:text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Active
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Addons Bar */}
        <div className="pt-2 flex flex-col lg:flex-row border-t border-slate-100/80 flex flex-col xs:flex-row items-stretch xs:items-center justify-between gap-2 text-[10px] sm:text-[11px]">
          {/* Wildcard SSL */}
          <div className="flex items-center space-x-1.5 bg-emerald-50/70 border border-emerald-200 text-emerald-800 px-2.5 py-1 rounded-lg font-medium justify-between xs:justify-start">
            <div className="flex items-center space-x-1.5">
              <Lock className="h-3 w-3 text-emerald-600 shrink-0" />
              <span>Wildcard SSL Certificate</span>
            </div>
            <span className="font-bold text-emerald-700 ml-1">+$29/yr</span>
          </div>

          {/* Domain Protection */}
          {!isHealthy ? (
            <button
              onClick={onToggleProtection}
              className={`flex items-center justify-between xs:justify-start space-x-1.5 px-2.5 py-1 rounded-lg border font-medium transition-all ${domain.domainProtectionEnabled
                  ? "bg-indigo-50/70 border-indigo-200 text-indigo-900 shadow-2xs"
                  : "bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100"
                }`}
            >
              <div className="flex items-center space-x-1.5">
                <ShieldCheck className={`h-3 w-3 ${domain.domainProtectionEnabled ? "text-indigo-600" : "text-slate-400"} shrink-0`} />
                <span>Domain Protection</span>
              </div>
              <span className={`font-bold ml-1 ${domain.domainProtectionEnabled ? "text-indigo-700" : "text-slate-400"}`}>
                +$49/yr
              </span>
            </button>
          ) : (
            <div className="flex items-center space-x-1 text-slate-400 text-[10px]">
              <ShieldCheck className="h-3 w-3 text-emerald-600 shrink-0" />
              <span>Domain Protection ($49/yr Active)</span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
