import React, { useState } from 'react';
import { 
  FileSpreadsheet, 
  RefreshCw, 
  CheckCircle, 
  AlertCircle, 
  LogOut, 
  Plus, 
  ExternalLink, 
  Link, 
  Unlink,
  Loader2
} from 'lucide-react';
import { SpreadsheetInfo } from '../sheetsService';
import { User } from 'firebase/auth';

interface SheetsSyncBarProps {
  user: User | null;
  needsAuth: boolean;
  spreadsheet: SpreadsheetInfo | null;
  isSyncing: boolean;
  lastSyncTime: Date | null;
  onLogin: () => void;
  onLogout: () => void;
  onSync: () => void;
  onCreateSheet: () => void;
  onLinkSheet: (id: string) => void;
  onUnlink: () => void;
  isProcessing: boolean;
  syncDiagnostics?: any | null;
}

export const SheetsSyncBar: React.FC<SheetsSyncBarProps> = ({
  user,
  needsAuth,
  spreadsheet,
  isSyncing,
  lastSyncTime,
  onLogin,
  onLogout,
  onSync,
  onCreateSheet,
  onLinkSheet,
  onUnlink,
  isProcessing,
  syncDiagnostics
}) => {
  const [sheetInput, setSheetInput] = useState('');
  const [showLinkInput, setShowLinkInput] = useState(false);

  const handleLinkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sheetInput.trim()) return;

    // Extract Spreadsheet ID from URL if they pasted a full URL
    let id = sheetInput.trim();
    const urlPattern = /\/d\/([a-zA-Z0-9-_]+)/;
    const match = id.match(urlPattern);
    if (match && match[1]) {
      id = match[1];
    }

    onLinkSheet(id);
    setSheetInput('');
    setShowLinkInput(false);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 p-3 sm:p-4 mb-5 animate-fade-in custom-shadow">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
        
        {/* Left Side: Status Info */}
        <div className="flex items-center space-x-3.5">
          <div className={`p-2.5 rounded-lg shrink-0 border ${
            spreadsheet 
              ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
              : user 
                ? 'bg-amber-50 text-amber-600 border-amber-100' 
                : 'bg-slate-50 text-slate-500 border-slate-200'
          }`}>
            <FileSpreadsheet className="w-5.5 h-5.5" />
          </div>
          
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xs sm:text-sm font-display font-bold text-slate-900 leading-tight">
                Google Sheets Database Sync
              </h3>
              
              {/* Connection Status Badge */}
              {spreadsheet ? (
                <span className="bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-[9px] px-2 py-0.5 rounded-md font-bold flex items-center space-x-1 uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse mr-1" />
                  <span>MASTER ACTIVE</span>
                </span>
              ) : user ? (
                <span className="bg-amber-50 text-amber-700 border border-amber-200/80 text-[9px] px-2 py-0.5 rounded-md font-bold flex items-center space-x-1 uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 bg-amber-500 rounded-full mr-1" />
                  <span>NO SPREADSHEET LINKED</span>
                </span>
              ) : (
                <span className="bg-slate-100 text-slate-600 border border-slate-200 text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider">
                  OFFLINE LOCAL STATE
                </span>
              )}
            </div>

            <p className="text-xs text-slate-500 mt-0.5 truncate max-w-full">
              {spreadsheet ? (
                <span>
                  Linked: <strong className="text-slate-800 font-bold">{spreadsheet.name}</strong> &gt; <strong className="text-brand-600 font-bold">REPAIR_FORECAST</strong>
                </span>
              ) : user ? (
                <span>Connected as <strong className="text-slate-700 font-semibold">{user.email}</strong>. Link/create a master sheet below.</span>
              ) : (
                <span>Using in-memory cache &amp; localStorage. Connect Sheets to persist and share master records.</span>
              )}
            </p>

            {lastSyncTime && (
              <div className="text-[10px] text-slate-400 font-mono mt-0.5 flex items-center space-x-1">
                <span>Last Synced: {lastSyncTime.toLocaleTimeString()}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Authentication and Sync Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* OFFLINE / SIGN IN REQUIRED */}
          {needsAuth && !user ? (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <button
                onClick={onLogin}
                disabled={isProcessing}
                className="gsi-material-button text-xs font-semibold select-none flex items-center justify-center cursor-pointer py-1.5 px-3 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg hover:shadow-2xs transition-all text-slate-700 h-9 shrink-0"
                id="btn-google-login"
                title="Sign in with Google inside popup"
              >
                <div className="gsi-material-button-content-wrapper flex items-center space-x-2">
                  <div className="gsi-material-button-icon shrink-0">
                    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-4 h-4">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                    </svg>
                  </div>
                  <span className="gsi-material-button-contents font-bold">Sign in with Google</span>
                </div>
              </button>
              
              {typeof window !== 'undefined' && window.self !== window.top && (
                <button
                  type="button"
                  onClick={() => window.open(window.location.href, '_blank')}
                  className="inline-flex items-center justify-center space-x-1.5 px-3 py-1.5 border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-850 text-xs font-bold rounded-lg transition-all cursor-pointer h-9 shadow-2xs"
                  title="Open application in a new standalone tab to avoid iframe login restrictions"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>Open in New Tab to Sign In</span>
                </button>
              )}
            </div>
          ) : (
            user && (
              <>
                {/* CONNECTED SHEET OPERATIONS */}
                {spreadsheet ? (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* View in Google Sheets */}
                    {spreadsheet.webViewLink && (
                      <a
                        href={spreadsheet.webViewLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 border border-slate-200 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-all cursor-pointer h-9 shadow-2xs"
                        id="link-open-spreadsheet"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Open Sheet</span>
                      </a>
                    )}

                    {/* Sync / Refresh */}
                    <button
                      onClick={onSync}
                      disabled={isSyncing || isProcessing}
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-600 text-xs font-bold rounded-lg transition-all cursor-pointer disabled:opacity-50 h-9 shadow-2xs"
                      id="btn-sync-now"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                      <span>Sync Now</span>
                    </button>

                    {/* Unlink spreadsheet */}
                    <button
                      onClick={onUnlink}
                      disabled={isProcessing}
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 border border-slate-200 text-xs font-bold text-rose-600 bg-white hover:bg-rose-50 rounded-lg transition-all cursor-pointer h-9 shadow-2xs"
                      id="btn-unlink-sheet"
                      title="Unlink spreadsheet database"
                    >
                      <Unlink className="w-3.5 h-3.5" />
                      <span>Unlink</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* SPREADSHEET PROVISIONING */}
                    {!showLinkInput && (
                      <>
                        {/* Auto-create Master Forecast sheet */}
                        <button
                          onClick={onCreateSheet}
                          disabled={isProcessing}
                          className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold rounded-lg shadow-2xs transition-all cursor-pointer h-9"
                          id="btn-create-master-sheet"
                        >
                          {isProcessing ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Plus className="w-3.5 h-3.5" />
                          )}
                          <span>Create Master Sheet</span>
                        </button>

                        {/* Toggle linkage inputs */}
                        <button
                          onClick={() => setShowLinkInput(true)}
                          disabled={isProcessing}
                          className="inline-flex items-center space-x-1.5 px-3 py-1.5 border border-slate-200 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 rounded-lg transition-all cursor-pointer h-9 shadow-2xs"
                          id="btn-toggle-link-sheet"
                        >
                          <Link className="w-3.5 h-3.5 text-slate-400" />
                          <span>Link Existing Sheet</span>
                        </button>
                      </>
                    )}

                    {showLinkInput && (
                      <form onSubmit={handleLinkSubmit} className="flex items-center gap-1.5 h-9">
                        <input
                          type="text"
                          value={sheetInput}
                          onChange={(e) => setSheetInput(e.target.value)}
                          placeholder="Paste Spreadsheet URL or ID"
                          className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 w-48 sm:w-72 focus:outline-none focus:border-brand-500 h-9"
                          id="input-spreadsheet-id"
                        />
                        <button
                          type="submit"
                          className="bg-brand-500 hover:bg-brand-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer h-9"
                          id="btn-submit-link"
                        >
                          Link
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowLinkInput(false)}
                          className="text-slate-500 hover:text-slate-750 px-2 text-xs font-semibold cursor-pointer h-9 flex items-center"
                          id="btn-cancel-link"
                        >
                          Cancel
                        </button>
                      </form>
                    )}
                  </div>
                )}

                {/* Google Sign Out */}
                <button
                  onClick={onLogout}
                  disabled={isProcessing}
                  className="inline-flex items-center justify-center w-9 h-9 border border-slate-200 hover:border-rose-200 text-slate-500 hover:text-rose-600 bg-white hover:bg-rose-50 rounded-lg transition-all cursor-pointer shrink-0 shadow-2xs"
                  id="btn-google-logout"
                  title="Sign out of Google Account"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            )
          )}
        </div>

      </div>

      {/* Synchronization Diagnostics Panel */}
      {spreadsheet && syncDiagnostics && (
        <div className="mt-3.5 border-t border-slate-100 pt-3 animate-fade-in" id="sync-diagnostics-panel">
          <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-3 sm:p-4">
            <h4 className="text-[10px] sm:text-xs font-mono font-black text-slate-700 uppercase tracking-wider flex items-center space-x-1.5 mb-3">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>Real-Time Sheets Connection Diagnostics</span>
            </h4>
            
            {/* Exactly 4 equally sized diagnostic cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono mb-3.5">
              <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs flex flex-col justify-between">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Rows Read</span>
                <span className="text-base sm:text-lg font-black text-slate-800 tracking-tight mt-1">
                  {syncDiagnostics.rowsRead || 0} rows
                </span>
              </div>
              
              <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs flex flex-col justify-between">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Valid Records Map</span>
                <span className={`text-base sm:text-lg font-black tracking-tight mt-1 ${
                  (syncDiagnostics.validRecords || 0) > 0 ? 'text-emerald-600' : 'text-slate-400'
                }`}>
                  {syncDiagnostics.validRecords || 0} entries
                </span>
              </div>
              
              <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs flex flex-col justify-between">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Parsed Cost</span>
                <span className={`text-base sm:text-lg font-black tracking-tight mt-1 ${
                  (syncDiagnostics.totalParsedCost || 0) > 0 ? 'text-indigo-600' : 'text-slate-400'
                }`}>
                  {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(syncDiagnostics.totalParsedCost || 0)}
                </span>
              </div>
              
              <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs flex flex-col justify-between">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Gantt Schedules</span>
                <span className={`text-base sm:text-lg font-black tracking-tight mt-1 ${
                  (syncDiagnostics.validGanttDates || 0) > 0 ? 'text-amber-600' : 'text-slate-400'
                }`}>
                  {syncDiagnostics.validGanttDates || 0} act / {syncDiagnostics.missingGanttDates || 0} unsched
                </span>
              </div>
            </div>

            {/* Quick parsed samples preview list */}
            {syncDiagnostics.sampleLogs && syncDiagnostics.sampleLogs.length > 0 && (
              <div className="border-t border-slate-200/50 pt-3">
                <span className="block text-[10px] font-mono uppercase font-black text-slate-500 mb-2">
                  Dynamic Parser Core Output Sample (REPAIR_FORECAST):
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 font-mono text-[10px]">
                  {syncDiagnostics.sampleLogs.map((log: any, idx: number) => {
                    const hasCost = log.parsedCost > 0;
                    return (
                      <div key={idx} className="bg-white border border-slate-200 p-2.5 rounded-md flex flex-col justify-between shadow-2xs">
                        <span className="text-slate-500 truncate block font-bold text-[9px]">{log.id}</span>
                        <div className="mt-1.5 flex flex-col">
                          <span className="text-slate-400 text-[8.5px] truncate">Raw: {log.originalCost || 'blank'}</span>
                          <span className={`text-[11px] font-bold mt-0.5 ${
                            hasCost ? 'text-emerald-600 font-extrabold' : 'text-slate-400'
                          }`}>
                            {hasCost ? `₱${log.parsedCost.toLocaleString('en-US')}` : '₱0'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
