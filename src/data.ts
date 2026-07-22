import { EquipmentRecord, WeekColumn, SectionType, RepairStatus, NormalizedGanttRecord } from './types';

export const SECTIONS: SectionType[] = [
  'Electrical',
  'Vehicle',
  'Earthmoving',
  'Lifting',
  'Pile Driving'
];

export const MONTHS_DATA = [
  { name: 'July', index: 7, days: 31 },
  { name: 'August', index: 8, days: 31 },
  { name: 'September', index: 9, days: 30 },
  { name: 'October', index: 10, days: 31 },
  { name: 'November', index: 11, days: 30 },
  { name: 'December', index: 12, days: 31 }
];

export function generateWeeks(): WeekColumn[] {
  const weeks: WeekColumn[] = [];
  const monthAbbrev: { [key: string]: string } = {
    'July': 'Jul',
    'August': 'Aug',
    'September': 'Sep',
    'October': 'Oct',
    'November': 'Nov',
    'December': 'Dec'
  };

  MONTHS_DATA.forEach(m => {
    const abbrev = monthAbbrev[m.name];
    const weekRanges = [
      { weekIndex: 1, startDay: 1, endDay: 7 },
      { weekIndex: 2, startDay: 8, endDay: 14 },
      { weekIndex: 3, startDay: 15, endDay: 21 },
      { weekIndex: 4, startDay: 22, endDay: 28 },
      { weekIndex: 5, startDay: 29, endDay: m.days }
    ];

    weekRanges.forEach(wr => {
      // Month indices in JavaScript are 0-11
      const startDate = new Date(2026, m.index - 1, wr.startDay, 0, 0, 0);
      const endDate = new Date(2026, m.index - 1, wr.endDay, 23, 59, 59);

      weeks.push({
        id: `${m.name}-W${wr.weekIndex}`,
        monthName: m.name,
        monthIndex: m.index,
        weekIndex: wr.weekIndex,
        label: `W${wr.weekIndex}`,
        dateRangeText: `${abbrev} ${wr.startDay}–${wr.endDay}`,
        startDate,
        endDate
      });
    });
  });

  return weeks;
}

export function parseLocalDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.trim().split('-');
  if (parts.length !== 3) return null;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // 0-indexed
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  return new Date(year, month, day, 0, 0, 0, 0);
}

export function buildNormalizedRecord(
  record: EquipmentRecord,
  weeks: WeekColumn[]
): NormalizedGanttRecord {
  const id = record.id;
  const propertyNumber = record.propertyNumber || 'N/A';
  const startStr = record.startOfRepair ? record.startOfRepair.trim() : '';
  const targetStr = record.targetCompletion ? record.targetCompletion.trim() : '';

  const activeWeeks: { [weekId: string]: boolean } = {};
  const overlapDays: { [weekId: string]: number } = {};
  const weeklyAllocations: { [weekId: string]: number } = {};

  weeks.forEach(w => {
    activeWeeks[w.id] = false;
    overlapDays[w.id] = 0;
    weeklyAllocations[w.id] = 0;
  });

  const isUnscheduled = !startStr || !targetStr || isNaN(new Date(startStr + "T00:00:00").getTime()) || isNaN(new Date(targetStr + "T00:00:00").getTime());

  if (isUnscheduled) {
    return {
      id,
      propertyNumber,
      startOfRepair: '',
      targetCompletion: '',
      projectedRepairCost: record.projectedRepairCost || 0,
      totalRepairDays: 0,
      activeWeeks,
      overlapDays,
      weeklyAllocations,
      scheduledTotal: 0,
      unscheduledTotal: record.projectedRepairCost || 0,
      preJulyDays: 0,
      preJulyAllocation: 0,
      postDecemberDays: 0,
      postDecemberAllocation: 0,
      barStartIdx: -1,
      barEndIdx: -1,
      isUnscheduled: true,
      continuesBeyond: false,
      startsBefore: false,
      isValid: true,
      errors: []
    };
  }

  const repairStart = parseLocalDate(startStr)!;
  const repairEnd = parseLocalDate(targetStr)!;
  const totalRepairDays = Math.round((repairEnd.getTime() - repairStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  if (totalRepairDays <= 0) {
    return {
      id,
      propertyNumber,
      startOfRepair: startStr,
      targetCompletion: targetStr,
      projectedRepairCost: record.projectedRepairCost || 0,
      totalRepairDays: 0,
      activeWeeks,
      overlapDays,
      weeklyAllocations,
      scheduledTotal: 0,
      unscheduledTotal: record.projectedRepairCost || 0,
      preJulyDays: 0,
      preJulyAllocation: 0,
      postDecemberDays: 0,
      postDecemberAllocation: 0,
      barStartIdx: -1,
      barEndIdx: -1,
      isUnscheduled: true,
      continuesBeyond: false,
      startsBefore: false,
      isValid: false,
      errors: [`Start of Repair (${startStr}) is after Target Completion (${targetStr})`]
    };
  }

  const projectedCost = record.projectedRepairCost || 0;

  const timelineStart = new Date(2026, 6, 1, 0, 0, 0, 0);
  const timelineEnd = new Date(2026, 11, 31, 0, 0, 0, 0);

  const startsBefore = repairStart < timelineStart;
  const continuesBeyond = repairEnd > timelineEnd;

  let preJulyDays = 0;
  if (startsBefore) {
    const endOfJune = new Date(2026, 5, 30, 0, 0, 0, 0);
    const endForBefore = repairEnd < endOfJune ? repairEnd : endOfJune;
    preJulyDays = Math.round((endForBefore.getTime() - repairStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  }

  let postDecemberDays = 0;
  if (continuesBeyond) {
    const startOfJan = new Date(2027, 0, 1, 0, 0, 0, 0);
    const startForAfter = repairStart > startOfJan ? repairStart : startOfJan;
    postDecemberDays = Math.round((repairEnd.getTime() - startForAfter.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  }

  weeks.forEach(w => {
    const wStart = new Date(w.startDate.getFullYear(), w.startDate.getMonth(), w.startDate.getDate(), 0, 0, 0, 0);
    const wEnd = new Date(w.endDate.getFullYear(), w.endDate.getMonth(), w.endDate.getDate(), 0, 0, 0, 0);

    const overlapStart = repairStart > wStart ? repairStart : wStart;
    const overlapEnd = repairEnd < wEnd ? repairEnd : wEnd;

    if (overlapStart <= overlapEnd) {
      overlapDays[w.id] = Math.round((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    } else {
      overlapDays[w.id] = 0;
    }
  });

  let preJulyAllocation = totalRepairDays > 0 ? (preJulyDays / totalRepairDays) * projectedCost : 0;
  let postDecemberAllocation = totalRepairDays > 0 ? (postDecemberDays / totalRepairDays) * projectedCost : 0;

  preJulyAllocation = Math.round(preJulyAllocation * 100) / 100;
  postDecemberAllocation = Math.round(postDecemberAllocation * 100) / 100;

  weeks.forEach(w => {
    const days = overlapDays[w.id] || 0;
    const rawAmt = totalRepairDays > 0 ? (days / totalRepairDays) * projectedCost : 0;
    weeklyAllocations[w.id] = Math.round(rawAmt * 100) / 100;
  });

  const sumOfWeekly = weeks.reduce((sum, w) => sum + weeklyAllocations[w.id], 0);
  const totalAllocated = Number((preJulyAllocation + postDecemberAllocation + sumOfWeekly).toFixed(2));
  const discrepancy = projectedCost - totalAllocated;

  if (Math.abs(discrepancy) > 0.001) {
    let lastActiveWeekId = '';
    for (let i = weeks.length - 1; i >= 0; i--) {
      if (overlapDays[weeks[i].id] > 0) {
        lastActiveWeekId = weeks[i].id;
        break;
      }
    }

    if (lastActiveWeekId) {
      weeklyAllocations[lastActiveWeekId] = Number((weeklyAllocations[lastActiveWeekId] + discrepancy).toFixed(2));
    } else {
      if (startsBefore) {
        preJulyAllocation = Number((preJulyAllocation + discrepancy).toFixed(2));
      } else if (continuesBeyond) {
        postDecemberAllocation = Number((postDecemberAllocation + discrepancy).toFixed(2));
      }
    }
  }

  let barStartIdx = -1;
  let barEndIdx = -1;
  weeks.forEach((w, idx) => {
    const active = overlapDays[w.id] > 0;
    activeWeeks[w.id] = active;
    if (active) {
      if (barStartIdx === -1) barStartIdx = idx;
      barEndIdx = idx;
    }
  });

  const errors: string[] = [];
  weeks.forEach(w => {
    if (activeWeeks[w.id]) {
      const wEnd = new Date(w.endDate.getFullYear(), w.endDate.getMonth(), w.endDate.getDate(), 0, 0, 0, 0);
      if (wEnd < repairStart) {
        errors.push(`Record has active week ${w.id} ending before Start of Repair (${startStr})`);
      }
    }
  });

  weeks.forEach(w => {
    if (activeWeeks[w.id]) {
      const wStart = new Date(w.startDate.getFullYear(), w.startDate.getMonth(), w.startDate.getDate(), 0, 0, 0, 0);
      if (wStart > repairEnd) {
        errors.push(`Record has active week ${w.id} starting after Target Completion (${targetStr})`);
      }
    }
  });

  const finalSum = Number((weeks.reduce((sum, w) => sum + weeklyAllocations[w.id], 0) + preJulyAllocation + postDecemberAllocation).toFixed(2));
  if (Math.abs(finalSum - projectedCost) > 0.01) {
    errors.push(`Sum of allocations (${finalSum}) does not equal projected cost (${projectedCost})`);
  }

  return {
    id,
    propertyNumber,
    startOfRepair: startStr,
    targetCompletion: targetStr,
    projectedRepairCost: projectedCost,
    totalRepairDays,
    activeWeeks,
    overlapDays,
    weeklyAllocations,
    scheduledTotal: projectedCost,
    unscheduledTotal: 0,
    preJulyDays,
    preJulyAllocation,
    postDecemberDays,
    postDecemberAllocation,
    barStartIdx,
    barEndIdx,
    isUnscheduled: false,
    continuesBeyond,
    startsBefore,
    isValid: errors.length === 0,
    errors
  };
}

export function getGanttDataset(
  records: EquipmentRecord[],
  weeks: WeekColumn[]
): NormalizedGanttRecord[] {
  return records.map(r => buildNormalizedRecord(r, weeks));
}

export function getRecordDaysCount(record: EquipmentRecord): number {
  const norm = buildNormalizedRecord(record, generateWeeks());
  return norm.totalRepairDays;
}

export function calculateWeeklyAllocation(
  record: EquipmentRecord,
  weeks: WeekColumn[]
): { [weekId: string]: number } {
  const norm = buildNormalizedRecord(record, weeks);
  return norm.weeklyAllocations;
}

export function getRecordStatus(record: EquipmentRecord): RepairStatus {
  if (!record.startOfRepair || !record.targetCompletion) {
    return 'Unscheduled';
  }
  if (!record.dateNeeded) {
    return 'Unscheduled';
  }

  const needed = new Date(record.dateNeeded + "T00:00:00");
  const completion = new Date(record.targetCompletion + "T00:00:00");

  if (isNaN(needed.getTime()) || isNaN(completion.getTime())) {
    return 'Unscheduled';
  }

  const diffTime = needed.getTime() - completion.getTime();
  const diffDays = diffTime / (1000 * 60 * 60 * 24);

  if (diffDays < 0) {
    return 'Delayed';
  } else if (diffDays >= 0 && diffDays <= 7) {
    return 'At Risk';
  } else {
    return 'On Schedule';
  }
}

// Default Data Seed matching spreadsheet records and adding visual depth to other sections
export const DEFAULT_EQUIPMENT_RECORDS: EquipmentRecord[] = [
  // --- LIFTING ---
  {
    id: 'lift-1',
    section: 'Lifting',
    projectAllocation: 'CHP Solid Cement Plant – Kiln 3 Major Shutdown',
    equipmentType: 'Mobile Crane',
    propertyNumber: 'CR-221',
    dateNeeded: '2026-08-15',
    commitmentDate: '2026-07-18',
    startOfRepair: '2026-07-20',
    targetCompletion: '2026-08-12',
    repairScope: 'Engine Overhaul & Hydraulic Cylinder Seal Replacement',
    projectedRepairCost: 500000
  },
  {
    id: 'lift-2',
    section: 'Lifting',
    projectAllocation: 'CHP Solid Cement Plant – Kiln 3 Major Shutdown',
    equipmentType: 'Crawler Crane',
    propertyNumber: 'CR-232',
    dateNeeded: '2026-08-20',
    commitmentDate: '2026-07-15',
    startOfRepair: '2026-07-25',
    targetCompletion: '2026-08-25',
    repairScope: 'Main Boom Lattice Repair & Load Moment Indicator Recalibration',
    projectedRepairCost: 600000
  },
  {
    id: 'lift-3',
    section: 'Lifting',
    projectAllocation: 'DMCI Masbate Power Corporation',
    equipmentType: 'Mobile Crane',
    propertyNumber: 'CR-227',
    dateNeeded: '2026-09-10',
    commitmentDate: '2026-08-12',
    startOfRepair: '2026-08-15',
    targetCompletion: '2026-09-08',
    repairScope: 'Slewing Ring Bearing Replacement & Hydraulic Valve Block Repair',
    projectedRepairCost: 350000
  },
  {
    id: 'lift-4',
    section: 'Lifting',
    projectAllocation: 'Moonwalk Pipelaying',
    equipmentType: 'Mobile Crane',
    propertyNumber: 'CR-178',
    dateNeeded: '2026-11-05',
    commitmentDate: '2026-10-10',
    startOfRepair: '2026-10-15',
    targetCompletion: '2026-11-01',
    repairScope: 'Hook Block Maintenance & Main Wire Rope Spooling',
    projectedRepairCost: 200000
  },

  // --- ELECTRICAL ---
  {
    id: 'elec-1',
    section: 'Electrical',
    projectAllocation: 'Bataan Refinery Expansion',
    equipmentType: 'Generator Set',
    propertyNumber: 'GS-105',
    dateNeeded: '2026-09-01',
    commitmentDate: '2026-08-01',
    startOfRepair: '2026-08-05',
    targetCompletion: '2026-08-28',
    repairScope: 'Alternator Rewinding & Governor Control Unit Calibration',
    projectedRepairCost: 500000
  },
  {
    id: 'elec-2',
    section: 'Electrical',
    projectAllocation: 'Bataan Refinery Expansion',
    equipmentType: 'Transformer Unit',
    propertyNumber: 'TX-902',
    dateNeeded: '2026-10-15',
    commitmentDate: '2026-09-10',
    startOfRepair: '2026-09-15',
    targetCompletion: '2026-10-14',
    repairScope: 'Dielectric Oil Filtration & Bushing Replacement',
    projectedRepairCost: 660000
  },
  {
    id: 'elec-3',
    section: 'Electrical',
    projectAllocation: 'Sual Power Station Maintenance',
    equipmentType: 'High Voltage Switchgear',
    propertyNumber: 'SW-404',
    dateNeeded: '2026-12-10',
    commitmentDate: '2026-11-01',
    startOfRepair: '2026-11-05',
    targetCompletion: '2026-12-12',
    repairScope: 'Vacuum Circuit Breaker Overhaul & Relay Upgrade',
    projectedRepairCost: 420000
  },

  // --- VEHICLE ---
  {
    id: 'veh-1',
    section: 'Vehicle',
    projectAllocation: 'CHP Solid Cement Plant – Kiln 3 Major Shutdown',
    equipmentType: 'Heavy Utility Truck',
    propertyNumber: 'TR-402',
    dateNeeded: '2026-08-10',
    commitmentDate: '2026-07-20',
    startOfRepair: '2026-07-25',
    targetCompletion: '2026-08-09',
    repairScope: 'Brake System Overhaul & Transmission Clutch Assembly Repair',
    projectedRepairCost: 150000
  },
  {
    id: 'veh-2',
    section: 'Vehicle',
    projectAllocation: 'Cebu Port Reclamation',
    equipmentType: 'Boom Truck',
    propertyNumber: 'BT-312',
    dateNeeded: '2026-10-20',
    commitmentDate: '2026-09-15',
    startOfRepair: '2026-09-20',
    targetCompletion: '2026-10-19',
    repairScope: 'Outrigger Hydraulic Valve Block Resealing & Cylinders Rebuild',
    projectedRepairCost: 260000
  },
  {
    id: 'veh-3',
    section: 'Vehicle',
    projectAllocation: 'Cebu Port Reclamation',
    equipmentType: 'Lowbed Trailer',
    propertyNumber: 'LT-114',
    dateNeeded: '2026-11-15',
    commitmentDate: '2026-10-20',
    startOfRepair: '2026-10-25',
    targetCompletion: '2026-11-18',
    repairScope: 'Axle Suspension Realignment & Pneumatic Brake Line Retrofitting',
    projectedRepairCost: 100000
  },

  // --- EARTHMOVING ---
  {
    id: 'earth-1',
    section: 'Earthmoving',
    projectAllocation: 'Cebu Port Reclamation',
    equipmentType: 'Hydraulic Excavator',
    propertyNumber: 'EX-505',
    dateNeeded: '2026-09-15',
    commitmentDate: '2026-08-10',
    startOfRepair: '2026-08-15',
    targetCompletion: '2026-09-12',
    repairScope: 'Undercarriage Track Link & Idler Roller Assembly Replacement',
    projectedRepairCost: 500000
  },
  {
    id: 'earth-2',
    section: 'Earthmoving',
    projectAllocation: 'Cebu Port Reclamation',
    equipmentType: 'Crawler Dozer',
    propertyNumber: 'DZ-881',
    dateNeeded: '2026-10-30',
    commitmentDate: '2026-09-20',
    startOfRepair: '2026-09-25',
    targetCompletion: '2026-11-02',
    repairScope: 'Blade Lift Cylinder Weld & Edge Segment Replacement',
    projectedRepairCost: 410000
  },
  {
    id: 'earth-3',
    section: 'Earthmoving',
    projectAllocation: 'Bataan Refinery Expansion',
    equipmentType: 'Wheel Loader',
    propertyNumber: 'WL-204',
    dateNeeded: '2026-12-05',
    commitmentDate: '2026-11-05',
    startOfRepair: '2026-11-08',
    targetCompletion: '2026-12-01',
    repairScope: 'Transmission Torque Converter Fluid Coupling Overhaul',
    projectedRepairCost: 270000
  },

  // --- PILE DRIVING ---
  {
    id: 'pile-1',
    section: 'Pile Driving',
    projectAllocation: 'Cebu Port Reclamation',
    equipmentType: 'Diesel Pile Hammer',
    propertyNumber: 'PD-601',
    dateNeeded: '2026-08-25',
    commitmentDate: '2026-07-28',
    startOfRepair: '2026-08-01',
    targetCompletion: '2026-08-24',
    repairScope: 'Hammer Piston Segment Rings & Cylinder Sleeve Replacement',
    projectedRepairCost: 380000
  },
  {
    id: 'pile-2',
    section: 'Pile Driving',
    projectAllocation: 'Cebu Port Reclamation',
    equipmentType: 'Hydraulic Rotary Rig',
    propertyNumber: 'RH-702',
    dateNeeded: '2026-10-10',
    commitmentDate: '2026-09-05',
    startOfRepair: '2026-09-10',
    targetCompletion: '2026-10-11',
    repairScope: 'Rotary Head Subassembly Gearbox Rebuild & Kelly Bar Resealing',
    projectedRepairCost: 750000
  },
  {
    id: 'pile-3',
    section: 'Pile Driving',
    projectAllocation: 'Moonwalk Pipelaying',
    equipmentType: 'Vibratory Hammer',
    propertyNumber: 'VH-503',
    dateNeeded: '2026-11-25',
    commitmentDate: '2026-10-25',
    startOfRepair: '2026-11-01',
    targetCompletion: '2026-11-23',
    repairScope: 'Eccentric Eccentricity Bearing Replacement & Gear Lubricant Servicing',
    projectedRepairCost: 310000
  }
];

export function getProjectAllocations(records: EquipmentRecord[]): string[] {
  const projects = new Set<string>();
  records.forEach(r => {
    if (r.projectAllocation) {
      projects.add(r.projectAllocation);
    }
  });
  return Array.from(projects).sort();
}

export function getEquipmentTypes(records: EquipmentRecord[]): string[] {
  const types = new Set<string>();
  records.forEach(r => {
    if (r.equipmentType) {
      types.add(r.equipmentType);
    }
  });
  return Array.from(types).sort();
}
