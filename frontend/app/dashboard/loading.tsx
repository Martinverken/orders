export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Cards skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg p-4 h-24 animate-pulse border border-gray-100">
              <div className="h-3 bg-gray-200 rounded w-1/2 mb-3" />
              <div className="h-8 bg-gray-200 rounded w-1/3" />
            </div>
          ))}
        </div>
        {/* Table skeleton */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-6 animate-pulse" />
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex gap-4 mb-4 animate-pulse">
              <div className="h-3 bg-gray-200 rounded flex-1" />
              <div className="h-3 bg-gray-200 rounded w-24" />
              <div className="h-3 bg-gray-200 rounded w-20" />
              <div className="h-3 bg-gray-200 rounded w-32" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
