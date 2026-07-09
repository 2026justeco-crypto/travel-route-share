'use client';

import { REGIONS, type Region, type RecentFilter } from '@/lib/types';

export interface Filters {
  showMine: boolean;
  showOthers: boolean;
  favoritesOnly: boolean;
  regions: Set<Region>;
  recent: RecentFilter;
}

export function defaultFilters(): Filters {
  return {
    showMine: true,
    showOthers: true,
    favoritesOnly: false,
    regions: new Set(REGIONS),
    recent: 'all',
  };
}

interface Props {
  filters: Filters;
  onChange: (f: Filters) => void;
}

function Check({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-sm text-gray-700 hover:bg-gray-50 has-[:checked]:border-blue-300 has-[:checked]:bg-blue-50 has-[:checked]:text-blue-700">
      <input type="checkbox" checked={checked} onChange={onToggle} className="accent-blue-600" />
      {label}
    </label>
  );
}

export default function FilterPanel({ filters, onChange }: Props) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });

  const toggleRegion = (r: Region) => {
    const regions = new Set(filters.regions);
    if (regions.has(r)) regions.delete(r);
    else regions.add(r);
    set({ regions });
  };

  return (
    <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-gray-500">表示</span>
        <Check
          label="自分の投稿"
          checked={filters.showMine}
          onToggle={() => set({ showMine: !filters.showMine })}
        />
        <Check
          label="他ユーザー"
          checked={filters.showOthers}
          onToggle={() => set({ showOthers: !filters.showOthers })}
        />
        <Check
          label="お気に入りのみ"
          checked={filters.favoritesOnly}
          onToggle={() => set({ favoritesOnly: !filters.favoritesOnly })}
        />
        <span className="ml-2 text-xs font-semibold text-gray-500">期間</span>
        <select
          value={filters.recent}
          onChange={(e) => set({ recent: e.target.value as RecentFilter })}
          className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-700"
        >
          <option value="all">すべて</option>
          <option value="7">直近7日</option>
          <option value="30">直近30日</option>
          <option value="90">直近90日</option>
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-gray-500">地域</span>
        {REGIONS.map((r) => (
          <Check key={r} label={r} checked={filters.regions.has(r)} onToggle={() => toggleRegion(r)} />
        ))}
        <button
          onClick={() =>
            set({
              regions: new Set(
                filters.regions.size === REGIONS.length ? [] : REGIONS,
              ),
            })
          }
          className="text-xs text-blue-600 underline"
        >
          全選択/解除
        </button>
      </div>
    </div>
  );
}
