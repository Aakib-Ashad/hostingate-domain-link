"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Globe,
  Mail,
  Users,
  CreditCard,
  Minus,
  Plus,
  ChevronRight,
  Search,
  Inbox
} from "lucide-react";
import { DomainInfo } from "@/lib/utils";

const MAILBOX_PRICE = 3.99;

interface DomainMailboxProps {
  domains: DomainInfo[];
  onTotalChange?: (total: number, mailboxes: DomainMailboxConfig[]) => void;
  onConfigurationChange?: (configs: DomainMailboxConfig[]) => void;
}

export interface DomainMailboxConfig {
  id: string;
  domain: string;
  type: "main" | "admin" | "db";
  mailboxCount: number;
}

export default function DomainMailboxPricing({
  domains,
  onTotalChange,
  onConfigurationChange,
}: DomainMailboxProps) {
  const [mailboxConfigs, setMailboxConfigs] = useState<DomainMailboxConfig[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [mailboxSearch, setMailboxSearch] = useState<string>("");

  useEffect(() => {
    if (domains?.length > 0) {
      const mainDomains = domains.filter(
        (domainInfo) => domainInfo.type === "main"
      );

      const initialConfigs: DomainMailboxConfig[] = mainDomains.map(
        (domainInfo) => ({
          id: domainInfo.domain,
          domain: domainInfo.domain,
          type: domainInfo.type,
          mailboxCount: domainInfo.mailboxCount || 0,
        })
      );
      setMailboxConfigs(initialConfigs);
      if (initialConfigs.length > 0) {
        setSelectedConfigId(initialConfigs[0].id);
      }
    } else {
      setMailboxConfigs([]);
      setSelectedConfigId(null);
    }
  }, [domains]);

  useEffect(() => {
    setMailboxSearch("");
  }, [selectedConfigId]);

  const updateMailboxConfig = (
    id: string,
    updates: Partial<DomainMailboxConfig>
  ) => {
    setMailboxConfigs((prev) =>
      prev.map((config) =>
        config.id === id ? { ...config, ...updates } : config
      )
    );
  };

  const updateMailboxCount = (id: string, count: number) => {
    const config = mailboxConfigs.find((c) => c.id === id);
    if (!config) return;
    const initialCount = domains.find((d) => d.domain === config.domain)?.mailboxCount || 0;
    const safeCount = Math.max(initialCount, Math.min(100, count));
    updateMailboxConfig(id, { mailboxCount: safeCount });
  };

  const calculateDomainTotal = (config: DomainMailboxConfig): number => {
    return config.mailboxCount * MAILBOX_PRICE;
  };

  const calculateGrandTotal = (): number => {
    return mailboxConfigs.reduce(
      (total, config) => total + calculateDomainTotal(config),
      0
    );
  };

  const calculateTotalMailboxes = (): number => {
    return mailboxConfigs.reduce(
      (total, config) => total + config.mailboxCount,
      0
    );
  };

  const getExistingMailboxes = (domain: string): string[] => {
    const domainInfo = domains.find((d) => d.domain === domain);
    return domainInfo?.mailboxes || [];
  };

  const hasExistingMailboxes = (domain: string): boolean => {
    return getExistingMailboxes(domain).length > 0;
  };

  useEffect(() => {
    if (onTotalChange) {
      onTotalChange(calculateGrandTotal(), mailboxConfigs);
    }
    if (onConfigurationChange) {
      onConfigurationChange(mailboxConfigs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mailboxConfigs, onTotalChange, onConfigurationChange]);

  if (!domains || domains.length === 0 || mailboxConfigs.length === 0) {
    return null;
  }

  const selectedConfig =
    mailboxConfigs.find((config) => config.id === selectedConfigId) ||
    mailboxConfigs[0];

  const initialMailboxCount = selectedConfig
    ? domains.find((d) => d.domain === selectedConfig.domain)?.mailboxCount || 0
    : 0;

  const existingMailboxes = getExistingMailboxes(selectedConfig.domain);
  const filteredMailboxes = existingMailboxes.filter((email) =>
    email.toLowerCase().includes(mailboxSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card className="border-2 border-purple-200 bg-gradient-to-r from-purple-50 to-violet-50">
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between px-4 gap-4">
            <div className="flex items-center space-x-4">
              <div className="flex items-center justify-center w-12 h-12 bg-purple-100 rounded-xl">
                <Mail className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-800">Email Mailboxes</h2>
                <p className="text-slate-600 text-sm">Professional email addresses for your projects</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-6">
              <div className="text-center sm:text-left">
                <div className="flex items-center justify-center sm:justify-start space-x-2">
                  <Users className="h-4 w-4 text-blue-500" />
                  <span className="text-2xl font-bold text-blue-600">
                    {calculateTotalMailboxes()}
                  </span>
                </div>
                <div className="text-xs text-slate-500 font-medium mt-1">Total Mailboxes</div>
              </div>
              <div className="text-center sm:text-left">
                <div className="flex items-center justify-center sm:justify-start space-x-2">
                  <CreditCard className="h-4 w-4 text-green-500" />
                  <span className="text-2xl font-bold text-green-600">
                    ${calculateGrandTotal().toFixed(2)}
                  </span>
                </div>
                <div className="text-xs text-slate-500 font-medium mt-1">Monthly Cost</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Split Layout */}
      <Card className="border border-slate-200 shadow-md overflow-hidden bg-white rounded-2xl">
        <div className="grid grid-cols-1 md:grid-cols-12 min-h-[620px]">
          {/* Sidebar / Left Column */}
          <div className="col-span-12 md:col-span-4 bg-slate-50/60 p-2 md:border-r mt-8 border-b md:border-b-0 border-slate-100 flex flex-col gap-4">
            {/* Mobile Header */}
            <div className="flex md:hidden items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Select Project
              </span>
              <span className="text-xs text-purple-600 font-semibold">
                {mailboxConfigs.length} total
              </span>
            </div>

            {/* Mobile Horizontal Selector */}
            <div className="flex md:hidden overflow-x-auto pb-1 gap-2 scrollbar-none snap-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {mailboxConfigs.map((config) => {
                const isSelected = config.id === selectedConfigId;
                return (
                  <button
                    key={config.id}
                    onClick={() => setSelectedConfigId(config.id)}
                    className={`flex-shrink-0 snap-start px-3.5 py-2 rounded-xl border text-xs font-semibold transition-all flex items-center space-x-1.5 ${
                      isSelected
                        ? "border-purple-600 bg-purple-600 text-white shadow-sm"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <Globe className={`h-3.5 w-3.5 ${isSelected ? "text-white" : "text-slate-400"}`} />
                    <span>{config.domain}</span>
                    {config.mailboxCount > 0 && (
                      <span
                        className={`px-1.5 py-0.5 text-[10px] rounded-full ${
                          isSelected ? "bg-purple-700 text-white" : "bg-purple-100 text-purple-700"
                        }`}
                      >
                        {config.mailboxCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Desktop Vertical Sidebar */}
            <div className="hidden md:flex flex-col space-y-1 max-h-[560px] overflow-y-auto pr-1">
              <div className="px-2 mb-2 sticky top-0 bg-slate-50/60">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Projects ({mailboxConfigs.length})
                </span>
              </div>
              {mailboxConfigs.map((config) => {
                const isSelected = config.id === selectedConfigId;
                const hasActiveMailboxes = config.mailboxCount > 0;
                return (
                  <button
                    key={config.id}
                    onClick={() => setSelectedConfigId(config.id)}
                    className={`group flex items-center justify-between p-2.5 rounded-xl border text-left text-sm font-medium transition-all ${
                      isSelected
                        ? "border-purple-200 bg-purple-50/70 text-purple-950 shadow-sm font-semibold"
                        : "border-transparent bg-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div
                        className={`p-1.5 rounded-lg border transition-all ${
                          isSelected
                            ? "bg-purple-100 border-purple-200 text-purple-700"
                            : "bg-white border-slate-200 text-slate-400 group-hover:border-slate-300 group-hover:text-slate-600"
                        }`}
                      >
                        <Globe className="h-3.5 w-3.5" />
                      </div>
                      <span className="truncate pr-1 text-xs">{config.domain}</span>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      {hasActiveMailboxes && (
                        <span
                          className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${
                            isSelected ? "bg-purple-600 text-white" : "bg-purple-100 text-purple-700"
                          }`}
                        >
                          {config.mailboxCount}
                        </span>
                      )}
                      <ChevronRight
                        className={`h-3.5 w-3.5 text-slate-400 transition-transform ${
                          isSelected ? "translate-x-0.5 text-purple-500" : "opacity-0 group-hover:opacity-100"
                        }`}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Details / Right Column */}
          <div className="col-span-12 md:col-span-8 p-6 flex flex-col justify-between space-y-6 ">
            {selectedConfig ? (
              <div className="space-y-6 flex-1 flex flex-col justify-between">
                <div className="space-y-6">
                  {/* Detail Header */}
                  <div className="flex items-start justify-between pb-4 border-b border-slate-100">
                    <div>
                      <div className="flex items-center space-x-2">
                        <Globe className="h-4 w-4 text-purple-600" />
                        <h3 className="text-base font-bold text-slate-800">
                          {selectedConfig.domain}
                        </h3>
                        <Badge variant="secondary" className="bg-purple-50 text-purple-600 text-[10px] px-1.5 py-0">
                          {selectedConfig.type === "main" ? "Main" : selectedConfig.type}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Configure custom email addresses and view existing setup.
                      </p>
                    </div>

                    <div className="text-right">
                      <div className="text-[10px] text-slate-500">Subtotal</div>
                      <div className="text-sm font-bold text-purple-600 mt-0.5">
                        ${(selectedConfig.mailboxCount * MAILBOX_PRICE).toFixed(2)}/mo
                      </div>
                    </div>
                  </div>

                  {/* Mailbox Count Control Panel */}
                  <div className="p-4 bg-purple-50/50 border border-purple-100 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700 block">
                        Configure Mailboxes
                      </label>
                      <span className="text-[11px] text-slate-500">
                        Select the number of email mailboxes needed.
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Custom interactive counter */}
                      <div className="flex items-center space-x-2 bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-500 hover:text-purple-600 hover:bg-purple-50 disabled:opacity-50"
                          disabled={selectedConfig.mailboxCount <= initialMailboxCount}
                          onClick={() => updateMailboxCount(selectedConfig.id, selectedConfig.mailboxCount - 1)}
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </Button>

                        <input
                          type="number"
                          min={initialMailboxCount}
                          max="100"
                          value={selectedConfig.mailboxCount === 0 ? "" : selectedConfig.mailboxCount}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === "") {
                              updateMailboxConfig(selectedConfig.id, { mailboxCount: initialMailboxCount });
                            } else {
                              const parsed = parseInt(val, 10);
                              if (!isNaN(parsed)) {
                                updateMailboxConfig(selectedConfig.id, {
                                  mailboxCount: Math.max(initialMailboxCount, Math.min(100, parsed)),
                                });
                              }
                            }
                          }}
                          placeholder="0"
                          className="w-12 text-center font-bold text-slate-800 focus:outline-none text-sm bg-transparent border-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-500 hover:text-purple-600 hover:bg-purple-50"
                          onClick={() => updateMailboxCount(selectedConfig.id, selectedConfig.mailboxCount + 1)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      <div className="text-xs font-semibold text-slate-600 min-w-[70px] text-right">
                        {selectedConfig.mailboxCount} x ${MAILBOX_PRICE}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Existing Mailboxes Section */}
                <div className="space-y-3 pt-4 border-t border-slate-100 flex-1">
                  {hasExistingMailboxes(selectedConfig.domain) ? (
                    <div className="space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                          <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                            <Mail className="h-3.5 w-3.5 text-slate-400" />
                            <span>Existing Mailboxes ({existingMailboxes.length})</span>
                          </h4>
                        </div>

                        {existingMailboxes.length > 2 && (
                          <div className="relative">
                            <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-slate-400" />
                            <input
                              type="text"
                              placeholder="Search..."
                              value={mailboxSearch}
                              onChange={(e) => setMailboxSearch(e.target.value)}
                              className="w-full sm:w-44 pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white"
                            />
                          </div>
                        )}
                      </div>

                      <div className="max-h-[330px] overflow-y-auto pr-1 border border-slate-100 rounded-xl p-2 bg-slate-50/20">
                        {filteredMailboxes.length > 0 ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {filteredMailboxes.map((mailbox, index) => (
                              <div
                                key={index}
                                className="flex items-center justify-between px-3 py-2 bg-white border border-slate-200/60 rounded-lg hover:border-purple-200 transition-colors shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
                              >
                                <span className="text-[11px] font-mono text-slate-600 truncate mr-2">
                                  {mailbox}
                                </span>
                                <span className="h-1.5 w-1.5 bg-green-500 rounded-full shrink-0" title="Active"></span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-8">
                            <p className="text-xs text-slate-400">
                              No mailboxes match &quot;{mailboxSearch}&quot;
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 bg-slate-50/50 border border-dashed border-slate-200 rounded-xl text-center h-full flex flex-col justify-center items-center">
                      <Inbox className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-xs font-semibold text-slate-500">No existing mailboxes setup</p>
                      <p className="text-[10px] text-slate-400 mt-1">
                        Add mailboxes using the configuration controls above.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
                <Globe className="h-12 w-12 text-slate-200 mb-3 animate-pulse" />
                <h3 className="text-sm font-semibold text-slate-500">Select a project</h3>
                <p className="text-xs text-slate-400 mt-1">Select a domain from the left to configure mailboxes.</p>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
