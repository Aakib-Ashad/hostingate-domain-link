"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Inbox } from "lucide-react";

export default function CombinedDomainServices() {
  return (
    <Card className="border-2 border-purple-200 bg-purple-50">
      <CardContent className="p-6">
        <div className="flex items-start space-x-3">
          <div className="flex items-center justify-center w-6 h-6 mt-0.5 text-purple-600 flex-shrink-0">
            <Inbox className="h-4 w-4" />
          </div>
          <div className="space-y-2 flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-slate-800">Business Email</h3>
                <p className="text-sm text-slate-600 mt-1">
                  Professional email hosting with custom domain
                </p>
                <ul className="mt-3 space-y-1">
                  <li className="text-xs text-slate-600">• Advanced features for maximum privacy</li>
                  <li className="text-xs text-slate-600">• 10GB storage per mailbox</li>
                  <li className="text-xs text-slate-600">• Dedicated customer support</li>
                </ul>
              </div>
              <div className="flex flex-col items-start sm:items-end gap-2 sm:ml-4 flex-shrink-0">
                <div className="font-bold text-lg text-purple-600">
                  $3.99
                  <span className="text-sm font-normal ml-1">/mailbox monthly</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}