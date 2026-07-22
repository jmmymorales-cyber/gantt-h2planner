import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { FiltersPanel } from './components/FiltersPanel';
import { SectionGantt } from './components/SectionGantt';
import { MasterCostGantt } from './components/MasterCostGantt';
import { EquipmentModal } from './components/EquipmentModal';
import { SheetsSyncBar } from './components/SheetsSyncBar';
import { EquipmentRecord, SectionType } from './types';
import { 
  DEFAULT_EQUIPMENT_RECORDS, 
  generateWeeks, 
  getRecordStatus,
  MONTHS_DATA,
  getProjectAllocations,
  getEquipmentTypes
} from './data';
import { 
  initAuth, 
  googleSignIn, 
  logout 
} from './firebase';
import { 
  searchSpreadsheet, 
  createSpreadsheet, 
  verifyAndFetchSpreadsheet, 
  fetchRecordsFromSheet, 
  writeRecordsToSheet,
  SpreadsheetInfo 
} from './sheetsService';
import { User } from 'firebase/auth';
import { ShieldCheck, Info, RotateCcw, AlertTriangle, ExternalLink } from 'lucide-react';

const LOCAL_STORAGE_KEY = 'emg_gantt_records_v1';

export default function App() {
  // 1. Core State
  const [records, setRecords] = useState<EquipmentRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'gantt' | 'master'>('gantt');
  const [selectedSection, setSelectedSection] = useState<SectionType>('Lifting');

  // Filter States
  const [searchPropertyNum, setSearchPropertyNum] = useState('');
  const [selectedProject, setSelectedProject] = useState('All');
  const [selectedType, setSelectedType] = useState('All');
  const [selectedMonth, setSelectedMonth] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<EquipmentRecord | null>(null);

  // Notifications & Error management
  const [notification, setNotification] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Google Sheets & Authentication states
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(true);
  const [spreadsheet, setSpreadsheet] = useState<SpreadsheetInfo | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [syncDiagnostics, setSyncDiagnostics] = useState<any | null>(null);

  // Generate the 30 standard calendar weeks (July – December 2026)
  const weeks = generateWeeks();

  // Helper: Trigger standard message flash
  const triggerNotification = (message: string) => {
    setNotification(message);
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  // 2. Load cached local spreadsheet credentials first on mount
  useEffect(() => {
    const savedSheet = localStorage.getItem('emg_gantt_spreadsheet_v1');
    if (savedSheet) {
      try {
        setSpreadsheet(JSON.parse(savedSheet));
      } catch (e) {
        // ignore
      }
    }

    // Load records from local storage
    const savedRecords = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (savedRecords) {
      try {
        const parsed = JSON.parse(savedRecords);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setRecords(parsed);
          return;
        }
      } catch (e) {
        console.error('Failed to parse records from localStorage:', e);
      }
    }
    // Fallback to default template seeds
    setRecords(DEFAULT_EQUIPMENT_RECORDS);
  }, []);

  // 3. Initialize Firebase Authentication listener & OAuth credentials
  useEffect(() => {
    const unsubscribe = initAuth(
      async (firebaseUser, token) => {
        setUser(firebaseUser);
        setAccessToken(token);
        setNeedsAuth(false);
        setErrorBanner(null);

        // Try to automatically synchronize using cached sheet ID
        const savedSheet = localStorage.getItem('emg_gantt_spreadsheet_v1');
        if (savedSheet) {
          try {
            const cachedInfo: SpreadsheetInfo = JSON.parse(savedSheet);
            setIsSyncing(true);
            const verified = await verifyAndFetchSpreadsheet(cachedInfo.id, token);
            setSpreadsheet(verified.info);
            
            const { records: loaded, diagnostics } = await fetchRecordsFromSheet(cachedInfo.id, token);
            setSyncDiagnostics(diagnostics);
            if (loaded.length > 0) {
              setRecords(loaded);
              localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(loaded));
              setLastSyncTime(new Date());
              triggerNotification('Synchronized successfully with Google Sheets!');
            } else {
              // Worksheet was found but had no valid rows yet, seed it automatically
              await writeRecordsToSheet(cachedInfo.id, token, DEFAULT_EQUIPMENT_RECORDS);
              setRecords(DEFAULT_EQUIPMENT_RECORDS);
              setLastSyncTime(new Date());
              triggerNotification('Google Sheet worksheet initialized and seeded!');
            }
          } catch (err: any) {
            console.error('Auto spreadsheet connection failed:', err);
            setErrorBanner(`Auto-sync failed with saved Sheet ID: ${err.message}. Please connect again or check permissions.`);
          } finally {
            setIsSyncing(false);
          }
        } else {
          // Proactively search the user's Drive for any previously created master sheet to provide high convenience!
          try {
            setIsProcessing(true);
            const found = await searchSpreadsheet(token);
            if (found) {
              const confirmLink = window.confirm(
                `An existing Google Spreadsheet '${found.name}' was found in your Google Drive. Would you like to link and synchronize with it?`
              );
              if (confirmLink) {
                const verified = await verifyAndFetchSpreadsheet(found.id, token);
                setSpreadsheet(verified.info);
                localStorage.setItem('emg_gantt_spreadsheet_v1', JSON.stringify(verified.info));
                
                const { records: loaded, diagnostics } = await fetchRecordsFromSheet(found.id, token);
                setSyncDiagnostics(diagnostics);
                if (loaded.length > 0) {
                  setRecords(loaded);
                  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(loaded));
                } else {
                  await writeRecordsToSheet(found.id, token, DEFAULT_EQUIPMENT_RECORDS);
                  setRecords(DEFAULT_EQUIPMENT_RECORDS);
                }
                setLastSyncTime(new Date());
                triggerNotification('Successfully linked to Google Sheet!');
              }
            }
          } catch (err) {
            console.warn('Failed auto-searching Drive spreadsheets:', err);
          } finally {
            setIsProcessing(false);
          }
        }
      },
      () => {
        // Logged out or session expired
        setUser(null);
        setAccessToken(null);
        setNeedsAuth(true);
      }
    );

    return () => unsubscribe();
  }, []);

  // 4. Save records locally
  const saveRecords = (newRecords: EquipmentRecord[]) => {
    setRecords(newRecords);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newRecords));
  };

  // Immediate write-back to Google Sheet when client data changes (with explicit permission dialog)
  const pushToSheet = async (updatedRecords: EquipmentRecord[], actionName: string) => {
    if (spreadsheet && accessToken) {
      const confirmed = window.confirm(
        `Overwrite Confirmation: Would you like to immediately write this update (${actionName}) directly to your connected Google Sheet '${spreadsheet.name}' worksheet 'REPAIR_FORECAST'?`
      );
      if (confirmed) {
        setIsProcessing(true);
        setErrorBanner(null);
        try {
          await writeRecordsToSheet(spreadsheet.id, accessToken, updatedRecords);
          setLastSyncTime(new Date());
          triggerNotification(`Changes written directly to Google Sheet successfully.`);
        } catch (err: any) {
          console.error('Failed writing changes to spreadsheet:', err);
          setErrorBanner(`Spreadsheet Update Failed: ${err.message}`);
        } finally {
          setIsProcessing(false);
        }
      } else {
        triggerNotification(`Changes saved in local app instance only.`);
      }
    }
  };

  // Google OAuth Handlers
  const handleGoogleLogin = async () => {
    setIsProcessing(true);
    setErrorBanner(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setAccessToken(result.accessToken);
        setNeedsAuth(false);
        triggerNotification('Successfully connected Google account.');
      }
    } catch (err: any) {
      console.error('Google Sign-In failed:', err);
      setErrorBanner(`Sign-In Failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGoogleLogout = async () => {
    const confirmed = window.confirm('Are you sure you want to sign out? Your repair list will continue to persist locally.');
    if (!confirmed) return;

    setIsProcessing(true);
    try {
      await logout();
      setUser(null);
      setAccessToken(null);
      setNeedsAuth(true);
      triggerNotification('Signed out from Google Account.');
    } catch (err: any) {
      setErrorBanner(`Sign-Out Error: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreateSpreadsheet = async () => {
    if (!accessToken) return;
    setIsProcessing(true);
    setErrorBanner(null);
    try {
      const newSheet = await createSpreadsheet(accessToken);
      setSpreadsheet(newSheet);
      localStorage.setItem('emg_gantt_spreadsheet_v1', JSON.stringify(newSheet));

      // Push current list of local records immediately to seed the sheet
      await writeRecordsToSheet(newSheet.id, accessToken, records);
      setLastSyncTime(new Date());
      triggerNotification('Created master sheet and synchronized default template.');
    } catch (err: any) {
      console.error('Creating spreadsheet failed:', err);
      setErrorBanner(`Failed creating Google Sheet: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLinkSpreadsheet = async (id: string) => {
    if (!accessToken) return;
    setIsProcessing(true);
    setErrorBanner(null);
    try {
      const verified = await verifyAndFetchSpreadsheet(id, accessToken);
      setSpreadsheet(verified.info);
      localStorage.setItem('emg_gantt_spreadsheet_v1', JSON.stringify(verified.info));

      const { records: loaded, diagnostics } = await fetchRecordsFromSheet(id, accessToken);
      setSyncDiagnostics(diagnostics);
      if (loaded.length > 0) {
        const overwriteLocal = window.confirm(
          `Connected! We found ${loaded.length} repair records in '${verified.info.name}' worksheet 'REPAIR_FORECAST'. Would you like to overwrite your local dashboard with these spreadsheet values?`
        );
        if (overwriteLocal) {
          setRecords(loaded);
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(loaded));
          triggerNotification('Spreadsheet data imported successfully!');
        } else {
          const pushLocal = window.confirm('Would you like to overwrite the spreadsheet values with your current local view instead?');
          if (pushLocal) {
            await writeRecordsToSheet(id, accessToken, records);
            triggerNotification('Uploaded local data to spreadsheet!');
          }
        }
      } else {
        // Spreadsheet is empty, write current local records
        await writeRecordsToSheet(id, accessToken, records);
        triggerNotification('Connected sheet and seeded with current local records.');
      }
      setLastSyncTime(new Date());
    } catch (err: any) {
      console.error('Linking spreadsheet failed:', err);
      setErrorBanner(`Failed linking spreadsheet: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUnlinkSpreadsheet = () => {
    const confirmed = window.confirm('Are you sure you want to unlink the current spreadsheet? Your records will remain safe locally in the app, but no longer push to Sheets.');
    if (confirmed) {
      setSpreadsheet(null);
      setSyncDiagnostics(null);
      localStorage.removeItem('emg_gantt_spreadsheet_v1');
      triggerNotification('Spreadsheet unlinked.');
    }
  };

  const handleSyncNow = async () => {
    if (!spreadsheet || !accessToken) return;
    setIsSyncing(true);
    setErrorBanner(null);
    try {
      const { records: loaded, diagnostics } = await fetchRecordsFromSheet(spreadsheet.id, accessToken);
      setSyncDiagnostics(diagnostics);
      if (loaded.length > 0) {
        setRecords(loaded);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(loaded));
        setLastSyncTime(new Date());
        triggerNotification('Pulled latest changes from Google Sheets successfully!');
      } else {
        const confirmSeed = window.confirm(
          `Connected sheet '${spreadsheet.name}' worksheet 'REPAIR_FORECAST' is empty. Do you want to push your local planning data to it?`
        );
        if (confirmSeed) {
          await writeRecordsToSheet(spreadsheet.id, accessToken, records);
          setLastSyncTime(new Date());
          triggerNotification('Uploaded local records to Google Sheet!');
        }
      }
    } catch (err: any) {
      console.error('Manual sync failed:', err);
      setErrorBanner(`Synchronisation Failed: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // 5. Modal Action Handlers
  const handleAddEquipment = () => {
    setEditingRecord(null);
    setIsModalOpen(true);
  };

  const handleEditRecord = (record: EquipmentRecord) => {
    setEditingRecord(record);
    setIsModalOpen(true);
  };

  const handleDeleteRecord = async (id: string) => {
    const recordToDelete = records.find(r => r.id === id);
    if (!recordToDelete) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete equipment unit ${recordToDelete.propertyNumber} (${recordToDelete.equipmentType})?`
    );

    if (confirmed) {
      const updated = records.filter(r => r.id !== id);
      saveRecords(updated);
      triggerNotification(`Equipment unit ${recordToDelete.propertyNumber} deleted successfully.`);
      await pushToSheet(updated, `Delete ${recordToDelete.propertyNumber}`);
    }
  };

  const handleSaveRecord = async (savedRecord: EquipmentRecord) => {
    let updated: EquipmentRecord[];
    let actionName = '';
    if (editingRecord) {
      // Edit Mode
      updated = records.map(r => r.id === savedRecord.id ? savedRecord : r);
      actionName = `Update ${savedRecord.propertyNumber}`;
      triggerNotification(`Equipment unit ${savedRecord.propertyNumber} updated successfully.`);
    } else {
      // Create Mode
      updated = [...records, savedRecord];
      actionName = `Add ${savedRecord.propertyNumber}`;
      triggerNotification(`Equipment unit ${savedRecord.propertyNumber} added successfully.`);
    }
    saveRecords(updated);
    await pushToSheet(updated, actionName);
  };

  // Restore Default Seeds (with sheet sync writeback)
  const handleResetToDefault = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to restore the original pre-populated maintenance records? This will clear all custom additions and edits.'
    );
    if (confirmed) {
      saveRecords(DEFAULT_EQUIPMENT_RECORDS);
      triggerNotification('Original spreadsheet-aligned equipment records restored successfully.');
      await pushToSheet(DEFAULT_EQUIPMENT_RECORDS, 'Restore Default Seeds');
    }
  };

  // Clear current active search/filter inputs
  const handleResetFilters = () => {
    setSelectedProject('All');
    setSelectedType('All');
    setSearchPropertyNum('');
    setSelectedMonth('All');
    setSelectedStatus('All');
  };

  // Derived Filter lists based on selected section
  const currentSectionRecords = records.filter(r => r.section === selectedSection);
  const projectsList = getProjectAllocations(currentSectionRecords);
  const typesList = getEquipmentTypes(currentSectionRecords);

  // Filter Engine
  const filteredRecords = currentSectionRecords.filter(r => {
    // 1. Property Number Search
    if (searchPropertyNum.trim() !== '') {
      const term = searchPropertyNum.toLowerCase();
      if (!r.propertyNumber.toLowerCase().includes(term)) {
        return false;
      }
    }

    // 2. Project Allocation Filter
    if (selectedProject !== 'All' && r.projectAllocation !== selectedProject) {
      return false;
    }

    // 3. Equipment Type Filter
    if (selectedType !== 'All' && r.equipmentType !== selectedType) {
      return false;
    }

    // 4. Status Filter
    if (selectedStatus !== 'All') {
      const status = getRecordStatus(r);
      if (status !== selectedStatus) {
        return false;
      }
    }

    // 5. Month overlap filter
    if (selectedMonth !== 'All') {
      if (!r.startOfRepair || !r.targetCompletion) {
        return false;
      }
      const monthItem = MONTHS_DATA.find(m => m.name === selectedMonth);
      if (monthItem) {
        const mStart = new Date(2026, monthItem.index - 1, 1, 0, 0, 0);
        const mEnd = new Date(2026, monthItem.index - 1, monthItem.days, 23, 59, 59);

        const rStart = new Date(r.startOfRepair + "T00:00:00");
        const rEnd = new Date(r.targetCompletion + "T23:59:59");

        const overlaps = !(rEnd < mStart || rStart > mEnd);
        if (!overlaps) {
          return false;
        }
      }
    }

    return true;
  });

  // Calculate filtered section total cost
  const sectionFilteredTotalCost = filteredRecords.reduce((sum, r) => {
    return sum + (r.projectedRepairCost || 0);
  }, 0);

  // Jump helper from master summary table to specific section gantt view with optional month filter
  const handleSelectSectionFromMaster = (sec: SectionType, monthName: string = 'All') => {
    setSelectedSection(sec);
    setActiveTab('gantt');
    handleResetFilters();
    if (monthName !== 'All') {
      setSelectedMonth(monthName);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col pb-12">
      
      {/* Primary Header Navbar */}
      <Header 
        activeTab={activeTab} 
        setActiveTab={(tab) => {
          setActiveTab(tab);
          handleResetFilters();
        }}
        selectedSection={selectedSection}
      />

      <main className="max-w-[1650px] w-[95%] mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1">
        
        {/* Google Sheets Sync Control Panel */}
        <SheetsSyncBar 
          user={user}
          needsAuth={needsAuth}
          spreadsheet={spreadsheet}
          isSyncing={isSyncing}
          lastSyncTime={lastSyncTime}
          onLogin={handleGoogleLogin}
          onLogout={handleGoogleLogout}
          onSync={handleSyncNow}
          onCreateSheet={handleCreateSpreadsheet}
          onLinkSheet={handleLinkSpreadsheet}
          onUnlink={handleUnlinkSpreadsheet}
          isProcessing={isProcessing}
          syncDiagnostics={syncDiagnostics}
        />

        {/* Dynamic Error Alerts */}
        {errorBanner && (
          <div className="mb-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4 shadow-sm animate-fade-in">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-900 text-sm">
                  {errorBanner.includes('popup-closed-by-user') || errorBanner.toLowerCase().includes('popup')
                    ? 'Google Sign-In Popup Blocked or Closed'
                    : 'Database Connection Error'}
                </p>
                <div className="text-slate-600 mt-1 leading-relaxed text-xs">
                  {errorBanner.includes('popup-closed-by-user') || errorBanner.toLowerCase().includes('popup') ? (
                    <div>
                      <span>
                        Since this application runs inside a secure <strong>iframe preview panel</strong>, standard Google Sign-In popups are often blocked by browsers or fail due to iframe sandbox cookie constraints.
                      </span>
                      <div className="mt-2 text-slate-800 font-medium">
                        👉 <span className="underline decoration-brand-500 decoration-2 font-semibold">Solution:</span> Click the button on the right to open this app in a new standalone tab. In the new tab, Google Sign-In will function perfectly without iframe limitations!
                      </div>
                    </div>
                  ) : (
                    <span>{errorBanner}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-end sm:self-start">
              {(errorBanner.includes('popup-closed-by-user') || errorBanner.toLowerCase().includes('popup')) && (
                <button
                  type="button"
                  onClick={() => window.open(window.location.href, '_blank')}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold transition-all shadow-2xs hover:shadow-xs cursor-pointer h-8"
                >
                  <span>Open in New Tab</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
              <button 
                onClick={() => setErrorBanner(null)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1 hover:bg-slate-100 rounded-lg cursor-pointer text-sm"
                title="Dismiss"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* Dynamic Success Notification Banner */}
        {notification && (
          <div className="mb-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl p-3 flex items-center justify-between shadow-xs animate-fade-in">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
              <span className="font-medium">{notification}</span>
            </div>
            <button 
              onClick={() => setNotification(null)}
              className="text-emerald-500 hover:text-emerald-700 font-bold px-2 cursor-pointer"
            >
              ×
            </button>
          </div>
        )}

        {/* View render router */}
        {activeTab === 'gantt' ? (
          <>
            {/* Interactive Search & Filters Deck */}
            <FiltersPanel 
              selectedSection={selectedSection}
              setSelectedSection={(sec) => {
                setSelectedSection(sec);
                handleResetFilters();
              }}
              searchPropertyNum={searchPropertyNum}
              setSearchPropertyNum={setSearchPropertyNum}
              selectedProject={selectedProject}
              setSelectedProject={setSelectedProject}
              selectedType={selectedType}
              setSelectedType={setSelectedType}
              selectedMonth={selectedMonth}
              setSelectedMonth={setSelectedMonth}
              selectedStatus={selectedStatus}
              setSelectedStatus={setSelectedStatus}
              
              projectsList={projectsList}
              typesList={typesList}
              
              onAddEquipment={handleAddEquipment}
              onResetFilters={handleResetFilters}
              onResetToDefault={handleResetToDefault}
              
              filteredCount={filteredRecords.length}
              totalSectionCount={currentSectionRecords.length}
              sectionTotalCost={sectionFilteredTotalCost}
            />

            {/* Instruction Callout for Gantt navigation */}
            <div className="bg-amber-500/10 border border-amber-500/20 text-brand-700 text-xs rounded-xl p-3.5 mb-4 flex items-start space-x-3">
              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-slate-900">Spreadsheet Controls &amp; Scrolling:</p>
                <p className="text-slate-600 mt-0.5">
                  This system is configured to treat your linked Google Sheet worksheet <strong>REPAIR_FORECAST</strong> as the master database. 
                  Any records added, updated, or deleted here can write directly back to the worksheet upon confirmation. 
                  Scroll horizontally in the table below to view week columns spanning July through December 2026.
                </p>
              </div>
            </div>

            {/* Core Section Gantt Workspace */}
            <SectionGantt 
              records={filteredRecords}
              allRecords={records}
              activeFilters={{
                selectedProject,
                selectedType,
                searchPropertyNum,
                selectedMonth,
                selectedStatus
              }}
              selectedSection={selectedSection}
              onEditRecord={handleEditRecord}
              onDeleteRecord={handleDeleteRecord}
              weeks={weeks}
            />
          </>
        ) : (
          /* Master Cost Aggregator dashboard */
          <MasterCostGantt 
            allRecords={records}
            onSelectSection={(sec) => handleSelectSectionFromMaster(sec, 'All')}
            onSelectSectionAndMonth={handleSelectSectionFromMaster}
            activeSection={selectedSection}
          />
        )}
      </main>

      {/* Popover Form Modal for Adding / Editing equipment entries */}
      <EquipmentModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveRecord}
        editingRecord={editingRecord}
        currentSection={selectedSection}
        existingProjects={projectsList}
      />

    </div>
  );
}
