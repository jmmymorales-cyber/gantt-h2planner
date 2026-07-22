import React from 'react';
import { Search, SlidersHorizontal, Plus, RotateCcw, Filter, FileText } from 'lucide-react';
import { SectionType, RepairStatus } from '../types';
import { SECTIONS, MONTHS_DATA } from '../data';

interface FiltersPanelProps {
  // Current filters
  selectedSection: SectionType;
  setSelectedSection: (sec: SectionType) => void;
  
  searchPropertyNum: string;
  setSearchPropertyNum: (val: string) => void;
  
  selectedProject: string;
  setSelectedProject: (proj: string) => void;
  
  selectedType: string;
  setSelectedType: (type: string) => void;
  
  selectedMonth: string; // "All" or Month Name
  setSelectedMonth: (m: string) => void;
  
  selectedStatus: string; // "All" or RepairStatus
  setSelectedStatus: (status: string) => void;

  // Options
  projectsList: string[];
  typesList: string[];
  
  // Handlers
  onAddEquipment: () => void;
  onResetFilters: () => void;
  onResetToDefault: () => void;
  
  // Total stats for current view
  filteredCount: number;
  totalSectionCount: number;
  sectionTotalCost: number;
}

export const FiltersPanel: React.FC<FiltersPanelProps> = ({
  selectedSection,
  setSelectedSection,
  searchPropertyNum,
  setSearchPropertyNum,
  selectedProject,
  setSelectedProject,
  selectedType,
  setSelectedType,
  selectedMonth,
  setSelectedMonth,
  selectedStatus,
  setSelectedStatus,
  
  projectsList,
  typesList,
  
  onAddEquipment,
  onResetFilters,
  onResetToDefault,
  
  filteredCount,
  totalSectionCount,
  sectionTotalCost
}) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5 mb-6 animate-fade-in custom-shadow">
      {/* 1. Large Section Switcher Tabs */}
      <div className="mb-5">
        <label className="block text-xs font-mono font-bold uppercase tracking-wider text-slate-500 mb-2">
          Select Maintenance Section
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {SECTIONS.map((sec) => {
            const isActive = selectedSection === sec;
            return (
              <button
                key={sec}
                onClick={() => setSelectedSection(sec)}
                className={`px-4 py-3 rounded-lg text-left transition-all duration-150 relative overflow-hidden ${
                  isActive
                    ? 'bg-brand-500 text-white shadow-md ring-2 ring-brand-200 font-semibold'
                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200/80 hover:border-slate-300'
                }`}
                id={`btn-sec-${sec.replace(/\s+/g, '-').toLowerCase()}`}
              >
                {/* Visual marker inside active tab */}
                {isActive && (
                  <span className="absolute top-0 right-0 h-full w-1 bg-amber-400"></span>
                )}
                <div className="text-[10px] font-mono opacity-80 uppercase tracking-widest font-bold">
                  Section
                </div>
                <div className="text-sm font-display font-bold leading-tight mt-0.5 truncate">
                  {sec}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-slate-100 my-4"></div>

      {/* 2. Grid of Interactive Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Project Allocation Filter */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center space-x-1">
            <Filter className="w-3 h-3 text-slate-400" />
            <span>Project Allocation</span>
          </label>
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="w-full text-xs rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-slate-700 focus:outline-none focus:border-brand-500 focus:bg-white"
            id="filter-project"
          >
            <option value="All">All Projects ({projectsList.length})</option>
            {projectsList.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        {/* Equipment Type Filter */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center space-x-1">
            <SlidersHorizontal className="w-3 h-3 text-slate-400" />
            <span>Equipment Type</span>
          </label>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="w-full text-xs rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-slate-700 focus:outline-none focus:border-brand-500 focus:bg-white"
            id="filter-type"
          >
            <option value="All">All Types ({typesList.length})</option>
            {typesList.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {/* Property Number Search */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center space-x-1">
            <Search className="w-3 h-3 text-slate-400" />
            <span>Property No. / Unit</span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={searchPropertyNum}
              onChange={(e) => setSearchPropertyNum(e.target.value)}
              placeholder="e.g. CR-221"
              className="w-full text-xs rounded-lg border border-slate-200 bg-slate-50 p-2.5 pl-8 text-slate-700 placeholder-slate-400 focus:outline-none focus:border-brand-500 focus:bg-white"
              id="filter-property-search"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
          </div>
        </div>

        {/* Overlapping Month Filter */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center space-x-1">
            <SlidersHorizontal className="w-3 h-3 text-slate-400" />
            <span>Active in Month</span>
          </label>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-full text-xs rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-slate-700 focus:outline-none focus:border-brand-500 focus:bg-white"
            id="filter-month"
          >
            <option value="All">All Months (July-Dec)</option>
            {MONTHS_DATA.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center space-x-1">
            <SlidersHorizontal className="w-3 h-3 text-slate-400" />
            <span>Schedule Status</span>
          </label>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="w-full text-xs rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-slate-700 focus:outline-none focus:border-brand-500 focus:bg-white"
            id="filter-status"
          >
            <option value="All">All Statuses</option>
            <option value="On Schedule">🟢 On Schedule</option>
            <option value="At Risk">🟡 At Risk</option>
            <option value="Delayed">🔴 Delayed</option>
            <option value="No Schedule">⚪ No Schedule</option>
          </select>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-slate-100 my-4"></div>

      {/* 3. Filter Summary and Operational Actions */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span className="font-medium">
            Showing <strong className="text-slate-800 font-bold">{filteredCount}</strong> of{' '}
            <strong className="text-slate-800 font-bold">{totalSectionCount}</strong> equipment records in{' '}
            <strong className="text-brand-500">{selectedSection}</strong>.
          </span>
          <span className="text-slate-300">|</span>
          <span className="font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-semibold">
            Filtered Subtotal: {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(sectionTotalCost)}
          </span>
        </div>

        {/* Action Button Strip */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Reset Filters button */}
          {(selectedProject !== 'All' ||
            selectedType !== 'All' ||
            searchPropertyNum !== '' ||
            selectedMonth !== 'All' ||
            selectedStatus !== 'All') && (
            <button
              onClick={onResetFilters}
              className="flex items-center space-x-1 px-2.5 py-1.5 rounded-md border border-slate-200 text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 transition-colors"
              title="Reset Filters to Default state"
              id="btn-clear-filters"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Clear Filters</span>
            </button>
          )}

          {/* Reset to Default Data button */}
          <button
            onClick={onResetToDefault}
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-md border border-slate-200 text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 transition-colors"
            title="Restore original spreadsheet data"
            id="btn-restore-defaults"
          >
            <FileText className="w-3.5 h-3.5 text-slate-400" />
            <span>Restore Seeds</span>
          </button>

          {/* Add Equipment Button */}
          <button
            onClick={onAddEquipment}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-brand-500 hover:bg-brand-600 text-white shadow-sm transition-all active:scale-95 cursor-pointer"
            id="btn-add-equipment"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Add Equipment</span>
          </button>
        </div>
      </div>
    </div>
  );
};
