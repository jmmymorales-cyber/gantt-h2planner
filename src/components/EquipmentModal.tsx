import React, { useState, useEffect } from 'react';
import { X, Calculator, Info, ShieldAlert } from 'lucide-react';
import { EquipmentRecord, SectionType } from '../types';
import { SECTIONS } from '../data';

interface EquipmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (record: EquipmentRecord) => void;
  editingRecord: EquipmentRecord | null;
  currentSection: SectionType;
  existingProjects: string[];
}

export const EquipmentModal: React.FC<EquipmentModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingRecord,
  currentSection,
  existingProjects
}) => {
  // Form fields
  const [section, setSection] = useState<SectionType>(currentSection);
  const [projectAllocation, setProjectAllocation] = useState('');
  const [isCustomProject, setIsCustomProject] = useState(false);
  const [customProjectName, setCustomProjectName] = useState('');

  const [equipmentType, setEquipmentType] = useState('');
  const [propertyNumber, setPropertyNumber] = useState('');
  
  const [dateNeeded, setDateNeeded] = useState('2026-08-15');
  const [commitmentDate, setCommitmentDate] = useState('2026-07-18');
  const [startOfRepair, setStartOfRepair] = useState('2026-07-20');
  const [targetCompletion, setTargetCompletion] = useState('2026-08-12');
  
  const [repairScope, setRepairScope] = useState('');
  
  // Single cost field replacing the breakdown
  const [projectedRepairCost, setProjectedRepairCost] = useState<number>(0);

  // Validation state
  const [error, setError] = useState('');

  // Auto-fill form when modal opens or editingRecord changes
  useEffect(() => {
    if (editingRecord) {
      setSection(editingRecord.section);
      setProjectAllocation(editingRecord.projectAllocation);
      setCustomProjectName('');
      setIsCustomProject(false);

      setEquipmentType(editingRecord.equipmentType);
      setPropertyNumber(editingRecord.propertyNumber);
      setDateNeeded(editingRecord.dateNeeded || '');
      setCommitmentDate(editingRecord.commitmentDate || '');
      setStartOfRepair(editingRecord.startOfRepair || '');
      setTargetCompletion(editingRecord.targetCompletion || '');
      setRepairScope(editingRecord.repairScope || '');

      setProjectedRepairCost(editingRecord.projectedRepairCost || 0);
    } else {
      // Create mode
      setSection(currentSection);
      setProjectAllocation(existingProjects[0] || 'CHP Solid Cement Plant – Kiln 3 Major Shutdown');
      setCustomProjectName('');
      setIsCustomProject(existingProjects.length === 0);

      setEquipmentType('');
      setPropertyNumber('');
      setDateNeeded('2026-08-15');
      setCommitmentDate('2026-07-18');
      setStartOfRepair('2026-07-20');
      setTargetCompletion('2026-08-12');
      setRepairScope('');

      setProjectedRepairCost(0);
    }
    setError('');
  }, [editingRecord, isOpen, currentSection, existingProjects]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validations
    if (!equipmentType.trim()) {
      setError('Equipment Type is required.');
      return;
    }
    if (!propertyNumber.trim()) {
      setError('Property Number is required.');
      return;
    }
    
    const finalProject = isCustomProject ? customProjectName.trim() : projectAllocation;
    if (!finalProject) {
      setError('Project Allocation is required.');
      return;
    }

    if (startOfRepair && targetCompletion) {
      const start = new Date(startOfRepair + "T00:00:00");
      const end = new Date(targetCompletion + "T00:00:00");
      if (start > end) {
        setError('Start of Repair cannot be later than the Target Completion.');
        return;
      }
    }

    // Save
    onSave({
      id: editingRecord ? editingRecord.id : `record-${Date.now()}`,
      section,
      projectAllocation: finalProject,
      equipmentType: equipmentType.trim(),
      propertyNumber: propertyNumber.trim().toUpperCase(),
      dateNeeded,
      commitmentDate,
      startOfRepair,
      targetCompletion,
      repairScope: repairScope.trim() || 'General Maintenance',
      projectedRepairCost
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center bg-brand-700/60 backdrop-blur-xs p-4 animate-fade-in">
      <div className="relative bg-white w-full max-w-2xl rounded-2xl shadow-xl border border-slate-200 overflow-hidden custom-shadow max-h-[90vh] flex flex-col animate-scale-up">
        
        {/* Header */}
        <div className="bg-brand-700 text-white px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-display font-bold">
              {editingRecord ? 'Edit Repair Forecast Record' : 'Add New Repair Forecast Record'}
            </h3>
            <p className="text-xs text-slate-300 font-mono">
              Section: {section}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-300 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors"
            id="modal-close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          
          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg p-3 flex items-start space-x-2">
              <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Section Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Maintenance Section
              </label>
              <select
                value={section}
                onChange={(e) => setSection(e.target.value as SectionType)}
                className="w-full text-xs rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-slate-700 focus:outline-none focus:border-brand-500 focus:bg-white"
                id="form-section"
              >
                {SECTIONS.map((sec) => (
                  <option key={sec} value={sec}>
                    {sec}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Property Number / Unit ID
              </label>
              <input
                type="text"
                value={propertyNumber}
                onChange={(e) => setPropertyNumber(e.target.value)}
                placeholder="e.g. CR-221, GS-105"
                className="w-full text-xs rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-slate-700 focus:outline-none focus:border-brand-500 focus:bg-white font-mono uppercase font-bold"
                id="form-property-num"
              />
            </div>
          </div>

          {/* Project Selection */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-slate-700">
                Project Allocation
              </label>
              <button
                type="button"
                onClick={() => setIsCustomProject(!isCustomProject)}
                className="text-[11px] font-semibold text-brand-500 hover:text-brand-600 hover:underline cursor-pointer"
                id="form-toggle-project-type"
              >
                {isCustomProject ? 'Select Existing Project' : 'Create New Project Group'}
              </button>
            </div>

            {isCustomProject ? (
              <input
                type="text"
                value={customProjectName}
                onChange={(e) => setCustomProjectName(e.target.value)}
                placeholder="e.g. Bataan Refinery Expansion"
                className="w-full text-xs rounded-lg border border-slate-200 bg-white p-2.5 text-slate-700 focus:outline-none focus:border-brand-500"
                id="form-custom-project"
              />
            ) : (
              <select
                value={projectAllocation}
                onChange={(e) => setProjectAllocation(e.target.value)}
                className="w-full text-xs rounded-lg border border-slate-200 bg-white p-2.5 text-slate-700 focus:outline-none focus:border-brand-500"
                id="form-project-select"
              >
                {existingProjects.length === 0 ? (
                  <option value="CHP Solid Cement Plant – Kiln 3 Major Shutdown">
                    CHP Solid Cement Plant – Kiln 3 Major Shutdown
                  </option>
                ) : (
                  existingProjects.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))
                )}
              </select>
            )}
          </div>

          {/* Equipment Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Equipment Type
              </label>
              <input
                type="text"
                value={equipmentType}
                onChange={(e) => setEquipmentType(e.target.value)}
                placeholder="e.g. Mobile Crane, Generator Set"
                className="w-full text-xs rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-slate-700 focus:outline-none focus:border-brand-500 focus:bg-white"
                id="form-type"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Repair Scope Summary
              </label>
              <input
                type="text"
                value={repairScope}
                onChange={(e) => setRepairScope(e.target.value)}
                placeholder="e.g. Engine Overhaul, Brake replacement"
                className="w-full text-xs rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-slate-700 focus:outline-none focus:border-brand-500 focus:bg-white"
                id="form-scope"
              />
            </div>
          </div>

          {/* Dates Panel */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-4">
            <h4 className="text-xs font-mono font-bold text-brand-600 uppercase tracking-wider flex items-center space-x-1">
              <Info className="w-3.5 h-3.5" />
              <span>Project Schedule &amp; Key Deadlines (2026)</span>
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 mb-1 uppercase tracking-wider">
                  Date Needed
                </label>
                <input
                  type="date"
                  value={dateNeeded}
                  onChange={(e) => setDateNeeded(e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-700 font-mono"
                  id="form-date-needed"
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-500 mb-1 uppercase tracking-wider">
                  Commitment Date
                </label>
                <input
                  type="date"
                  value={commitmentDate}
                  onChange={(e) => setCommitmentDate(e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-700 font-mono"
                  id="form-commitment-date"
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-500 mb-1 uppercase tracking-wider">
                  Start of Repair
                </label>
                <input
                  type="date"
                  value={startOfRepair}
                  onChange={(e) => setStartOfRepair(e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-200 bg-amber-500/10 p-2 text-slate-700 font-mono font-semibold"
                  id="form-start-date"
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-500 mb-1 uppercase tracking-wider">
                  Target Completion
                </label>
                <input
                  type="date"
                  value={targetCompletion}
                  onChange={(e) => setTargetCompletion(e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-200 bg-amber-500/10 p-2 text-slate-700 font-mono font-semibold"
                  id="form-completion-date"
                />
              </div>
            </div>
            <p className="text-[10px] text-slate-400 leading-tight">
              * Note: The Gantt bar and weekly allocations are generated strictly from <strong>Start of Repair</strong> to <strong>Target Completion</strong>. 
              The <strong>Date Needed</strong> is used solely for determining schedule status (On Schedule, At Risk, Delayed).
            </p>
          </div>

          {/* Cost input */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
            <h4 className="text-xs font-mono font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1">
              <Calculator className="w-3.5 h-3.5 text-brand-500" />
              <span>Projected Repair Cost (₱ Philippine Peso)</span>
            </h4>

            <div>
              <label className="block text-[10px] font-semibold text-slate-500 mb-1 uppercase tracking-wider">
                Projected Repair Cost (₱)
              </label>
              <input
                type="number"
                min="0"
                value={projectedRepairCost || ''}
                onChange={(e) => setProjectedRepairCost(Number(e.target.value) || 0)}
                placeholder="e.g. 500000"
                className="w-full text-xs rounded-lg border border-slate-200 bg-white p-2.5 text-slate-700 font-mono font-bold"
                id="form-projected-cost"
              />
            </div>

            {/* Total display */}
            <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-slate-700">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Aggregated Repair Capital
              </span>
              <span className="text-sm font-mono font-bold text-slate-900 bg-white px-3 py-1 rounded-lg border border-slate-200">
                {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(projectedRepairCost)}
              </span>
            </div>
          </div>

        </form>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50 transition-colors cursor-pointer"
            id="btn-modal-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-5 py-2 rounded-lg text-xs font-semibold bg-brand-500 hover:bg-brand-600 text-white shadow-sm transition-all cursor-pointer"
            id="btn-modal-save"
          >
            {editingRecord ? 'Save Changes' : 'Add Record'}
          </button>
        </div>

      </div>
    </div>
  );
};
