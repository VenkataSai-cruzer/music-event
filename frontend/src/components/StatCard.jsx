export default function StatCard({ icon: Icon, label, value, color = 'indigo' }) {
  const colorMap = {
    indigo: 'bg-indigo-50 text-indigo-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow duration-200">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">
            {value !== undefined ? value.toLocaleString() : '—'}
          </p>
        </div>
        <div className={`p-3 rounded-xl ${colorMap[color] || colorMap.indigo}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}
