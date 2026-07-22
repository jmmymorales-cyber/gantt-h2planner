export type SectionType = 'Electrical' | 'Vehicle' | 'Earthmoving' | 'Lifting' | 'Pile Driving';

export type RepairStatus = 'On Schedule' | 'At Risk' | 'Delayed' | 'Unscheduled';

export interface EquipmentRecord {
  id: string;
  section: SectionType;
  projectAllocation: string;
  equipmentType: string;
  propertyNumber: string; // e.g. CR-221
  dateNeeded: string; // YYYY-MM-DD
  commitmentDate: string; // YYYY-MM-DD (can be empty)
  startOfRepair: string; // YYYY-MM-DD
  targetCompletion: string; // YYYY-MM-DD
  repairScope: string;
  projectedRepairCost: number; // Single field: Projected Repair Cost (₱)
}

export interface WeekColumn {
  id: string; // e.g. "Jul-W1"
  monthName: string; // "July"
  monthIndex: number; // 7 (July) to 12 (December)
  weekIndex: number; // 1 to 5
  label: string; // "W1"
  dateRangeText: string; // "Jul 1–7"
  startDate: Date;
  endDate: Date;
}

export interface ProjectGroup {
  projectName: string;
  records: EquipmentRecord[];
  totalCost: number;
  unitCount: number;
}

export interface WeeklyCostAllocation {
  weekId: string;
  amount: number;
}

export interface ReconciledSectionSummary {
  section: SectionType;
  monthlyTotals: { [monthName: string]: number };
  totalCost: number;
}

export interface NormalizedGanttRecord {
  id: string;
  propertyNumber: string;
  startOfRepair: string;
  targetCompletion: string;
  projectedRepairCost: number;
  totalRepairDays: number;
  activeWeeks: { [weekId: string]: boolean };
  overlapDays: { [weekId: string]: number };
  weeklyAllocations: { [weekId: string]: number };
  scheduledTotal: number;
  unscheduledTotal: number;
  preJulyDays: number;
  preJulyAllocation: number;
  postDecemberDays: number;
  postDecemberAllocation: number;
  barStartIdx: number;
  barEndIdx: number;
  isUnscheduled: boolean;
  continuesBeyond: boolean;
  startsBefore: boolean;
  isValid: boolean;
  errors?: string[];
}
