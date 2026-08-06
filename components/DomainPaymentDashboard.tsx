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
  ShieldAlert,
} from "lucide-react";
import { domainPaymentItems, DomainPaymentInfo } from "@/lib/utils";
import { toast } from "sonner";
import { motion } from "framer-motion";

export default function DomainPaymentDashboard() {
  const [domainsList, setDomainsList] = useState<DomainPaymentInfo[]>(domainPaymentItems);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "urgent" | "expiring" | "healthy">("all");
  const [selectedDomainIds, setSelectedDomainIds] = useState<string[]>([]);

  // Checkout Modal State (preserved fully)
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [checkoutTarget, setCheckoutTarget] = useState<"single" | "bulk">("single");
  const [singleCheckoutDomain, setSingleCheckoutDomain] = useState<DomainPaymentInfo | null>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [autoPayOnCheckout, setAutoPayOnCheckout] = useState(true);

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
    setIsCheckoutOpen(true);
  };

  // Toggle Auto-Pay per domain
  const toggleAutoPay = (id: string, domainName: string) => {
    setDomainsList((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const nextState = !item.autoPayEnabled;
          toast.success(
            nextState
              ? `Auto-Pay Enabled for ${domainName}`
              : `Auto-Pay Disabled for ${domainName}`,
            {
              description: nextState
                ? "Future renewals will automatically charge your payment method on file."
                : "Manual payment will be required prior to expiration.",
            }
          );
          return {
            ...item,
            autoPayEnabled: nextState,
            autoPayMethod: nextState ? item.autoPayMethod || "•••• 4242" : undefined,
          };
        }
        return item;
      })
    );
  };

  // Toggle Domain Protection ($49 optional) per domain
  const toggleDomainProtection = (id: string, domainName: string) => {
    setDomainsList((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const nextState = !item.domainProtectionEnabled;
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
          return { ...item, domainProtectionEnabled: nextState };
        }
        return item;
      })
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
  const processCheckoutPayment = () => {
    setIsProcessingPayment(true);
    setTimeout(() => {
      setIsProcessingPayment(false);
      setIsCheckoutOpen(false);

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
              autoPayMethod: autoPayOnCheckout
                ? item.autoPayMethod || "•••• 4242"
                : item.autoPayMethod,
              lastPaymentDate: new Date().toISOString().split("T")[0],
            };
          }
          return item;
        })
      );

      setSelectedDomainIds((prev) => prev.filter((id) => !paidIds.includes(id)));

      toast.success("Payment Processed Successfully!", {
        description: `Renewed ${checkoutItems.length} domain(s). Total Paid: $${checkoutTotalAmount.toFixed(
          2
        )}`,
      });
    }, 1200);
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
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Sleek Minimal Header Bar */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left: Search Bar */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
          <Input
            type="text"
            placeholder="Search domain..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-10 border-slate-200 rounded-xl bg-slate-50 text-xs focus:bg-white transition-all"
          />
        </div>

        {/* Middle: Filter Tabs (Urgent, Expiring Soon, Healthy) */}
        <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl text-xs font-medium">
          <button
            onClick={() => setActiveTab("all")}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === "all"
                ? "bg-white text-slate-900 font-bold shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            All ({domainsList.length})
          </button>
          <button
            onClick={() => setActiveTab("urgent")}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === "urgent"
                ? "bg-red-600 text-white font-bold shadow-sm"
                : "text-red-600 hover:bg-red-50"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
            Urgent ({urgentDomains.length})
          </button>
          <button
            onClick={() => setActiveTab("expiring")}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === "expiring"
                ? "bg-amber-500 text-white font-bold shadow-sm"
                : "text-amber-700 hover:bg-amber-50"
            }`}
          >
            Expiring Soon ({expiringDomains.length})
          </button>
          <button
            onClick={() => setActiveTab("healthy")}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === "healthy"
                ? "bg-emerald-600 text-white font-bold shadow-sm"
                : "text-emerald-700 hover:bg-emerald-50"
            }`}
          >
            Healthy ({healthyDomains.length})
          </button>
        </div>

        {/* Right: Primary Action "Pay All Due" */}
        <div className="flex items-center gap-2">
          {selectedDomainIds.length > 0 && (
            <Button
              onClick={openSelectedPayment}
              variant="outline"
              size="sm"
              className="border-purple-200 text-purple-700 hover:bg-purple-50 text-xs font-semibold rounded-xl h-10 px-3"
            >
              Pay Selected ({selectedDomainIds.length})
            </Button>
          )}
          <Button
            onClick={handlePayAllDue}
            disabled={urgentDomains.length === 0 && expiringDomains.length === 0}
            className="bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-bold text-xs rounded-xl h-10 px-5 shadow-md flex items-center gap-2"
          >
            <CreditCard className="h-4 w-4" />
            <span>Pay All Due (${(urgentTotalCost + expiringTotalCost).toFixed(2)})</span>
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

      {/* DOMAIN RENEWAL CHECKOUT MODAL WITH ADDONS BREAKDOWN */}
      <Dialog open={isCheckoutOpen} onOpenChange={setIsCheckoutOpen}>
        <DialogContent className="max-w-md p-0 overflow-hidden rounded-2xl border-0 shadow-2xl">
          <DialogHeader className="bg-gradient-to-r from-purple-600 via-indigo-600 to-violet-700 text-white p-6">
            <DialogTitle className="text-xl font-bold flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Domain Renewal Checkout
              </span>
              <Badge variant="secondary" className="bg-white/20 text-white text-xs">
                SSL 256-Bit
              </Badge>
            </DialogTitle>
            <DialogDescription className="text-purple-100 text-xs mt-1">
              Review domain renewal fees and included security protections.
            </DialogDescription>
          </DialogHeader>

          <div className="p-6 space-y-5 bg-white max-h-[75vh] overflow-y-auto">
            {/* Itemized list */}
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
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  autoPayOnCheckout ? "bg-purple-600" : "bg-slate-300"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    autoPayOnCheckout ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Payment Method Preview */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                Payment Method
              </label>
              <div className="p-3 border border-slate-200 rounded-xl flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
                    <CreditCard className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-800">
                      Visa ending in 4242
                    </div>
                    <div className="text-[10px] text-slate-500">Expires 08/2028</div>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] border-emerald-300 bg-emerald-50 text-emerald-700">
                  Primary
                </Badge>
              </div>
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
                  <span>Processing...</span>
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
        className={`bg-white rounded-xl p-3.5 sm:p-4 border transition-all space-y-2.5 ${
          isUrgent
            ? "border-red-200 hover:border-red-300 shadow-sm"
            : isExpiring
            ? "border-amber-200 hover:border-amber-300 shadow-sm"
            : "border-slate-200/70 hover:border-slate-300"
        }`}
      >
        {/* Main Row Content */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Left Side: Checkbox + Globe + Name + Status Badge + Date */}
          <div className="flex items-center space-x-3 min-w-0">
            {!isHealthy && (
              <button
                onClick={onToggleSelect}
                className={`flex items-center justify-center h-4 w-4 rounded border transition-all shrink-0 ${
                  isSelected
                    ? "bg-purple-600 border-purple-600 text-white"
                    : "border-slate-300 bg-white hover:border-purple-400"
                }`}
              >
                {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
              </button>
            )}

            <Globe className="h-4 w-4 text-purple-600 shrink-0" />

            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span className="text-sm font-bold text-slate-900 truncate">
                {domain.fullDomainName}
              </span>

              {/* Badges: Urgent, Expiring Soon, Healthy */}
              {isUrgent && (
                <Badge className="bg-red-600 text-white text-[10px] px-2 py-0 font-semibold">
                  Urgent
                </Badge>
              )}
              {isExpiring && (
                <Badge className="bg-amber-500 text-white text-[10px] px-2 py-0 font-semibold">
                  Expiring Soon
                </Badge>
              )}
              {isHealthy && (
                <Badge className="bg-emerald-600 text-white text-[10px] px-2 py-0 font-semibold">
                  Healthy
                </Badge>
              )}

              <span className="text-xs text-slate-400">
                Renews: <strong className="text-slate-600 font-medium">{domain.dueDate}</strong>
              </span>
            </div>
          </div>

          {/* Right Side: Year Selectors (1 Yr, 2 Yrs, 3 Yrs) + Price + Auto-Pay + Pay Now */}
          <div className="flex items-center gap-3 shrink-0 justify-between sm:justify-end border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
            {/* Year selector: (1 Yr, 2 Yrs, 3 Yrs) */}
            {!isHealthy && (
              <div className="flex items-center space-x-1 bg-slate-100 p-0.5 rounded-lg text-[11px]">
                {[1, 2, 3].map((yr) => (
                  <button
                    key={yr}
                    onClick={() => onUpdatePeriod(yr)}
                    className={`px-2 py-0.5 rounded-md font-semibold transition-all ${
                      domain.periodYears === yr
                        ? "bg-white text-purple-700 shadow-xs"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {yr} {yr === 1 ? "Yr" : "Yrs"}
                  </button>
                ))}
              </div>
            )}

            {/* Price Total */}
            <div className="text-right">
              <span className="text-xs font-extrabold text-slate-900">
                ${domainTotal.toFixed(2)}
              </span>
              <span className="text-[10px] text-slate-400 block">
                /{domain.periodYears}yr total
              </span>
            </div>

            {/* Auto-Pay Switch */}
            <div className="flex items-center space-x-1.5 pl-1 border-l border-slate-100">
              <span className="text-[10px] font-bold text-slate-500">Auto-Pay</span>
              <button
                type="button"
                onClick={onToggleAutoPay}
                className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-1 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  domain.autoPayEnabled ? "bg-emerald-500" : "bg-slate-300"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    domain.autoPayEnabled ? "translate-x-3" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Pay Now button */}
            <div>
              {!isHealthy ? (
                <Button
                  onClick={onPayNow}
                  size="sm"
                  className={`text-xs font-bold rounded-lg px-3 py-1 h-8 transition-all ${
                    isUrgent
                      ? "bg-red-600 hover:bg-red-700 text-white"
                      : "bg-purple-600 hover:bg-purple-700 text-white"
                  }`}
                >
                  Pay Now
                </Button>
              ) : (
                <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Active
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Addons Bar: Wildcard SSL ($29 mandatory) & Domain Protection ($49 optional default) */}
        <div className="pt-2 border-t border-slate-100/80 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          {/* Wildcard SSL (Mandatory $29/yr) */}
          <div className="flex items-center space-x-1.5 bg-emerald-50/70 border border-emerald-200 text-emerald-800 px-2.5 py-1 rounded-lg font-medium">
            <Lock className="h-3 w-3 text-emerald-600" />
            <span>Wildcard SSL Certificate</span>
            <span className="font-bold text-emerald-700">+$29/yr</span>
          </div>

          {/* Domain Protection (Optional Default $49/yr) */}
          {!isHealthy ? (
            <button
              onClick={onToggleProtection}
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border font-medium transition-all ${
                domain.domainProtectionEnabled
                  ? "bg-indigo-50/70 border-indigo-200 text-indigo-900 shadow-xs"
                  : "bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100"
              }`}
            >
              <ShieldCheck className={`h-3 w-3 ${domain.domainProtectionEnabled ? "text-indigo-600" : "text-slate-400"}`} />
              <span>Domain Protection</span>
              <span className={`font-bold ${domain.domainProtectionEnabled ? "text-indigo-700" : "text-slate-400"}`}>
                +$49/yr
              </span>
            </button>
          ) : (
            <div className="flex items-center space-x-1 text-slate-400 text-[10px]">
              <ShieldCheck className="h-3 w-3 text-emerald-600" />
              <span>Domain Protection ($49/yr Active)</span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
