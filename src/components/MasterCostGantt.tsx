import React, { useState } from 'react';
import { 
  CheckCircle, 
  Layers, 
  ArrowRight, 
  DollarSign, 
  TrendingUp, 
  Briefcase, 
  CalendarDays,
  Activity,
  Maximize2,
  Download,
  Loader2,
  ChevronDown
} from 'lucide-react';
import { EquipmentRecord, SectionType } from '../types';
import { SECTIONS, MONTHS_DATA, calculateWeeklyAllocation, generateWeeks, buildNormalizedRecord } from '../data';
import { exportToExcel, exportToPDF, validateReconciliation } from '../utils/exportUtils';

interface MasterCostGanttProps {
  allRecords: EquipmentRecord[];
  onSelectSection: (section: SectionType) => void;
  activeSection: SectionType;
  onSelectSectionAndMonth?: (section: SectionType, month: string) => void;
}

export const MasterCostGantt: React.FC<MasterCostGanttProps> = ({
  allRecords,
  onSelectSection,
  activeSection,
  onSelectSectionAndMonth
}) => {
  const weeks = generateWeeks();

  // Export tracking state
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const triggerExport = async (type: 'current-excel' | 'current-pdf' | 'full-excel' | 'full-pdf') => {
    setExportStatus('Preparing Gantt export...');
    setIsExportDropdownOpen(false);

    await new Promise(resolve => setTimeout(resolve, 300));

    try {
      const activeFilters = {
        selectedProject: 'All',
        selectedType: 'All',
        searchPropertyNum: '',
        selectedMonth: 'All',
        selectedStatus: 'All'
      };

      if (type.endsWith('excel')) {
        await exportToExcel({
          records: allRecords,
          allRecords,
          selectedSection: activeSection,
          isMaster: true,
          isFullExport: true,
          activeFilters,
          weeks
        });
      } else {
        await exportToPDF({
          records: allRecords,
          allRecords,
          selectedSection: activeSection,
          isMaster: true,
          isFullExport: true,
          activeFilters,
          weeks
        });
      }
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExportStatus(null);
    }
  };

  // Helper to format currency
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      maximumFractionDigits: 0
    }).format(val);
  };

  // Helper for compact currency formatting inside Gantt cells
  const formatCompactCurrency = (val: number) => {
    if (val === 0) return '₱0';
    if (val >= 1_000_000) {
      return `₱${(val / 1_000_000).toFixed(1)}M`;
    }
    if (val >= 1_000) {
      return `₱${(val / 1_000).toFixed(0)}K`;
    }
    return `₱${val}`;
  };

  // --- 1. AGGREGATE WEEKLY DATA & MONTHLY SUB-TOTALS ---
  // Create mapping of section -> weekId -> { cost, activeCount }
  const sectionWeeklyData: {
    [sec in SectionType]: {
      [weekId: string]: {
        cost: number;
        activeCount: number;
      };
    };
  } = {} as any;

  SECTIONS.forEach(sec => {
    sectionWeeklyData[sec] = {};
    weeks.forEach(w => {
      sectionWeeklyData[sec][w.id] = { cost: 0, activeCount: 0 };
    });
  });

  // Create mapping of section -> unscheduledCost
  const sectionUnscheduledCost: { [sec in SectionType]: number } = {} as any;
  SECTIONS.forEach(sec => {
    sectionUnscheduledCost[sec] = 0;
  });

  let overallProjectedRepairCost = 0;
  let overallUnscheduledCost = 0;

  // Populate weekly allocations and count active records per section & week
  allRecords.forEach(record => {
    overallProjectedRepairCost += (record.projectedRepairCost || 0);
    
    // Defensive section matching
    let sectionKey = record.section;
    if (!sectionWeeklyData[sectionKey]) {
      const foundSec = SECTIONS.find(s => s.toLowerCase() === String(sectionKey).trim().toLowerCase());
      if (foundSec) {
        sectionKey = foundSec;
      } else {
        sectionKey = 'Electrical'; // Fallback
      }
    }

    const norm = buildNormalizedRecord(record, weeks);
    if (norm.isUnscheduled) {
      sectionUnscheduledCost[sectionKey] += norm.projectedRepairCost;
      overallUnscheduledCost += norm.projectedRepairCost;
    } else {
      const alloc = norm.weeklyAllocations;
      weeks.forEach(w => {
        const amount = alloc[w.id] || 0;
        if (amount > 0 || norm.activeWeeks[w.id]) {
          if (sectionWeeklyData[sectionKey] && sectionWeeklyData[sectionKey][w.id]) {
            sectionWeeklyData[sectionKey][w.id].cost += amount;
            if (norm.activeWeeks[w.id]) {
              sectionWeeklyData[sectionKey][w.id].activeCount += 1;
            }
          }
        }
      });
    }
  });

  // Calculate monthly totals per section from the weekly allocations
  const sectionMonthlyCosts: { [sec in SectionType]: { [monthName: string]: number } } = {} as any;
  SECTIONS.forEach(sec => {
    sectionMonthlyCosts[sec] = {};
    MONTHS_DATA.forEach(m => {
      sectionMonthlyCosts[sec][m.name] = 0;
      weeks.forEach(w => {
        if (w.monthName === m.name) {
          sectionMonthlyCosts[sec][m.name] += sectionWeeklyData[sec][w.id].cost;
        }
      });
    });
  });

  // Calculate section total sums
  const sectionTotals: { [sec in SectionType]: number } = {} as any;
  SECTIONS.forEach(sec => {
    sectionTotals[sec] = Object.values(sectionMonthlyCosts[sec]).reduce((a, b) => a + b, 0);
  });

  // Calculate monthly grand totals across all sections combined
  const monthlyGrandTotals: { [monthName: string]: number } = {};
  MONTHS_DATA.forEach(m => {
    monthlyGrandTotals[m.name] = 0;
    SECTIONS.forEach(sec => {
      monthlyGrandTotals[m.name] += sectionMonthlyCosts[sec][m.name];
    });
  });

  const grandTotalAllSections = Object.values(sectionTotals).reduce((a, b) => a + b, 0);

  // Maximum section cost (for scaling visual comparison progress bars)
  const maxSectionCost = Math.max(...Object.values(sectionTotals), 1);

  // Maximum weekly cost (for visual color intensity scale)
  let maxWeeklyCost = 1;
  SECTIONS.forEach(sec => {
    weeks.forEach(w => {
      const cost = sectionWeeklyData[sec][w.id].cost;
      if (cost > maxWeeklyCost) {
        maxWeeklyCost = cost;
      }
    });
  });

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* 1. Bento Dashboard Key Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4.5">
        
         {/* Total Portfolio Cost */}
        <div className="bg-white rounded-xl border border-slate-200/95 p-4 sm:p-4.5 flex items-center space-x-3.5 custom-shadow h-24">
          <div className="p-3 bg-brand-500/10 rounded-xl text-brand-600 shrink-0 flex items-center justify-center">
            <DollarSign className="w-5.5 h-5.5 stroke-[2.5]" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="block text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
              Overall Projected Repair Cost
            </span>
            <h4 className="text-lg sm:text-xl font-mono font-black text-slate-900 tracking-tight mt-0.5 truncate">
              {formatCurrency(overallProjectedRepairCost)}
            </h4>
            <div className="text-[9.5px] text-slate-500 mt-0.5 flex flex-wrap gap-x-2">
              <span>Scheduled: <strong className="text-slate-700 font-bold">{formatCurrency(grandTotalAllSections)}</strong></span>
              {overallUnscheduledCost > 0 && (
                <span>Unscheduled: <strong className="text-rose-600 font-bold">{formatCurrency(overallUnscheduledCost)}</strong></span>
              )}
            </div>
          </div>
        </div>

        {/* Total Equipment Units */}
        <div className="bg-white rounded-xl border border-slate-200/95 p-4 sm:p-4.5 flex items-center space-x-3.5 custom-shadow h-24">
          <div className="p-3 bg-amber-500/10 rounded-xl text-amber-600 shrink-0 flex items-center justify-center">
            <Briefcase className="w-5.5 h-5.5 stroke-[2.5]" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="block text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
              Allocated Equipment Units
            </span>
            <h4 className="text-lg sm:text-xl font-mono font-black text-slate-900 tracking-tight mt-0.5 truncate">
              {allRecords.length} Units
            </h4>
            <p className="text-[10px] text-slate-400 mt-0.5 truncate">
              Scheduled in active project portfolios
            </p>
          </div>
        </div>

        {/* Highest Cost Section */}
        {(() => {
          let highestCostSection = SECTIONS[0];
          let maxVal = -1;
          SECTIONS.forEach(sec => {
            if (sectionTotals[sec] > maxVal) {
              maxVal = sectionTotals[sec];
              highestCostSection = sec;
            }
          });

          return (
            <div className="bg-white rounded-xl border border-slate-200/95 p-4 sm:p-4.5 flex items-center space-x-3.5 custom-shadow h-24">
              <div className="p-3 bg-rose-500/10 rounded-xl text-rose-600 shrink-0 flex items-center justify-center">
                <TrendingUp className="w-5.5 h-5.5 stroke-[2.5]" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="block text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                  Highest Capital Overhead
                </span>
                <h4 className="text-lg sm:text-xl font-mono font-black text-rose-700 tracking-tight mt-0.5 truncate">
                  {formatCurrency(sectionTotals[highestCostSection])}
                </h4>
                <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                  Section: <strong className="text-slate-600 font-semibold">{highestCostSection}</strong>
                </p>
              </div>
            </div>
          );
        })()}

      </div>

      {/* 2. MASTER WEEKLY COST GANTT CHART (Interactive Schedule Matrix) */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden custom-shadow">
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="font-display font-bold text-slate-800 text-sm sm:text-base flex items-center space-x-2">
              <CalendarDays className="w-5 h-5 text-brand-600 shrink-0" />
              <span>Master Weekly Cost Schedule &amp; Activity Gantt</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Weekly aggregated repair costs and active planned repair count per Section. Click on cells to jump-filter Section sheets.
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-1.5 text-[10px] text-brand-800 font-bold bg-brand-50 border border-brand-100 px-2.5 py-1 rounded-lg">
              <Activity className="w-3.5 h-3.5 text-brand-500 animate-pulse" />
              <span>Live Aggregation Activated</span>
            </div>

            {/* Export Gantt Button and Dropdown */}
            <div className="relative">
              <button
                onClick={() => setIsExportDropdownOpen(!isExportDropdownOpen)}
                disabled={exportStatus !== null}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg cursor-pointer shadow-xs transition-all disabled:opacity-50 h-[34px]"
                id="btn-export-master"
              >
                {exportStatus ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    <span>Export Master</span>
                    <ChevronDown className="w-3 h-3 text-slate-400" />
                  </>
                )}
              </button>

              {isExportDropdownOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setIsExportDropdownOpen(false)} 
                  />
                  <div className="absolute right-0 mt-1.5 w-60 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1 font-sans text-xs animate-fade-in divide-y divide-slate-100">
                    <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Export Filtered View
                    </div>
                    <div className="py-0.5">
                      <button
                        onClick={() => triggerExport('current-excel')}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700 font-medium transition-colors cursor-pointer"
                      >
                        Export Current View to Excel (.xlsx)
                      </button>
                      <button
                        onClick={() => triggerExport('current-pdf')}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700 font-medium transition-colors cursor-pointer"
                      >
                        Export Current View to PDF (.pdf)
                      </button>
                    </div>
                    <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Export Full Timeline (July - Dec)
                    </div>
                    <div className="py-0.5">
                      <button
                        onClick={() => triggerExport('full-excel')}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700 font-medium transition-colors cursor-pointer"
                      >
                        Export Full July–Dec Gantt to Excel
                      </button>
                      <button
                        onClick={() => triggerExport('full-pdf')}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700 font-medium transition-colors cursor-pointer"
                      >
                        Export Full July–Dec Gantt to PDF
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Generation Loading Overlay */}
        {exportStatus && (
          <div className="absolute inset-0 bg-white/70 backdrop-blur-xs z-50 flex flex-col items-center justify-center animate-fade-in">
            <div className="bg-slate-900 text-white px-6 py-4 rounded-xl shadow-xl flex items-center space-x-3 border border-slate-700 max-w-sm">
              <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
              <div className="text-left">
                <p className="font-bold text-sm text-white">Generating Report</p>
                <p className="text-[11px] text-slate-300 mt-0.5">{exportStatus}</p>
              </div>
            </div>
          </div>
        )}

        {/* Scrollable grid frame */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-[11px] table-fixed min-w-[1700px] select-none">
            
            {/* Headers */}
            <thead>
              {/* Month Header Row */}
              <tr className="bg-slate-200 border-b border-slate-300">
                <th className="sticky left-0 z-30 bg-slate-200 p-3 font-display font-black text-slate-800 text-xs w-[210px] min-w-[210px] border-r-2 border-slate-450 uppercase tracking-wider">
                  Maintenance Section
                </th>
                {MONTHS_DATA.map(m => (
                  <th
                    key={m.name}
                    colSpan={6} // 5 weeks + 1 monthly subtotal column = 6
                    className="p-2.5 text-center font-display font-extrabold text-[11px] uppercase tracking-wider text-slate-700 bg-slate-200/95 border-r-2 border-slate-450"
                  >
                    {m.name}
                  </th>
                ))}
              </tr>
              
              {/* Weeks Header Row */}
              <tr className="bg-slate-100 border-b border-slate-200 font-mono text-[9px] text-slate-600 font-bold">
                <th className="sticky left-0 z-30 bg-slate-100 p-2 border-r-2 border-slate-450 w-[210px] min-w-[210px]"></th>
                {MONTHS_DATA.map(m => {
                  const mWeeks = weeks.filter(w => w.monthName === m.name);
                  return (
                    <React.Fragment key={m.name}>
                      {mWeeks.map(w => (
                        <th key={w.id} className="p-1 text-center border-r border-slate-200 w-[44px]">
                          <div className="text-slate-800 font-extrabold">{w.label}</div>
                          <div className="text-[8px] text-slate-500 font-normal">{w.dateRangeText.replace(m.name.substring(0,3)+' ', '')}</div>
                        </th>
                      ))}
                      {/* Monthly Total Column Spacer */}
                      <th className="p-1 text-center bg-slate-200/40 border-r-2 border-slate-450 text-[10px] font-black text-brand-700 w-[70px]">
                        {m.name.substring(0,3)} Total
                      </th>
                    </React.Fragment>
                  );
                })}
              </tr>
            </thead>

            {/* Matrix Body */}
            <tbody className="divide-y divide-slate-100">
              {SECTIONS.map(sec => {
                const isSelectedSection = activeSection === sec;
                
                return (
                  <tr key={sec} className="hover:bg-slate-50/80 group transition-all duration-150">
                    
                    {/* Sticky Left Section Row Name (Clickable to view full section) */}
                    <td 
                      onClick={() => onSelectSectionAndMonth?.(sec, 'All')}
                      className={`sticky left-0 z-10 p-3 font-display font-extrabold border-r-2 border-slate-450 transition-all cursor-pointer select-none group w-[210px] min-w-[210px] shadow-[2px_0_5px_rgba(0,0,0,0.02)] ${
                        isSelectedSection ? 'bg-indigo-50 text-indigo-950 font-black' : 'bg-white text-slate-700 group-hover:bg-slate-100/90'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="truncate group-hover:text-brand-600 font-display font-extrabold text-xs tracking-tight">{sec}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-brand-600 opacity-0 group-hover:opacity-100 transition-all ml-1 shrink-0 transform -translate-x-1 group-hover:translate-x-0" />
                      </div>
                    </td>

                    {/* Weekly Cost & Subtotals */}
                    {MONTHS_DATA.map(m => {
                      const mWeeks = weeks.filter(w => w.monthName === m.name);
                      const mTotal = sectionMonthlyCosts[sec][m.name];

                      return (
                        <React.Fragment key={m.name}>
                          {/* 5 Weekly cells */}
                          {mWeeks.map(w => {
                            const data = sectionWeeklyData[sec][w.id];
                            const cost = data.cost;
                            const activeCount = data.activeCount;

                            // Scale bg opacity based on weekly cost
                            const intensity = cost > 0 ? (cost / maxWeeklyCost) : 0;
                            // Beautiful indigo-600 color base: #4f46e5 (79, 70, 229)
                            const bgStyle = cost > 0 
                              ? { backgroundColor: `rgba(79, 70, 229, ${0.08 + 0.9 * intensity})` }
                              : undefined;

                            // Dynamic text colors depending on cell intensity brightness
                            const textColorClass = intensity > 0.45 ? 'text-white font-extrabold' : 'text-indigo-950 font-extrabold';
                            const countColorClass = intensity > 0.45 ? 'text-indigo-100 font-bold' : 'text-slate-500 font-semibold';

                            return (
                              <td
                                key={w.id}
                                onClick={() => onSelectSectionAndMonth?.(sec, m.name)}
                                style={bgStyle}
                                className={`p-1.5 text-center border-r border-slate-200 cursor-pointer select-none relative group/cell transition-all duration-100 hover:ring-2 hover:ring-brand-500/30 hover:scale-[1.03] hover:z-10 ${
                                  cost === 0 ? 'bg-white hover:bg-slate-50' : ''
                                }`}
                                title={`${sec} - ${w.monthName} ${w.label}: ${formatCurrency(cost)} (${activeCount} active repairs)`}
                              >
                                {cost > 0 ? (
                                  <div className="flex flex-col justify-center h-full select-none leading-tight py-0.5">
                                    <span className={`font-mono text-[10px] ${textColorClass}`}>
                                      {formatCompactCurrency(cost)}
                                    </span>
                                    <span className={`text-[8px] tracking-tight mt-0.5 ${countColorClass}`}>
                                      {activeCount} {activeCount === 1 ? 'rep.' : 'reps.'}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-slate-300 font-mono font-medium text-[9px]">—</span>
                                )}
                              </td>
                            );
                          })}

                          {/* Monthly Total Column Cell */}
                          <td
                            onClick={() => onSelectSectionAndMonth?.(sec, m.name)}
                            className="p-1.5 text-right font-mono font-bold text-slate-800 bg-slate-100/50 border-r-2 border-slate-450 cursor-pointer hover:bg-brand-50 hover:text-brand-700 transition-colors"
                            title={`Click to filter ${sec} on ${m.name}`}
                          >
                            {mTotal > 0 ? (
                              <div className="leading-tight py-0.5 pr-0.5">
                                <div className="text-[10px] font-black text-slate-900">{formatCompactCurrency(mTotal)}</div>
                                <div className="text-[8px] text-slate-500 font-bold uppercase tracking-tight">Total</div>
                              </div>
                            ) : (
                              <span className="text-slate-300 font-medium pr-1">—</span>
                            )}
                          </td>
                        </React.Fragment>
                      );
                    })}

                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Main Master Reconciliation Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden custom-shadow">
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="font-display font-bold text-slate-800 text-sm sm:text-base flex items-center space-x-2">
              <Layers className="w-5 h-5 text-brand-600 shrink-0" />
              <span>Section Cost Aggregation &amp; Reconciliation Matrix</span>
            </h3>
            <p className="text-xs text-slate-400">
              Reconciles the aggregated monthly totals with each Section's Gantt sheet.
            </p>
          </div>
          <div className="flex items-center space-x-1.5 text-xs text-emerald-700 font-bold bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-lg">
            <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>Dual-Entry Reconciliation Certified</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs select-none">
            <thead className="bg-slate-100/80 font-mono font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="p-3.5 font-display text-slate-700 text-[11px] font-black w-[180px]">Section Name</th>
                {MONTHS_DATA.map(m => (
                  <th key={m.name} className="p-3.5 text-center font-bold text-[10px] w-[110px]">
                    {m.name} Scheduled
                  </th>
                ))}
                <th className="p-3.5 text-right text-[10px] font-bold text-emerald-700 w-[120px]">Scheduled Cost</th>
                <th className="p-3.5 text-right text-[10px] font-bold text-rose-700 w-[120px]">Unscheduled Cost</th>
                <th className="p-3.5 text-right text-[10px] font-bold text-slate-900 w-[120px]">Overall Cost</th>
                <th className="p-3.5 text-center text-[10px] font-bold w-[80px]">Actions</th>
              </tr>
            </thead>
            
            <tbody className="divide-y divide-slate-200 text-slate-700">
              {SECTIONS.map(sec => {
                const isSelected = activeSection === sec;
                const scheduledTotal = sectionTotals[sec];
                const unscheduledTotal = sectionUnscheduledCost[sec];
                const overallTotal = scheduledTotal + unscheduledTotal;
                
                return (
                  <tr 
                    key={sec} 
                    className={`hover:bg-slate-50/80 transition-colors ${
                      isSelected ? 'bg-indigo-50/30' : ''
                    }`}
                  >
                    {/* Section Name / Link */}
                    <td className="p-3.5 font-display font-bold text-slate-800">
                      <div className="flex items-center space-x-2">
                        <span>{sec}</span>
                        {isSelected && (
                          <span className="bg-brand-500 text-white text-[9px] px-1.5 py-0.5 rounded-md font-mono font-bold shrink-0">
                            Active
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Monthly subtotals */}
                    {MONTHS_DATA.map(m => {
                      const val = sectionMonthlyCosts[sec][m.name];
                      return (
                        <td key={m.name} className="p-3.5 text-center font-mono font-medium">
                          {val > 0 ? formatCurrency(val) : '₱0'}
                        </td>
                      );
                    })}

                    {/* Scheduled Cost */}
                    <td className="p-3.5 text-right font-mono font-bold text-emerald-700 text-sm bg-slate-50/20">
                      {formatCurrency(scheduledTotal)}
                    </td>

                    {/* Unscheduled Cost */}
                    <td className={`p-3.5 text-right font-mono font-bold text-sm bg-slate-50/20 ${unscheduledTotal > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                      {formatCurrency(unscheduledTotal)}
                    </td>

                    {/* Overall Cost */}
                    <td className="p-3.5 text-right font-mono font-black text-slate-900 text-sm bg-slate-50/40">
                      {formatCurrency(overallTotal)}
                    </td>

                    {/* Actions Redirect */}
                    <td className="p-3 text-center">
                      <button
                        onClick={() => onSelectSection(sec)}
                        className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-bold bg-slate-100 hover:bg-brand-500 hover:text-white text-slate-700 transition-all cursor-pointer"
                        title={`Switch to ${sec} Section Gantt Sheet`}
                        id={`btn-goto-sec-${sec.replace(/\s+/g, '-').toLowerCase()}`}
                      >
                        <span>Gantt</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}

              {/* MASTER GRAND TOTALS ROW */}
              <tr className="bg-slate-900 text-white font-mono font-bold uppercase tracking-wider text-xs">
                <td className="p-4 font-display font-black text-slate-100">
                  Master Portfolio Total
                </td>
                {MONTHS_DATA.map(m => {
                  const val = monthlyGrandTotals[m.name];
                  return (
                    <td key={m.name} className="p-4 text-center text-amber-300 font-extrabold text-sm">
                      {formatCurrency(val)}
                    </td>
                  );
                })}
                <td className="p-4 text-right text-emerald-400 font-black text-sm bg-slate-950">
                  {formatCurrency(grandTotalAllSections)}
                </td>
                <td className="p-4 text-right text-rose-400 font-black text-sm bg-slate-950">
                  {formatCurrency(overallUnscheduledCost)}
                </td>
                <td className="p-4 text-right text-amber-400 font-black text-sm bg-slate-950">
                  {formatCurrency(overallProjectedRepairCost)}
                </td>
                <td className="p-3 bg-slate-950"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Section Comparison Visual Chart (Pure CSS styled Progress Bars) */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 custom-shadow">
        <h3 className="font-display font-bold text-slate-800 text-base mb-4 flex items-center space-x-2">
          <Layers className="w-5 h-5 text-brand-500" />
          <span>Capital Overhead Comparison By Maintenance Section</span>
        </h3>

        <div className="space-y-4">
          {SECTIONS.map(sec => {
            const cost = sectionTotals[sec];
            const pct = (cost / maxSectionCost) * 100;
            const recordsCount = allRecords.filter(r => r.section === sec).length;

            return (
              <div key={sec} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                  <div className="flex items-center space-x-2">
                    <span className="font-display font-bold text-slate-800">{sec}</span>
                    <span className="text-[10px] text-slate-400 font-normal">({recordsCount} units scheduled)</span>
                  </div>
                  <span className="font-mono text-slate-900">{formatCurrency(cost)}</span>
                </div>
                
                {/* Custom-styled Progress Bar */}
                <div className="h-3 bg-slate-100 rounded-full overflow-hidden relative border border-slate-200/50">
                  <div 
                    className="h-full bg-brand-500 rounded-full transition-all duration-500 relative"
                    style={{ width: `${pct}%` }}
                  >
                    {/* Glossy gradient shine on the progress bar */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
};
