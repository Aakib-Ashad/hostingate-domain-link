export default function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-violet-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="animate-pulse">
          <div className="h-10 bg-slate-200 rounded-xl w-80 mx-auto mb-4"></div>
          <div className="h-6 bg-slate-200 rounded-lg w-64 mx-auto mb-12"></div>

          <div className="grid grid-cols-1 xl:grid-cols-5 gap-8">
            <div className="xl:col-span-2 space-y-4">
              <div className="h-80 bg-slate-200 rounded-xl"></div>
              <div className="h-6 bg-slate-200 rounded w-3/4"></div>
            </div>
            <div className="xl:col-span-3 space-y-4">
              <div className="h-16 bg-slate-200 rounded-xl"></div>
              <div className="h-64 bg-slate-200 rounded-xl"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
