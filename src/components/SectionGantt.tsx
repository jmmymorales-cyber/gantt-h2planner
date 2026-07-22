import React, { useState, useRef, useEffect } from 'react';
import { 
  ChevronDown, 
  ChevronRight, 
  Edit, 
  Trash2, 
  CalendarDays,
  ChevronLeft,
  Info,
  Calendar,
  AlertCircle,
  CheckCircle,
  HelpCircle,
  Download,
  Loader2
} from 'lucide-react';
import { EquipmentRecord, WeekColumn, SectionType, RepairStatus } from '../types';
import { 
  calculateWeeklyAllocation, 
  getRecordStatus,
  MONTHS_DATA,
  buildNormalizedRecord
} from '../data';
import { exportToExcel, exportToPDF, validateReconciliation } from '../utils/exportUtils';

interface SectionGanttProps {
  records: EquipmentRecord[];
  allRecords: EquipmentRecord[];
  activeFilters: {
    selectedProject: string;
    selectedType: string;
    searchPropertyNum: string;
    selectedMonth: string;
    selectedStatus: string;
  };
  selectedSection: SectionType;
  onEditRecord: (record: EquipmentRecord) => void;
  onDeleteRecord: (id: string) => void;
  weeks: WeekColumn[];
}

export const SectionGantt: React.FC<SectionGanttProps> = ({
  records,
  allRecords,
  activeFilters,
  selectedSection,
  onEditRecord,
  onDeleteRecord,
  weeks
}) => {
  // Collapsed state for projects
  const [collapsedProjects, setCollapsedProjects] = useState<{ [projName: string]: boolean }>({});

  // Tooltip tracking state
  const [tooltipData, setTooltipData] = useState<{
    record: EquipmentRecord;
    weekId?: string;
    x: number;
    y: number;
    bottom: number;
    left: number;
    right: number;
    width: number;
  } | null>(null);

  // Export tracking state
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [showDiagnosticPanel, setShowDiagnosticPanel] = useState(true);

  const triggerExport = async (type: 'current-excel' | 'current-pdf' | 'full-excel' | 'full-pdf') => {
    setExportStatus('Preparing Gantt export...');
    setIsExportDropdownOpen(false);
    
    // Small delay to let the UI render the loading spinner
    await new Promise(resolve => setTimeout(resolve, 300));

    try {
      // Determine dataset
      let targetRecords = records;
      let targetFilters = activeFilters;

      if (type.startsWith('full')) {
        // Full July-December includes all filters except the month filter
        targetRecords = allRecords.filter(r => {
          if (r.section !== selectedSection) return false;
          if (activeFilters.selectedProject !== 'All' && r.projectAllocation !== activeFilters.selectedProject) return false;
          if (activeFilters.selectedType !== 'All' && r.equipmentType !== activeFilters.selectedType) return false;
          if (activeFilters.selectedStatus !== 'All' && getRecordStatus(r) !== activeFilters.selectedStatus) return false;
          if (activeFilters.searchPropertyNum && !r.propertyNumber.toLowerCase().includes(activeFilters.searchPropertyNum.toLowerCase())) return false;
          return true;
        });
        targetFilters = { ...activeFilters, selectedMonth: 'All' };
      }

      // Run reconciliation validation check
      const validation = validateReconciliation(targetRecords, weeks);
      if (!validation.isValid) {
        console.warn('Export reconciliation check failed but proceeding:', validation.errors);
      }

      // Trigger export
      if (type === 'current-excel' || type === 'full-excel') {
        await exportToExcel({
          records: targetRecords,
          allRecords,
          selectedSection,
          isMaster: false,
          isFullExport: type.startsWith('full'),
          activeFilters: targetFilters,
          weeks
        });
      } else {
        await exportToPDF({
          records: targetRecords,
          allRecords,
          selectedSection,
          isMaster: false,
          isFullExport: type.startsWith('full'),
          activeFilters: targetFilters,
          weeks
        });
      }
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExportStatus(null);
    }
  };

  // Group records by project
  const projectsMap: { [projName: string]: EquipmentRecord[] } = {};
  records.forEach(r => {
    if (!projectsMap[r.projectAllocation]) {
      projectsMap[r.projectAllocation] = [];
    }
    projectsMap[r.projectAllocation].push(r);
  });

  const projectNames = Object.keys(projectsMap).sort();

  const toggleProject = (name: string) => {
    setCollapsedProjects(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      maximumFractionDigits: 0
    }).format(val);
  };

  const getStatusBadgeClass = (status: RepairStatus) => {
    switch (status) {
      case 'On Schedule': return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      case 'At Risk': return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'Delayed': return 'bg-rose-50 text-rose-800 border-rose-200';
      default: return 'bg-slate-50 text-slate-600 border-slate-200';
    }
  };

  const getStatusIcon = (status: RepairStatus) => {
    switch (status) {
      case 'On Schedule': return <CheckCircle className="w-3 h-3 text-emerald-600 shrink-0" />;
      case 'At Risk': return <AlertCircle className="w-3 h-3 text-amber-600 shrink-0" />;
      case 'Delayed': return <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />;
      default: return <HelpCircle className="w-3 h-3 text-slate-500 shrink-0" />;
    }
  };

  // Pre-calculate weekly allocations and normalized states
  const recordAllocations: { [recordId: string]: { [weekId: string]: number } } = {};
  const normalizedRecords: { [recordId: string]: any } = {};
  records.forEach(r => {
    const norm = buildNormalizedRecord(r, weeks);
    normalizedRecords[r.id] = norm;
    recordAllocations[r.id] = norm.weeklyAllocations;
  });

  // Calculate OVERALL Section totals
  const sectionWeeklyTotals: { [weekId: string]: number } = {};
  weeks.forEach(w => {
    sectionWeeklyTotals[w.id] = 0;
  });

  records.forEach(r => {
    const alloc = recordAllocations[r.id] || {};
    weeks.forEach(w => {
      sectionWeeklyTotals[w.id] += alloc[w.id] || 0;
    });
  });

  // Section Monthly Totals
  const sectionMonthlyTotals: { [monthName: string]: number } = {};
  MONTHS_DATA.forEach(m => {
    sectionMonthlyTotals[m.name] = 0;
    weeks.forEach(w => {
      if (w.monthName === m.name) {
        sectionMonthlyTotals[m.name] += sectionWeeklyTotals[w.id];
      }
    });
  });

  const sectionTotalSum = Object.values(sectionMonthlyTotals).reduce((a, b) => a + b, 0);

  // Calculate Section overall cost breakdowns
  let sectionUnscheduledCost = 0;
  let sectionScheduledCost = sectionTotalSum;
  
  records.forEach(r => {
    const norm = buildNormalizedRecord(r, weeks);
    if (norm.isUnscheduled) {
      sectionUnscheduledCost += norm.projectedRepairCost;
    }
  });
  
  const sectionOverallCost = sectionScheduledCost + sectionUnscheduledCost;

  // Mouse over Gantt Segment triggers tooltip
  const handleGanttMouseEnter = (
    e: React.MouseEvent,
    record: EquipmentRecord,
    weekId?: string
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipData({
      record,
      weekId,
      x: rect.left + rect.width / 2,
      y: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      width: rect.width
    });
  };

  const handleGanttMouseLeave = () => {
    setTooltipData(null);
  };

  // --- TIMELINE CONTROLS & SCROLLING ---
  const COLUMN_WIDTH = 100;
  const scrollContainerRef = useRef<HTMLDivElement>(null); // Points to Right Body for scrolling
  const leftBodyRef = useRef<HTMLDivElement>(null);
  const rightHeaderRef = useRef<HTMLDivElement>(null);
  const [currentMonthIdx, setCurrentMonthIdx] = useState(0);

  const scrollToMonthIndex = (idx: number) => {
    if (scrollContainerRef.current) {
      // Each month has exactly 5 weeks
      const targetScrollLeft = idx * 5 * COLUMN_WIDTH;
      scrollContainerRef.current.scrollTo({
        left: targetScrollLeft,
        behavior: 'smooth'
      });
      setCurrentMonthIdx(idx);
    }
  };

  const handlePrevMonth = () => {
    const nextIdx = Math.max(0, currentMonthIdx - 1);
    scrollToMonthIndex(nextIdx);
  };

  const handleNextMonth = () => {
    const nextIdx = Math.min(MONTHS_DATA.length - 1, currentMonthIdx + 1);
    scrollToMonthIndex(nextIdx);
  };

  const handleFitJulyDecember = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        left: 0,
        behavior: 'smooth'
      });
      setCurrentMonthIdx(0);
    }
  };

  const handleJumpToCurrentMonth = () => {
    // July is the current active month for local time in 2026-07
    scrollToMonthIndex(0);
  };

  // Synchronized scrolling for Right Body
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (leftBodyRef.current) {
      leftBodyRef.current.scrollTop = target.scrollTop;
    }
    if (rightHeaderRef.current) {
      rightHeaderRef.current.scrollLeft = target.scrollLeft;
    }

    // Map scrollLeft to month index
    const scrollLeft = target.scrollLeft;
    const monthWidth = 5 * COLUMN_WIDTH;
    const idx = Math.min(
      MONTHS_DATA.length - 1,
      Math.max(0, Math.round(scrollLeft / monthWidth))
    );
    if (idx !== currentMonthIdx) {
      setCurrentMonthIdx(idx);
    }
  };

  // Forward vertical scrolling on Left Body to the Right Body scroll container
  const handleLeftBodyWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop += e.deltaY;
    }
  };

  // Reset scroll to start on section swap
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = 0;
      setCurrentMonthIdx(0);
    }
  }, [selectedSection]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden custom-shadow relative flex flex-col">
      
      {/* 1. Header Toolbar for Navigation */}
      <div className="flex flex-wrap items-center justify-between p-4 bg-slate-50 border-b border-slate-200 gap-4">
        <div className="flex items-center space-x-2">
          <Calendar className="w-4 h-4 text-brand-600" />
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Scroll Timeline:
          </span>
          <div className="bg-white rounded-lg border border-slate-200 p-0.5 flex items-center space-x-0.5 shadow-2xs">
            <button
              onClick={handlePrevMonth}
              disabled={currentMonthIdx === 0}
              className="px-2 py-1 text-xs font-semibold rounded hover:bg-slate-100 text-slate-700 disabled:opacity-40 cursor-pointer"
              title="Previous Month"
            >
              &larr; Prev
            </button>
            
            {MONTHS_DATA.map((m, idx) => (
              <button
                key={m.name}
                onClick={() => scrollToMonthIndex(idx)}
                className={`px-2.5 py-1 text-xs font-bold rounded cursor-pointer transition-all ${
                  currentMonthIdx === idx 
                    ? 'bg-brand-500 text-white shadow-sm' 
                    : 'hover:bg-slate-100 text-slate-600'
                }`}
              >
                {m.name.substring(0, 3)}
              </button>
            ))}

            <button
              onClick={handleNextMonth}
              disabled={currentMonthIdx === MONTHS_DATA.length - 1}
              className="px-2 py-1 text-xs font-semibold rounded hover:bg-slate-100 text-slate-700 disabled:opacity-40 cursor-pointer"
              title="Next Month"
            >
              Next &rarr;
            </button>
          </div>
        </div>

        <div className="flex items-center space-x-2 relative">
          <button
            onClick={handleFitJulyDecember}
            className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 rounded-lg cursor-pointer shadow-xs transition-colors"
          >
            Fit July–December
          </button>
          <button
            onClick={handleJumpToCurrentMonth}
            className="px-3 py-1.5 bg-brand-50 hover:bg-brand-100 border border-brand-200 text-xs font-bold text-brand-800 rounded-lg cursor-pointer shadow-xs transition-colors"
          >
            Jump to July (Current)
          </button>

          {/* Export Gantt Button and Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsExportDropdownOpen(!isExportDropdownOpen)}
              disabled={exportStatus !== null}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg cursor-pointer shadow-xs transition-all disabled:opacity-50 h-[34px]"
              id="btn-export-gantt"
            >
              {exportStatus ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Report</span>
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

      {/* 1.5. Diagnostic Reconciliation & Test Harness */}
      {showDiagnosticPanel && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-6 shadow-md text-slate-100 font-sans">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
            <div className="flex items-center space-x-2">
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <h4 className="font-display font-bold text-sm text-slate-200">
                Shared Gantt Engine Diagnostic Reconciliation &amp; Test Harness
              </h4>
            </div>
            <button 
              onClick={() => setShowDiagnosticPanel(false)}
              className="text-slate-400 hover:text-white text-xs font-mono font-bold hover:bg-slate-800 px-2.5 py-1 rounded-md transition-colors"
            >
              Hide Panel [×]
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {['CR-174', 'CR-232', 'CR-154', 'CR-171', 'CR-203', 'CR-193'].map(code => {
              const record = allRecords.find(r => r.propertyNumber === code);
              if (!record) {
                return (
                  <div key={code} className="bg-slate-950/60 rounded-lg p-3 border border-dashed border-slate-800/80 flex items-center justify-between">
                    <span className="font-mono text-xs font-black text-slate-500">{code}</span>
                    <span className="text-[10px] text-slate-500 italic">Not in current dataset</span>
                  </div>
                );
              }

              const norm = buildNormalizedRecord(record, weeks);
              const activeCount = Object.values(norm.activeWeeks).filter(Boolean).length;
              
              // Calculate sum of weekly allocations in active timeline
              const timelineAllocSum = Object.values(norm.weeklyAllocations).reduce((sum, val) => sum + val, 0);
              const totalAllocSum = Number((timelineAllocSum + norm.preJulyAllocation + norm.postDecemberAllocation).toFixed(2));
              
              // Check if math reconciles perfectly
              const isMatch = Math.abs(totalAllocSum - norm.projectedRepairCost) <= 0.01;
              const isPass = norm.isValid && isMatch;

              return (
                <div key={code} className={`rounded-lg p-3 border text-[10px] leading-relaxed transition-all ${
                  isPass 
                    ? 'bg-slate-950/80 border-slate-800/60 hover:border-emerald-950/50' 
                    : 'bg-rose-950/10 border-rose-900/30'
                }`}>
                  <div className="flex items-center justify-between border-b border-slate-800/60 pb-1.5 mb-1.5">
                    <div className="flex items-center space-x-1.5">
                      <span className="font-mono font-black text-amber-400 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/15">
                        {code}
                      </span>
                      <span className="text-slate-400 font-medium truncate max-w-[120px]" title={record.equipmentType}>
                        {record.equipmentType}
                      </span>
                    </div>
                    <span className={`font-mono text-[9px] font-black px-2 py-0.5 rounded-full ${
                      isPass 
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    }`}>
                      {isPass ? 'PASS' : 'FAIL'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[9.5px]">
                    <div>
                      <span className="text-slate-500">Start:</span>{' '}
                      <span className="text-emerald-400">{norm.startOfRepair || 'Unscheduled'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Target:</span>{' '}
                      <span className="text-indigo-400">{norm.targetCompletion || 'Unscheduled'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Proj Cost:</span>{' '}
                      <span className="text-slate-200">{formatCurrency(norm.projectedRepairCost).replace('PHP', '₱')}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Active Wks:</span>{' '}
                      <span className="text-amber-400 font-bold">{activeCount} wks</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Overlap Days:</span>{' '}
                      <span className="text-amber-300">{norm.totalRepairDays - norm.preJulyDays - norm.postDecemberDays} days</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Timeline Alloc:</span>{' '}
                      <span className="text-slate-300">{formatCurrency(timelineAllocSum).replace('PHP', '₱')}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Alloc Sum:</span>{' '}
                      <span className="text-emerald-300 font-bold">{formatCurrency(totalAllocSum).replace('PHP', '₱')}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Bar Span:</span>{' '}
                      <span className="text-slate-400">
                        {norm.isUnscheduled ? 'None' : `W${norm.barStartIdx + 1} - W${norm.barEndIdx + 1}`}
                      </span>
                    </div>
                  </div>

                  {norm.errors.length > 0 && (
                    <div className="mt-1.5 pt-1.5 border-t border-slate-800/40 text-rose-400 font-mono text-[8.5px] leading-tight space-y-0.5">
                      {norm.errors.map((err, idx) => (
                        <div key={idx}>• {err}</div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. Scrollable Table Frame */}
      <div 
        className="overflow-auto max-h-[72vh] relative" 
        id="gantt-scroll-container"
        ref={scrollContainerRef}
        onScroll={handleScroll}
        style={{ containerType: 'inline-size' }}
      >
        <table className="min-w-max border-collapse text-left select-none table-fixed">
          <colgroup>
            <col style={{ width: '45cqw', minWidth: '320px', maxWidth: '45cqw' }} />
            {weeks.map(w => (
              <col key={w.id} style={{ width: '100px', minWidth: '100px', maxWidth: '100px' }} />
            ))}
          </colgroup>
          
          {/* Header Rows */}
          <thead className="text-xs font-mono font-bold uppercase tracking-wider text-slate-500 bg-slate-50 border-b border-slate-200">
            {/* MONTH ROW */}
            <tr className="sticky top-0 z-30 bg-slate-100 border-b border-slate-200">
              {/* Frozen left header spacer */}
              <th 
                className="sticky left-0 top-0 z-40 bg-slate-100 border-r-2 border-slate-400 p-3 text-brand-700 font-display font-black text-xs h-[44px] overflow-hidden"
                style={{ width: '45cqw', minWidth: '320px', maxWidth: '45cqw' }}
              >
                Equipment Planning &amp; Details
              </th>
              {MONTHS_DATA.map((m, idx) => {
                const isCurrent = currentMonthIdx === idx;
                const colors = [
                  'bg-brand-600 text-white border-l border-brand-700',
                  'bg-brand-500 text-white border-l border-brand-600',
                  'bg-slate-800 text-white border-l border-slate-900',
                  'bg-slate-700 text-white border-l border-slate-800',
                  'bg-slate-600 text-white border-l border-slate-700',
                  'bg-slate-500 text-white border-l border-slate-600'
                ];
                return (
                  <th
                    key={m.name}
                    colSpan={5}
                    className={`sticky top-0 z-30 h-[44px] p-2.5 text-center text-[11px] font-bold tracking-widest uppercase border-r border-slate-350 relative transition-all duration-200 ${
                      isCurrent 
                        ? 'bg-amber-500 text-slate-950 font-black border-y border-amber-400 border-r-2 shadow-xs' 
                        : colors[idx % colors.length]
                    }`}
                  >
                    {isCurrent && (
                      <span className="absolute top-0.5 left-1/2 transform -translate-x-1/2 text-[7.5px] bg-slate-950 text-amber-400 px-1.5 py-0.2 rounded font-black tracking-widest uppercase">
                        ACTIVE MONTH VIEW
                      </span>
                    )}
                    <span className={isCurrent ? 'pt-1 inline-block' : ''}>{m.name}</span>
                  </th>
                );
              })}
            </tr>

            {/* WEEK ROW */}
            <tr className="sticky top-[44px] z-30 bg-slate-50 border-b border-slate-200">
              {/* Compact fixed column titles in Left Side */}
              <th 
                className="sticky left-0 top-[44px] z-40 bg-slate-50 border-r-2 border-slate-400 px-3 py-2 overflow-hidden"
                style={{ width: '45cqw', minWidth: '320px', maxWidth: '45cqw' }}
              >
                <div className="grid grid-cols-[1.2fr_0.9fr_1.1fr_0.9fr_0.9fr_1.1fr_1.1fr] gap-1 text-[10px] text-slate-600 font-bold tracking-wider">
                  <div>Equipment Type</div>
                  <div>Property / Unit</div>
                  <div>Project Allocation</div>
                  <div>Start Repair</div>
                  <div>Target Comp</div>
                  <div className="text-right">Projected Cost</div>
                  <div className="text-center">Status</div>
                </div>
              </th>

              {/* Individual weeks */}
              {weeks.map(w => (
                <th
                  key={w.id}
                  className="sticky top-[44px] z-30 p-1 text-center min-w-[100px] w-[100px] border-r border-slate-200 bg-slate-50/90 text-[10px] leading-tight"
                >
                  <div className="font-extrabold text-slate-800">{w.label}</div>
                  <div className="text-[9px] text-slate-400 font-normal">{w.dateRangeText}</div>
                </th>
              ))}
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="text-xs">
            {projectNames.map(projName => {
              const projRecords = projectsMap[projName];
              const isCollapsed = !!collapsedProjects[projName];

              // Aggregates for project header
              let projScheduledCost = 0;
              let projUnscheduledCost = 0;
              projRecords.forEach(r => {
                const norm = buildNormalizedRecord(r, weeks);
                if (norm.isUnscheduled) {
                  projUnscheduledCost += norm.projectedRepairCost;
                } else {
                  projScheduledCost += norm.projectedRepairCost;
                }
              });

              const projTotalCost = projScheduledCost + projUnscheduledCost;
              const projUnitCount = projRecords.length;

              // Project-level weekly subtotals
              const projWeeklyTotals: { [weekId: string]: number } = {};
              weeks.forEach(w => {
                projWeeklyTotals[w.id] = 0;
              });
              projRecords.forEach(r => {
                const alloc = recordAllocations[r.id] || {};
                weeks.forEach(w => {
                  projWeeklyTotals[w.id] += alloc[w.id] || 0;
                });
              });

              return (
                <React.Fragment key={projName}>
                  
                  {/* PROJECT ROW (Collapsible Header) */}
                  <tr className="bg-indigo-50/80 hover:bg-indigo-100/90 font-semibold text-slate-800 border-b border-slate-200 transition-colors duration-100">
                    <td 
                      className="sticky left-0 z-20 bg-indigo-50/90 border-r-2 border-slate-400 p-2 overflow-hidden"
                      style={{ width: '45cqw', minWidth: '320px', maxWidth: '45cqw' }}
                    >
                      <div className="flex items-center justify-between">
                        <button
                          onClick={() => toggleProject(projName)}
                          className="flex items-center space-x-1.5 text-left text-brand-700 font-bold focus:outline-none shrink-0"
                          id={`btn-collapse-proj-${projName.replace(/\s+/g, '-').toLowerCase()}`}
                        >
                          {isCollapsed ? (
                            <ChevronRight className="w-4 h-4 text-brand-500 cursor-pointer" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-brand-500 cursor-pointer" />
                          )}
                          <span className="truncate max-w-[190px] font-display text-xs" title={projName}>
                            {projName}
                          </span>
                        </button>
                        <div className="flex items-center space-x-1.5 shrink-0">
                          <span className="text-[9px] bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded-full font-mono font-bold">
                            {projUnitCount} {projUnitCount === 1 ? 'Unit' : 'Units'}
                          </span>
                          {projUnscheduledCost > 0 && (
                            <span className="text-[9px] bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded-md font-mono font-bold" title="Unscheduled Project Cost">
                              U: {formatCurrency(projUnscheduledCost).replace('PHP', '₱')}
                            </span>
                          )}
                          <span className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-md font-mono font-bold" title="Scheduled Project Cost">
                            S: {formatCurrency(projScheduledCost).replace('PHP', '₱')}
                          </span>
                          <span className="text-[9px] bg-brand-600 text-white px-1.5 py-0.5 rounded-md font-mono font-bold" title="Overall Project Cost">
                            Total: {formatCurrency(projTotalCost).replace('PHP', '₱')}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Weekly Cost Subtotals inside Project Header Row */}
                    {weeks.map(w => {
                      const val = projWeeklyTotals[w.id];
                      return (
                        <td
                          key={w.id}
                          className="border-r border-slate-200 p-1.5 text-right font-mono font-extrabold text-[10px] bg-indigo-50 text-brand-700 relative z-20"
                        >
                          {val > 0 ? formatCurrency(val).replace('PHP', '₱') : ''}
                        </td>
                      );
                    })}
                  </tr>

                  {/* EQUIPMENT RECORDS (Only if not collapsed) */}
                  {!isCollapsed && (
                    <>
                      {projRecords.map(record => {
                        const totalCost = record.projectedRepairCost || 0;
                        const status = getRecordStatus(record);
                        const alloc = recordAllocations[record.id] || {};

                        // Find week index span for Gantt bar (retrieved directly from normalized calculation engine)
                        const norm = normalizedRecords[record.id];
                        const firstOverlapIdx = norm.isUnscheduled ? -1 : norm.barStartIdx;
                        const lastOverlapIdx = norm.isUnscheduled ? -1 : norm.barEndIdx;

                        return (
                          <tr 
                            key={record.id} 
                            className="hover:bg-slate-50/80 border-b border-slate-100 h-[48px] transition-colors duration-100"
                          >
                            {/* Left Pinned compact columns inside single sticky cell */}
                            <td 
                              className="sticky left-0 z-20 bg-white border-r-2 border-slate-400 p-2 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] overflow-hidden"
                              style={{ width: '45cqw', minWidth: '320px', maxWidth: '45cqw' }}
                            >
                              <div className="grid grid-cols-[1.2fr_0.9fr_1.1fr_0.9fr_0.9fr_1.1fr_1.1fr] gap-1 items-center font-sans text-xs">
                                
                                {/* 1. Equipment Type */}
                                <div className="truncate font-semibold text-slate-700" title={record.equipmentType}>
                                  {record.equipmentType}
                                </div>

                                {/* 2. Property Number / Unit */}
                                <div className="font-mono font-black text-brand-600 bg-brand-50 px-2 py-0.5 rounded border border-brand-100 text-center truncate">
                                  {record.propertyNumber}
                                </div>

                                {/* 3. Project Allocation (Truncated with Ellipsis, hover shows full) */}
                                <div className="truncate text-slate-500 font-medium cursor-help" title={record.projectAllocation}>
                                  {record.projectAllocation}
                                </div>

                                {/* 4. Start of Repair */}
                                <div className="font-mono text-slate-600">
                                  {record.startOfRepair ? new Date(record.startOfRepair).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                                </div>

                                {/* 5. Target Completion */}
                                <div className="font-mono text-indigo-700 font-semibold bg-indigo-50/80 px-1 py-0.5 rounded text-center">
                                  {record.targetCompletion ? new Date(record.targetCompletion).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                                </div>

                                {/* 6. Projected Cost */}
                                <div className="font-mono font-bold text-right text-slate-900 pr-1">
                                  {formatCurrency(totalCost).replace('PHP', '₱')}
                                </div>

                                {/* 7. Status & Quick Actions */}
                                <div className="flex items-center justify-between pr-0.5 min-w-0">
                                  <div className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold border flex items-center space-x-1 ${getStatusBadgeClass(status)} truncate`} title={status}>
                                    {getStatusIcon(status)}
                                    <span className="truncate">{status.replace(' Schedule', '')}</span>
                                  </div>
                                  <div className="flex items-center space-x-0.5 shrink-0 ml-1">
                                    <button
                                      onClick={() => onEditRecord(record)}
                                      className="text-slate-400 hover:text-brand-600 p-0.5 rounded transition-colors cursor-pointer"
                                      title="Edit Record"
                                      id={`btn-edit-${record.id}`}
                                    >
                                      <Edit className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={() => onDeleteRecord(record.id)}
                                      className="text-slate-400 hover:text-rose-600 p-0.5 rounded transition-colors cursor-pointer"
                                      title="Delete Record"
                                      id={`btn-delete-${record.id}`}
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>

                              </div>
                            </td>

                            {/* Timeline weekly cells */}
                            {weeks.map((w, idx) => {
                              const amount = alloc[w.id] || 0;
                              const isWithinGantt = firstOverlapIdx !== -1 && lastOverlapIdx !== -1 && idx >= firstOverlapIdx && idx <= lastOverlapIdx;

                              // Style colors for Gantt bar depending on record status
                              let barBg = 'bg-slate-500 border-slate-600';
                              if (status === 'On Schedule') barBg = 'bg-emerald-600 border-emerald-700 text-white shadow-xs';
                              if (status === 'At Risk') barBg = 'bg-amber-500 border-amber-600 text-white shadow-xs';
                              if (status === 'Delayed') barBg = 'bg-rose-600 border-rose-700 text-white shadow-xs';

                              return (
                                <td
                                  key={w.id}
                                  className="p-0 text-center min-w-[100px] w-[100px] border-r border-slate-200 h-[48px] select-none"
                                >
                                  <div className="relative w-full h-full flex items-center justify-center">
                                    {/* Render SINGLE continuous Gantt bar spanning from first cell */}
                                    {isWithinGantt && idx === firstOverlapIdx ? (
                                      <div
                                        className={`absolute top-1/2 -translate-y-1/2 h-[22px] rounded-lg px-2 flex items-center justify-between text-[10px] font-bold z-10 border ${barBg} cursor-help transition-all duration-200`}
                                        style={{
                                          left: '4px',
                                          width: `${((lastOverlapIdx - firstOverlapIdx + 1) * COLUMN_WIDTH) - 8}px`
                                        }}
                                        onMouseEnter={(e) => handleGanttMouseEnter(e, record, w.id)}
                                        onMouseLeave={handleGanttMouseLeave}
                                      >
                                        <span className="truncate">{record.propertyNumber}</span>
                                        <span className="shrink-0 font-mono text-[9px] bg-black/15 px-1 py-0.5 rounded ml-1">
                                          {formatCurrency(totalCost).replace('PHP', '₱')}
                                        </span>
                                      </div>
                                    ) : null}

                                    {/* Weekly Cost printed in the cell below the Gantt bar area */}
                                    <div className="absolute bottom-0.5 left-0 right-0 text-center font-mono text-[9px] text-slate-400 font-semibold leading-none">
                                      {amount > 0 && record.startOfRepair && record.targetCompletion ? formatCurrency(amount).replace('PHP', '₱') : ''}
                                    </div>
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}

                      {/* PROJECT WEEKLY SUMMARY ROW */}
                      <tr className="bg-slate-50 border-b border-slate-200 font-mono text-[10px]">
                        <td 
                          className="sticky left-0 z-20 bg-slate-50 border-r-2 border-slate-400 p-2 overflow-hidden"
                          style={{ width: '45cqw', minWidth: '320px', maxWidth: '45cqw' }}
                        >
                          <div className="grid grid-cols-[1.2fr_0.9fr_1.1fr_0.9fr_0.9fr_1.1fr_1.1fr] gap-1 items-center">
                            <div className="col-span-5 text-right uppercase tracking-wider font-bold text-slate-500 pr-2">
                              Scheduled Weekly Subtotal
                            </div>
                            <div className="text-right font-bold text-slate-700">
                              {formatCurrency(projScheduledCost).replace('PHP', '₱')}
                            </div>
                            <div></div>
                          </div>
                        </td>
                        {weeks.map(w => {
                          const val = projWeeklyTotals[w.id];
                          return (
                            <td
                              key={w.id}
                              className="border-r border-slate-200 p-1.5 text-right font-bold text-slate-600 bg-slate-50 relative z-20"
                            >
                              {val > 0 ? formatCurrency(val).replace('PHP', '₱') : '—'}
                            </td>
                          );
                        })}
                      </tr>

                      {/* PROJECT MONTHLY SUMMARY ROW */}
                      <tr className="bg-slate-100/50 border-b border-slate-200 font-mono text-[10px]">
                        <td 
                          className="sticky left-0 z-20 bg-slate-50 border-r-2 border-slate-400 p-2 overflow-hidden"
                          style={{ width: '45cqw', minWidth: '320px', maxWidth: '45cqw' }}
                        >
                          <div className="grid grid-cols-[1.2fr_0.9fr_1.1fr_0.9fr_0.9fr_1.1fr_1.1fr] gap-1 items-center">
                            <div className="col-span-5 text-right uppercase tracking-wider font-bold text-slate-500 pr-2">
                              Scheduled Monthly Subtotal
                            </div>
                            <div className="text-right font-extrabold text-slate-800">
                              {formatCurrency(projScheduledCost).replace('PHP', '₱')}
                            </div>
                            <div></div>
                          </div>
                        </td>
                        {MONTHS_DATA.map(m => {
                          let monthSum = 0;
                          weeks.forEach(w => {
                            if (w.monthName === m.name) {
                              monthSum += projWeeklyTotals[w.id];
                            }
                          });

                          return (
                            <td
                              key={m.name}
                              colSpan={5}
                              className="border-r border-slate-200 p-1.5 text-center font-extrabold text-slate-700 bg-slate-100 relative z-20"
                            >
                              <div className="flex items-center justify-center space-x-1">
                                <span className="text-[9px] uppercase tracking-wider text-slate-400">{m.name}:</span>
                                <span className="text-indigo-800 font-bold">{monthSum > 0 ? formatCurrency(monthSum) : '₱0'}</span>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    </>
                  )}

                </React.Fragment>
              );
            })}

            {/* If no records */}
            {records.length === 0 && (
              <tr>
                <td colSpan={31} className="p-10 text-center text-slate-400 bg-slate-50">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <CalendarDays className="w-10 h-10 text-slate-300" />
                    <p className="font-display font-medium text-sm">No equipment records match your current filters.</p>
                    <p className="text-xs">Try selecting a different filter option or clear searches to view records.</p>
                  </div>
                </td>
              </tr>
            )}

            {/* --- SECTION WIDE GRAND TOTALS --- */}
            {records.length > 0 && (
              <>
                {/* SECTION WEEKLY COST TOTALS */}
                <tr className="bg-slate-800 text-white font-mono text-[10px] uppercase font-bold tracking-wider border-t-2 border-slate-500">
                  <td 
                    className="sticky left-0 z-20 bg-slate-800 border-r-2 border-slate-650 p-3 overflow-hidden"
                    style={{ width: '45cqw', minWidth: '320px', maxWidth: '45cqw' }}
                  >
                    <div className="grid grid-cols-[1.2fr_0.9fr_1.1fr_0.9fr_0.9fr_1.1fr_1.1fr] gap-1 items-center">
                      <div className="col-span-5 text-right text-slate-300 pr-2 text-xs font-display font-bold">
                        Scheduled Weekly Total ({selectedSection})
                      </div>
                      <div className="text-right text-amber-400 font-bold text-xs font-mono">
                        {formatCurrency(sectionScheduledCost)}
                      </div>
                      <div></div>
                    </div>
                  </td>
                  {weeks.map(w => {
                    const val = sectionWeeklyTotals[w.id];
                    return (
                      <td
                        key={w.id}
                        className="p-2 text-right border-r border-slate-700 text-amber-300 text-xs font-extrabold bg-slate-800 relative z-20"
                      >
                        {val > 0 ? formatCurrency(val).replace('PHP', '₱') : '—'}
                      </td>
                    );
                  })}
                </tr>

                {/* SECTION MONTHLY COST TOTALS */}
                <tr className="bg-slate-900 text-white font-mono text-[10px] uppercase font-bold tracking-wider">
                  <td 
                    className="sticky left-0 z-20 bg-slate-900 border-r-2 border-slate-750 p-3 overflow-hidden"
                    style={{ width: '45cqw', minWidth: '320px', maxWidth: '45cqw' }}
                  >
                    <div className="grid grid-cols-[1.2fr_0.9fr_1.1fr_0.9fr_0.9fr_1.1fr_1.1fr] gap-1 items-center">
                      <div className="col-span-5 text-right text-slate-300 pr-2 text-xs font-display font-bold">
                        Scheduled Monthly Total ({selectedSection})
                      </div>
                      <div className="text-right text-amber-400 font-black text-xs font-mono">
                        {formatCurrency(sectionScheduledCost)}
                      </div>
                      <div></div>
                    </div>
                  </td>
                  {MONTHS_DATA.map(m => {
                    const val = sectionMonthlyTotals[m.name];
                    return (
                      <td
                        key={m.name}
                        colSpan={5}
                        className="p-2 text-center border-r border-slate-800 text-amber-400 text-xs font-extrabold bg-slate-900 relative z-20"
                      >
                        <div className="flex items-center justify-center space-x-1">
                          <span className="text-[10px] font-medium uppercase tracking-widest text-slate-400">{m.name}:</span>
                          <span className="font-mono text-xs font-black">{formatCurrency(val)}</span>
                        </div>
                      </td>
                    );
                  })}
                </tr>

                {/* SECTION UNSCHEDULED & OVERALL COSTS SUMMARY */}
                {sectionUnscheduledCost > 0 && (
                  <tr className="bg-slate-950 text-white font-mono text-[10px] uppercase font-bold tracking-wider border-t border-slate-800">
                    <td 
                      className="sticky left-0 z-20 bg-slate-900 border-r-2 border-slate-750 p-3 overflow-hidden"
                      style={{ width: '45cqw', minWidth: '320px', maxWidth: '45cqw' }}
                      colSpan={1}
                    >
                      <div className="grid grid-cols-[1.2fr_0.9fr_1.1fr_0.9fr_0.9fr_1.1fr_1.1fr] gap-1 items-center">
                        <div className="col-span-5 text-right text-rose-300 pr-2 text-xs font-display font-bold">
                          Unscheduled Section Cost
                        </div>
                        <div className="text-right text-rose-400 font-bold text-xs font-mono">
                          {formatCurrency(sectionUnscheduledCost)}
                        </div>
                        <div></div>
                      </div>
                    </td>
                    <td colSpan={weeks.length} className="bg-slate-900 text-slate-400 text-[10px] p-3 text-left font-sans italic">
                      This represents maintenance items that are currently pending a finalized scheduling timeline.
                    </td>
                  </tr>
                )}

                <tr className="bg-slate-950 text-white font-mono text-[10px] uppercase font-bold tracking-wider border-t border-slate-700">
                  <td 
                    className="sticky left-0 z-20 bg-slate-950 border-r-2 border-slate-800 p-3 overflow-hidden"
                    style={{ width: '45cqw', minWidth: '320px', maxWidth: '45cqw' }}
                    colSpan={1}
                  >
                    <div className="grid grid-cols-[1.2fr_0.9fr_1.1fr_0.9fr_0.9fr_1.1fr_1.1fr] gap-1 items-center">
                      <div className="col-span-5 text-right text-amber-400 pr-2 text-xs font-display font-bold">
                        Overall Projected Cost
                      </div>
                      <div className="text-right text-emerald-400 font-black text-xs font-mono">
                        {formatCurrency(sectionOverallCost)}
                      </div>
                      <div></div>
                    </div>
                  </td>
                  <td colSpan={weeks.length} className="bg-slate-950 text-emerald-400 text-[10px] p-3 text-left font-display font-bold tracking-wide">
                    Total Section Valuation: {formatCurrency(sectionOverallCost)} (Scheduled: {formatCurrency(sectionScheduledCost)} | Unscheduled: {formatCurrency(sectionUnscheduledCost)})
                  </td>
                </tr>
              </>
            )}

          </tbody>
        </table>
      </div>

      {/* 3. Floating Portal Tooltip for detailed Gantt record hover information */}
      {tooltipData && (
        <div
          className="fixed z-50 pointer-events-none p-4 rounded-xl bg-slate-900 text-slate-100 shadow-2xl border border-slate-800 w-80 font-sans custom-shadow animate-fade-in"
          style={{
            left: `${Math.max(16, Math.min(tooltipData.x - 160, window.innerWidth - 336))}px`,
            top: `${Math.max(16, tooltipData.y - 180)}px`,
          }}
        >
          {/* Arrow */}
          <div className="absolute bottom-[-6px] left-1/2 transform -translate-x-1/2 w-3 h-3 bg-slate-900 rotate-45 border-r border-b border-slate-800"></div>

          {/* Title block */}
          <div className="border-b border-slate-800 pb-2 mb-2">
            <div className="flex items-center justify-between">
              <span className="font-mono font-black text-amber-400 text-xs bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                {tooltipData.record.propertyNumber}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${getStatusBadgeClass(getRecordStatus(tooltipData.record))}`}>
                {getRecordStatus(tooltipData.record)}
              </span>
            </div>
            <h5 className="font-display font-bold text-xs text-white mt-1.5 leading-tight">
              {tooltipData.record.equipmentType}
            </h5>
            <p className="text-[10px] text-slate-400 italic mt-0.5 leading-tight">
              {tooltipData.record.repairScope || 'No repair scope defined'}
            </p>
          </div>

          {/* Information list */}
          <div className="space-y-1.5 text-[10px] text-slate-300">
            <div className="flex justify-between">
              <span className="text-slate-400">Project Allocation:</span>
              <span className="font-medium text-white truncate max-w-[170px]" title={tooltipData.record.projectAllocation}>
                {tooltipData.record.projectAllocation}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Date Needed:</span>
              <span className="font-mono text-white">
                {tooltipData.record.dateNeeded ? new Date(tooltipData.record.dateNeeded).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Commitment Date:</span>
              <span className="font-mono text-slate-200">
                {tooltipData.record.commitmentDate ? new Date(tooltipData.record.commitmentDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Start of Repair:</span>
              <span className="font-mono text-emerald-400">
                {tooltipData.record.startOfRepair ? new Date(tooltipData.record.startOfRepair).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Target Completion:</span>
              <span className="font-mono text-indigo-300 font-semibold">
                {tooltipData.record.targetCompletion ? new Date(tooltipData.record.targetCompletion).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A'}
              </span>
            </div>

            {/* Costs */}
            <div className="border-t border-slate-800/80 pt-1.5 mt-1.5 flex items-center justify-between">
              <span className="text-slate-400">Projected Repair Cost:</span>
              <span className="font-mono font-bold text-amber-400">
                {formatCurrency(tooltipData.record.projectedRepairCost)}
              </span>
            </div>

            {/* Current Week Allocation Highlight */}
            {tooltipData.weekId && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded p-1.5 mt-2 flex items-center justify-between text-amber-300">
                <span>Week Allocation:</span>
                <span className="font-mono font-bold">
                  {formatCurrency(recordAllocations[tooltipData.record.id]?.[tooltipData.weekId] || 0)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};
