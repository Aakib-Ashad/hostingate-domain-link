"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      style={
        {
          "--normal-bg": "#ffffff",
          "--normal-text": "#0f172a",
          "--normal-border": "#e2e8f0",
          "--description-text": "#334155",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            "bg-white text-slate-900 border border-slate-200 shadow-xl rounded-xl font-sans p-4",
          title: "text-slate-900 font-bold text-sm",
          description: "text-slate-700 font-medium text-xs mt-0.5 block opacity-100",
          actionButton: "bg-slate-900 text-white font-semibold text-xs rounded-lg px-3 py-1.5",
          cancelButton: "bg-slate-100 text-slate-600 font-semibold text-xs rounded-lg px-3 py-1.5",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
