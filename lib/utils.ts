import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface ServiceItem {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  price: number;
  features?: string[];
  priceUnit: string;
  defaultValue: string;
  type: "select" | "toggle" | "counter";
  options?: { value: string; label: string; price?: number }[];
  counterValue?: number;
  optional?: boolean;
}

export type PackageKey = "vercel" | "supabase" | "seo" | "ai";

// Define options for SEO and AI outside the component to avoid repetition
export const seoOptions = [
  {
    value: "1",
    label: "Starter Boost",
    price: 249.99,
    features: [
      "5x Email Campaigns 500+ emails/week",
      "Up to 10,000 visitors every week",
      "SEO, PPC, and research tools: Meta Ads, Competitor analysis, keyword research, website audit, backlink analysis, advertising tools, and more",
    ],
  },
  {
    value: "2",
    label: "Market Dominator",
    price: 1449.99,
    features: [
      "Unlimited Download",
      "30x Email Campaigns 50000+ emails/week",
      "Up to 50,000 visitors every week",
      "All Guru features plus: Share of Voice, extended limits, API access, PLA analytics, free migration from third-party tools, and more",
    ],
  },
];

export const aiOptions = [
  { value: "39.99", label: "100 Credits", price: 39.99 },
  { value: "69.99", label: "200 Credits", price: 69.99 },
  { value: "106.99", label: "500 Credits", price: 106.99 },
  { value: "176.99", label: "1000 Credits", price: 176.99 },
  { value: "279.99", label: "2000 Credits", price: 279.99 },
];

export interface WebsiteConfig {
  id: string;
  domain: string;
  type: "main" | "admin" | "db";
  vercelMonths: number;
  supabaseMonths: number;
  fixerMonths: number;
  resendMonths: number;
  vercelEnabled: boolean;
  supabaseEnabled: boolean;
  resendEnabled: boolean;
  fixerEnabled: boolean;
}

export interface DomainInfo {
  domain: string;
  type: "main" | "admin" | "db";
  vercel: boolean;
  supabase: boolean;
  resend: boolean;
  fixer: boolean;
  mailboxCount?: number;
  mailboxes?: string[];
}

export interface PaymentMethodItem {
  id: string;
  brand: "visa" | "mastercard" | "amex" | "discover";
  last4: string;
  expMonth: number;
  expYear: number;
  isPrimary: boolean;
  holderName?: string;
}

export const initialPaymentMethods: PaymentMethodItem[] = [];

/**
 * Helper function to check if a card is expired
 */
export function isCardExpired(expMonth: number, expYear: number): boolean {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-indexed (Jan = 1)

  if (expYear < currentYear) return true;
  if (expYear === currentYear && expMonth < currentMonth) return true;
  return false;
}

/**
 * Helper function to check if a card is expiring within 30 days
 */
export function isCardExpiringSoon(expMonth: number, expYear: number): boolean {
  if (isCardExpired(expMonth, expYear)) return false;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  if (expYear === currentYear && expMonth === currentMonth) return true;
  return false;
}

export interface DomainPaymentInfo extends DomainInfo {
  id: string;
  fullDomainName: string;
  dueDate: string;
  daysRemaining: number;
  renewalPrice: number;
  status: "due" | "closer_to_due" | "already_paid";
  autoPayEnabled: boolean;
  autoPayMethod?: string;
  periodYears: number;
  lastPaymentDate?: string;
  sslPrice: number; // $29 (mandatory, cannot disable)
  domainProtectionEnabled: boolean; // default true (optional)
  domainProtectionPrice: number; // $49
  toaEnabled: boolean; // default true (optional $500 Total Ownership Assurance)
  toaPrice: number; // $500
}

export const domainPaymentItems: DomainPaymentInfo[] = [
  {
    id: "dom-1",
    domain: "sckali",
    fullDomainName: "sckali.com",
    type: "main",
    vercel: true,
    supabase: false,
    resend: true,
    fixer: true,
    dueDate: "2026-08-06",
    daysRemaining: 0,
    renewalPrice: 19.99,
    status: "due",
    autoPayEnabled: false,
    periodYears: 1,
    sslPrice: 29,
    domainProtectionEnabled: true,
    domainProtectionPrice: 49,
    toaEnabled: true,
    toaPrice: 500,
  },
  {
    id: "dom-2",
    domain: "ckalikids",
    fullDomainName: "ckalikids.com",
    type: "main",
    vercel: true,
    supabase: false,
    resend: true,
    fixer: true,
    dueDate: "2026-08-04",
    daysRemaining: -2,
    renewalPrice: 14.99,
    status: "due",
    autoPayEnabled: false,
    periodYears: 1,
    sslPrice: 29,
    domainProtectionEnabled: true,
    domainProtectionPrice: 49,
    toaEnabled: true,
    toaPrice: 500,
  },
  {
    id: "dom-3",
    domain: "sckaligroup",
    fullDomainName: "sckaligroup.com",
    type: "main",
    vercel: true,
    supabase: false,
    resend: true,
    fixer: true,
    dueDate: "2026-08-14",
    daysRemaining: 8,
    renewalPrice: 24.99,
    status: "closer_to_due",
    autoPayEnabled: false,
    periodYears: 1,
    sslPrice: 29,
    domainProtectionEnabled: true,
    domainProtectionPrice: 49,
    toaEnabled: true,
    toaPrice: 500,
  },
  {
    id: "dom-4",
    domain: "hertzgroup.qa",
    fullDomainName: "hertzgroup.qa",
    type: "main",
    vercel: true,
    supabase: false,
    resend: true,
    fixer: true,
    dueDate: "2026-08-20",
    daysRemaining: 14,
    renewalPrice: 39.99,
    status: "closer_to_due",
    autoPayEnabled: false,
    periodYears: 1,
    sslPrice: 29,
    domainProtectionEnabled: true,
    domainProtectionPrice: 49,
    toaEnabled: true,
    toaPrice: 500,
  },
  {
    id: "dom-5",
    domain: "gronos",
    fullDomainName: "gronos.com",
    type: "main",
    vercel: true,
    supabase: true,
    resend: true,
    fixer: true,
    dueDate: "2026-08-28",
    daysRemaining: 22,
    renewalPrice: 18.99,
    status: "closer_to_due",
    autoPayEnabled: false,
    periodYears: 1,
    sslPrice: 29,
    domainProtectionEnabled: true,
    domainProtectionPrice: 49,
    toaEnabled: true,
    toaPrice: 500,
  },
  {
    id: "dom-6",
    domain: "sckalibeauty",
    fullDomainName: "sckalibeauty.com",
    type: "main",
    vercel: true,
    supabase: false,
    resend: true,
    fixer: true,
    dueDate: "2027-04-03",
    daysRemaining: 240,
    renewalPrice: 19.99,
    status: "closer_to_due",
    autoPayEnabled: false,
    periodYears: 1,
    lastPaymentDate: "2026-04-03",
    sslPrice: 29,
    domainProtectionEnabled: true,
    domainProtectionPrice: 49,
    toaEnabled: true,
    toaPrice: 500,
  },
  {
    id: "dom-7",
    domain: "argansus",
    fullDomainName: "argansus.com",
    type: "main",
    vercel: true,
    supabase: false,
    resend: true,
    fixer: true,
    dueDate: "2027-02-07",
    daysRemaining: 185,
    renewalPrice: 15.99,
    status: "closer_to_due",
    autoPayEnabled: false,
    periodYears: 1,
    lastPaymentDate: "2026-02-07",
    sslPrice: 29,
    domainProtectionEnabled: true,
    domainProtectionPrice: 49,
    toaEnabled: true,
    toaPrice: 500,
  },
  {
    id: "dom-8",
    domain: "hertzwallet",
    fullDomainName: "hertzwallet.com",
    type: "main",
    vercel: true,
    supabase: false,
    resend: true,
    fixer: true,
    dueDate: "2027-06-12",
    daysRemaining: 310,
    renewalPrice: 29.99,
    status: "closer_to_due",
    autoPayEnabled: false,
    periodYears: 1,
    lastPaymentDate: "2026-06-12",
    sslPrice: 29,
    domainProtectionEnabled: true,
    domainProtectionPrice: 49,
    toaEnabled: true,
    toaPrice: 500,
  },
  {
    id: "dom-9",
    domain: "bigbossbarber.com",
    fullDomainName: "bigbossbarber.com",
    type: "main",
    vercel: true,
    supabase: true,
    resend: true,
    fixer: true,
    dueDate: "2026-12-04",
    daysRemaining: 120,
    renewalPrice: 14.99,
    status: "closer_to_due",
    autoPayEnabled: false,
    periodYears: 1,
    lastPaymentDate: "2025-12-04",
    sslPrice: 29,
    domainProtectionEnabled: true,
    domainProtectionPrice: 49,
    toaEnabled: true,
    toaPrice: 500,
  },
  {
    id: "dom-10",
    domain: "hertzora",
    fullDomainName: "hertzora.ai",
    type: "main",
    vercel: true,
    supabase: false,
    resend: true,
    fixer: true,
    dueDate: "2027-05-23",
    daysRemaining: 290,
    renewalPrice: 49.99,
    status: "closer_to_due",
    autoPayEnabled: false,
    periodYears: 1,
    lastPaymentDate: "2026-05-23",
    sslPrice: 29,
    domainProtectionEnabled: true,
    domainProtectionPrice: 49,
    toaEnabled: true,
    toaPrice: 500,
  },
  {
    id: "dom-11",
    domain: "test",
    fullDomainName: "test.com",
    type: "main",
    vercel: true,
    supabase: false,
    resend: true,
    fixer: true,
    dueDate: "2026-08-07",
    daysRemaining: 1,
    renewalPrice: 19.99,
    status: "closer_to_due",
    autoPayEnabled: false,
    autoPayMethod: "•••• 4242",
    periodYears: 1,
    lastPaymentDate: "2026-08-06",
    sslPrice: 29,
    domainProtectionEnabled: true,
    domainProtectionPrice: 49,
    toaEnabled: true,
    toaPrice: 500,
  },
];


export const domains: DomainInfo[] = [
  // Sckali Group landing
  {
    domain: "sckali",
    type: "main",
    vercel: true,
    supabase: false,
    resend: true,
    fixer: true,
  },
  {
    domain: "sckaligroup",
    type: "main",
    vercel: true,
    supabase: false,
    resend: true,
    fixer: true,
  },

  // Sckali Design
  {
    domain: "sckalidesign",
    type: "main",
    vercel: true,
    supabase: false,
    resend: true,
    fixer: true,
  },

  // Sckali Beauty
  {
    domain: "sckalibeauty",
    type: "main",
    vercel: true,
    supabase: false,
    resend: true,
    fixer: true,
  },

  // Argansus
  {
    domain: "argansus",
    type: "main",
    vercel: true,
    supabase: false,
    resend: true,
    fixer: true,
  },

  // Ckali Kids
  {
    domain: "ckalikids",
    type: "main",
    vercel: true,
    supabase: false,
    resend: true,
    fixer: true,
  },

  // Hertz Qatar
  {
    domain: "hertzgroup.qa",
    type: "main",
    vercel: true,
    supabase: false,
    resend: true,
    fixer: true,
  },

  // Hertz Wallet
  {
    domain: "hertzwallet",
    type: "main",
    vercel: true,
    supabase: false,
    resend: true,
    fixer: true,
  },

  // gronos
  {
    domain: "gronos",
    type: "main",
    vercel: true,
    supabase: true,
    resend: true,
    fixer: true,
  },
  {
    domain: "bigbossbarber.com",
    type: "main",
    vercel: true,
    supabase: true,
    resend: true,
    fixer: true,
  },
  // Hertzora
  {
    domain: "hertzora",
    type: "main",
    vercel: true,
    supabase: false,
    resend: true,
    fixer: true,
  },
  // Hertzmatrix
  {
    domain: "hertzmatrix",
    type: "main",
    vercel: true,
    supabase: false,
    resend: true,
    fixer: true,
  },
  // Hertztalent
  {
    domain: "hertztalent",
    type: "main",
    vercel: true,
    supabase: false,
    resend: true,
    fixer: true,
  },
];


export const countries = [
  { code: "af", name: "Afghanistan" },
  { code: "al", name: "Albania" },
  { code: "dz", name: "Algeria" },
  { code: "ad", name: "Andorra" },
  { code: "ao", name: "Angola" },
  { code: "ag", name: "Antigua and Barbuda" },
  { code: "ar", name: "Argentina" },
  { code: "am", name: "Armenia" },
  { code: "au", name: "Australia" },
  { code: "at", name: "Austria" },
  { code: "az", name: "Azerbaijan" },
  { code: "bs", name: "Bahamas" },
  { code: "bh", name: "Bahrain" },
  { code: "bd", name: "Bangladesh" },
  { code: "bb", name: "Barbados" },
  { code: "by", name: "Belarus" },
  { code: "be", name: "Belgium" },
  { code: "bz", name: "Belize" },
  { code: "bj", name: "Benin" },
  { code: "bt", name: "Bhutan" },
  { code: "bo", name: "Bolivia" },
  { code: "ba", name: "Bosnia and Herzegovina" },
  { code: "bw", name: "Botswana" },
  { code: "br", name: "Brazil" },
  { code: "bn", name: "Brunei Darussalam" },
  { code: "bg", name: "Bulgaria" },
  { code: "bf", name: "Burkina Faso" },
  { code: "bi", name: "Burundi" },
  { code: "cv", name: "Cabo Verde" },
  { code: "kh", name: "Cambodia" },
  { code: "cm", name: "Cameroon" },
  { code: "ca", name: "Canada" },
  { code: "cf", name: "Central African Republic" },
  { code: "td", name: "Chad" },
  { code: "cl", name: "Chile" },
  { code: "cn", name: "China" },
  { code: "co", name: "Colombia" },
  { code: "km", name: "Comoros" },
  { code: "cd", name: "Congo (Democratic Republic)" },
  { code: "cg", name: "Congo (Republic)" },
  { code: "cr", name: "Costa Rica" },
  { code: "hr", name: "Croatia" },
  { code: "cu", name: "Cuba" },
  { code: "cy", name: "Cyprus" },
  { code: "cz", name: "Czechia" },
  { code: "dk", name: "Denmark" },
  { code: "dj", name: "Djibouti" },
  { code: "dm", name: "Dominica" },
  { code: "do", name: "Dominican Republic" },
  { code: "ec", name: "Ecuador" },
  { code: "eg", name: "Egypt" },
  { code: "sv", name: "El Salvador" },
  { code: "gq", name: "Equatorial Guinea" },
  { code: "er", name: "Eritrea" },
  { code: "ee", name: "Estonia" },
  { code: "sz", name: "Eswatini" },
  { code: "et", name: "Ethiopia" },
  { code: "fj", name: "Fiji" },
  { code: "fi", name: "Finland" },
  { code: "fr", name: "France" },
  { code: "ga", name: "Gabon" },
  { code: "gm", name: "Gambia" },
  { code: "ge", name: "Georgia" },
  { code: "de", name: "Germany" },
  { code: "gh", name: "Ghana" },
  { code: "gr", name: "Greece" },
  { code: "gd", name: "Grenada" },
  { code: "gt", name: "Guatemala" },
  { code: "gn", name: "Guinea" },
  { code: "gw", name: "Guinea-Bissau" },
  { code: "gy", name: "Guyana" },
  { code: "ht", name: "Haiti" },
  { code: "hn", name: "Honduras" },
  { code: "hu", name: "Hungary" },
  { code: "is", name: "Iceland" },
  { code: "in", name: "India" },
  { code: "id", name: "Indonesia" },
  { code: "ir", name: "Iran" },
  { code: "iq", name: "Iraq" },
  { code: "ie", name: "Ireland" },
  { code: "il", name: "Israel" },
  { code: "it", name: "Italy" },
  { code: "jm", name: "Jamaica" },
  { code: "jp", name: "Japan" },
  { code: "jo", name: "Jordan" },
  { code: "kz", name: "Kazakhstan" },
  { code: "ke", name: "Kenya" },
  { code: "ki", name: "Kiribati" },
  { code: "kp", name: "Korea (North)" },
  { code: "kr", name: "Korea (South)" },
  { code: "kw", name: "Kuwait" },
  { code: "kg", name: "Kyrgyzstan" },
  { code: "la", name: "Lao PDR" },
  { code: "lv", name: "Latvia" },
  { code: "lb", name: "Lebanon" },
  { code: "ls", name: "Lesotho" },
  { code: "lr", name: "Liberia" },
  { code: "ly", name: "Libya" },
  { code: "li", name: "Liechtenstein" },
  { code: "lt", name: "Lithuania" },
  { code: "lu", name: "Luxembourg" },
  { code: "mg", name: "Madagascar" },
  { code: "mw", name: "Malawi" },
  { code: "my", name: "Malaysia" },
  { code: "mv", name: "Maldives" },
  { code: "ml", name: "Mali" },
  { code: "mt", name: "Malta" },
  { code: "mh", name: "Marshall Islands" },
  { code: "mr", name: "Mauritania" },
  { code: "mu", name: "Mauritius" },
  { code: "mx", name: "Mexico" },
  { code: "fm", name: "Micronesia" },
  { code: "md", name: "Moldova" },
  { code: "mc", name: "Monaco" },
  { code: "mn", name: "Mongolia" },
  { code: "me", name: "Montenegro" },
  { code: "ma", name: "Morocco" },
  { code: "mz", name: "Mozambique" },
  { code: "mm", name: "Myanmar" },
  { code: "na", name: "Namibia" },
  { code: "nr", name: "Nauru" },
  { code: "np", name: "Nepal" },
  { code: "nl", name: "Netherlands" },
  { code: "nz", name: "New Zealand" },
  { code: "ni", name: "Nicaragua" },
  { code: "ne", name: "Niger" },
  { code: "ng", name: "Nigeria" },
  { code: "mk", name: "North Macedonia" },
  { code: "no", name: "Norway" },
  { code: "om", name: "Oman" },
  { code: "pk", name: "Pakistan" },
  { code: "pw", name: "Palau" },
  { code: "pa", name: "Panama" },
  { code: "pg", name: "Papua New Guinea" },
  { code: "py", name: "Paraguay" },
  { code: "pe", name: "Peru" },
  { code: "ph", name: "Philippines" },
  { code: "pl", name: "Poland" },
  { code: "pt", name: "Portugal" },
  { code: "qa", name: "Qatar" },
  { code: "ro", name: "Romania" },
  { code: "ru", name: "Russia" },
  { code: "rw", name: "Rwanda" },
  { code: "kn", name: "Saint Kitts and Nevis" },
  { code: "lc", name: "Saint Lucia" },
  { code: "vc", name: "Saint Vincent and the Grenadines" },
  { code: "ws", name: "Samoa" },
  { code: "sm", name: "San Marino" },
  { code: "st", name: "Sao Tome and Principe" },
  { code: "sa", name: "Saudi Arabia" },
  { code: "sn", name: "Senegal" },
  { code: "rs", name: "Serbia" },
  { code: "sc", name: "Seychelles" },
  { code: "sl", name: "Sierra Leone" },
  { code: "sg", name: "Singapore" },
  { code: "sk", name: "Slovakia" },
  { code: "si", name: "Slovenia" },
  { code: "sb", name: "Solomon Islands" },
  { code: "so", name: "Somalia" },
  { code: "za", name: "South Africa" },
  { code: "ss", name: "South Sudan" },
  { code: "es", name: "Spain" },
  { code: "lk", name: "Sri Lanka" },
  { code: "sd", name: "Sudan" },
  { code: "sr", name: "Suriname" },
  { code: "se", name: "Sweden" },
  { code: "ch", name: "Switzerland" },
  { code: "sy", name: "Syria" },
  { code: "tw", name: "Taiwan" },
  { code: "tj", name: "Tajikistan" },
  { code: "tz", name: "Tanzania" },
  { code: "th", name: "Thailand" },
  { code: "tl", name: "Timor-Leste" },
  { code: "tg", name: "Togo" },
  { code: "to", name: "Tonga" },
  { code: "tt", name: "Trinidad and Tobago" },
  { code: "tn", name: "Tunisia" },
  { code: "tr", name: "Türkiye" },
  { code: "tm", name: "Turkmenistan" },
  { code: "tv", name: "Tuvalu" },
  { code: "ug", name: "Uganda" },
  { code: "ua", name: "Ukraine" },
  { code: "ae", name: "United Arab Emirates" },
  { code: "gb", name: "United Kingdom" },
  { code: "us", name: "United States" },
  { code: "uy", name: "Uruguay" },
  { code: "uz", name: "Uzbekistan" },
  { code: "vu", name: "Vanuatu" },
  { code: "va", name: "Vatican City" },
  { code: "ve", name: "Venezuela" },
  { code: "vn", name: "Vietnam" },
  { code: "ye", name: "Yemen" },
  { code: "zm", name: "Zambia" },
  { code: "zw", name: "Zimbabwe" },
];
