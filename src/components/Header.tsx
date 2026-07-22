import React from 'react';
import { Calendar, Layers, ShieldCheck, RefreshCw } from 'lucide-react';

interface HeaderProps {
  activeTab: 'gantt' | 'master';
  setActiveTab: (tab: 'gantt' | 'master') => void;
  selectedSection: string;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, setActiveTab, selectedSection }) => {
  return (
    <header className="bg-brand-700 text-white custom-shadow border-b border-slate-800">
      <div className="max-w-[1650px] w-[95%] mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          {/* Brand Logo & Title */}
          <div className="flex items-center space-x-3">
            <div className="bg-amber-500 text-brand-700 p-2 rounded-lg font-display font-bold tracking-tight shadow-md flex items-center justify-center shrink-0">
              <Calendar className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center space-x-2 flex-wrap">
                <span className="font-mono text-[10px] text-slate-400 font-bold tracking-widest uppercase">EMG Heavy Equipment</span>
                <span className="bg-amber-500/20 text-amber-400 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Planning Node</span>
              </div>
              <h1 className="text-lg sm:text-xl font-display font-bold text-white tracking-tight leading-tight mt-0.5">
                Section Planning &amp; Maintenance Gantt
              </h1>
            </div>
          </div>

          {/* View Toggle and Controls */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setActiveTab('gantt')}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg font-medium text-xs transition-all duration-150 cursor-pointer ${
                activeTab === 'gantt'
                  ? 'bg-amber-500 text-slate-950 font-bold border border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.3)] scale-[1.01]'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-750 hover:text-white border border-slate-700/50'
              }`}
              id="btn-tab-gantt"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Section Gantt Workspace</span>
            </button>
            <button
              onClick={() => setActiveTab('master')}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg font-medium text-xs transition-all duration-150 cursor-pointer ${
                activeTab === 'master'
                  ? 'bg-amber-500 text-slate-950 font-bold border border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.3)] scale-[1.01]'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-750 hover:text-white border border-slate-700/50'
              }`}
              id="btn-tab-master"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Master Cost Gantt</span>
            </button>
          </div>
        </div>

        {/* Dynamic Status / Path bar */}
        <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-slate-400">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2.5">
            <span className="font-medium text-slate-300">Active Node:</span>
            <span className="bg-slate-800 px-2.5 py-0.5 rounded text-slate-200 font-mono text-[11px] font-medium border border-slate-700/45">
              {activeTab === 'gantt' ? `Section Gantt > ${selectedSection}` : 'Master Cost Aggregator'}
            </span>
            <span className="text-slate-700 hidden sm:inline">|</span>
            <span className="font-medium text-slate-300">Local Calendar Node:</span>
            <span className="font-mono text-amber-400 font-semibold bg-amber-500/10 px-2 py-0.5 rounded text-[11px] border border-amber-500/15">July – December 2026</span>
          </div>
          <div className="flex items-center space-x-1.5 text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20 w-fit">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Totals Reconciled with Balance Sheets</span>
          </div>
        </div>
      </div>
    </header>
  );
};
