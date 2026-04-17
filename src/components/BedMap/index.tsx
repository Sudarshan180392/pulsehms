import React from 'react';

export const BedMap = ({ beds }: { beds: any[] }) => {
  return (
    <div className="p-4 bg-slate-800 rounded-xl border border-slate-700">
      <h3 className="text-white mb-4">Unit Floor Plan</h3>
      <div className="grid grid-cols-8 gap-2">
        {beds.map((bed) => (
          <div 
            key={bed.id} 
            className={`h-12 w-12 rounded border flex items-center justify-center text-[10px] ${
              bed.status === 'occupied' ? 'bg-blue-500 border-blue-400' : 'bg-slate-700 border-slate-600'
            }`}
          >
            {bed.label}
          </div>
        ))}
      </div>
    </div>
  );
};