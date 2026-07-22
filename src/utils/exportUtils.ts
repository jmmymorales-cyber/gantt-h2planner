import { EquipmentRecord, WeekColumn, SectionType, RepairStatus } from '../types';
import { getRecordStatus, calculateWeeklyAllocation, MONTHS_DATA, SECTIONS, buildNormalizedRecord } from '../data';
import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// Helper to format currency as PHP
export const formatCurrencyPHP = (val: number) => {
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

const formatCompactCurrencyPDF = (val: number) => {
  if (val === 0) return 'PHP 0';
  if (val >= 1_000_000) {
    return `PHP ${(val / 1_000_000).toFixed(1)}M`;
  }
  if (val >= 1_000) {
    return `PHP ${(val / 1_000).toFixed(0)}K`;
  }
  return `PHP ${val}`;
};

const formatCurrencyPDF = (val: number) => {
  if (val === 0) return 'PHP 0';
  return 'PHP ' + new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(val);
};

export function getPDFWeeklyAllocation(
  record: EquipmentRecord,
  weeks: WeekColumn[]
): { [weekId: string]: number } {
  return calculateWeeklyAllocation(record, weeks);
}

// Colors for cell fills (Gantt bars)
const STATUS_COLORS = {
  'On Schedule': { bg: 'D1FAE5', font: '065F46', rgb: [209, 250, 229], textRgb: [6, 95, 70] },
  'At Risk': { bg: 'FEF3C7', font: '92400E', rgb: [254, 243, 199], textRgb: [146, 64, 14] },
  'Delayed': { bg: 'FEE2E2', font: '991B1B', rgb: [254, 226, 226], textRgb: [153, 27, 27] },
  'Unscheduled': { bg: 'F3F4F6', font: '4B5563', rgb: [243, 244, 246], textRgb: [75, 85, 99] }
};

/**
 * Validates the data dataset for mathematical consistency & reconciliation
 */
export function validateReconciliation(records: EquipmentRecord[], weeks: WeekColumn[]) {
  const errors: string[] = [];

  records.forEach(r => {
    const cost = r.projectedRepairCost || 0;
    const alloc = calculateWeeklyAllocation(r, weeks);
    const sumAlloc = Object.values(alloc).reduce((sum, val) => sum + val, 0);

    // 1. Weekly allocated costs equal the repair's projected cost
    if (cost > 0 && Math.abs(sumAlloc - cost) > 2.0) {
      errors.push(`Record ${r.propertyNumber}: Sum of weekly allocations (${sumAlloc}) does not equal projected cost (${cost})`);
    }

    // 2. Unscheduled records have no false Gantt bar
    const status = getRecordStatus(r);
    if (status === 'Unscheduled') {
      if (r.startOfRepair && r.targetCompletion) {
        errors.push(`Record ${r.propertyNumber} is Unscheduled but has active start/target completion dates.`);
      }
    }
  });

  // Calculate sum of projected repair costs
  const totalCost = records.reduce((sum, r) => sum + (r.projectedRepairCost || 0), 0);

  // Sum of weekly allocations
  const weeklyTotals: { [weekId: string]: number } = {};
  weeks.forEach(w => { weeklyTotals[w.id] = 0; });
  records.forEach(r => {
    const alloc = calculateWeeklyAllocation(r, weeks);
    weeks.forEach(w => {
      weeklyTotals[w.id] += alloc[w.id] || 0;
    });
  });

  const sumWeeklyTotals = Object.values(weeklyTotals).reduce((sum, val) => sum + val, 0);
  if (records.length > 0 && Math.abs(sumWeeklyTotals - totalCost) > 5.0) {
    errors.push(`Reconciliation discrepancy: Weekly totals sum (${sumWeeklyTotals}) does not match projected cost sum (${totalCost})`);
  }

  // 3. Weekly totals equal monthly totals
  const monthlyTotals: { [monthName: string]: number } = {};
  MONTHS_DATA.forEach(m => { monthlyTotals[m.name] = 0; });
  weeks.forEach(w => {
    monthlyTotals[w.monthName] += weeklyTotals[w.id];
  });

  const sumMonthlyTotals = Object.values(monthlyTotals).reduce((sum, val) => sum + val, 0);
  if (records.length > 0 && Math.abs(sumMonthlyTotals - totalCost) > 5.0) {
    errors.push(`Reconciliation discrepancy: Monthly totals sum (${sumMonthlyTotals}) does not match projected cost sum (${totalCost})`);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Excel Export implementation
 */
export async function exportToExcel({
  records,
  allRecords,
  selectedSection,
  isMaster,
  isFullExport,
  activeFilters,
  weeks
}: {
  records: EquipmentRecord[];
  allRecords: EquipmentRecord[];
  selectedSection: SectionType;
  isMaster: boolean;
  isFullExport: boolean;
  activeFilters: {
    selectedProject: string;
    selectedType: string;
    searchPropertyNum: string;
    selectedMonth: string;
    selectedStatus: string;
  };
  weeks: WeekColumn[];
}) {
  const workbook = new ExcelJS.Workbook();
  
  if (isMaster) {
    // --- MASTER COST GANTT EXCEL EXPORT ---
    const worksheet = workbook.addWorksheet('Master Repair Cost Gantt');
    
    // Title Banner Row
    worksheet.mergeCells('A1:AK1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = `Master Portfolio Repair Cost Gantt & Activity Schedule (July - December 2026)`;
    titleCell.font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: 'FFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E293B' } }; // slate-800
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getRow(1).height = 40;

    // Build timeline headers mapping
    // Columns: Section Name (A), July (B-F, merged, plus subtotal G), August (H-L, plus M), ...
    // Total columns = 1 (Section) + 6 months * (5 weeks + 1 monthly total) = 37 columns
    // Headers 1st row: merged month headers
    const monthHeaderRow = worksheet.getRow(3);
    monthHeaderRow.height = 25;
    
    const secNameCell = worksheet.getCell('A3');
    secNameCell.value = 'Maintenance Section';
    secNameCell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFF' } };
    secNameCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '475569' } };
    secNameCell.alignment = { horizontal: 'center', vertical: 'middle' };
    secNameCell.border = { right: { style: 'medium', color: { argb: '000000' } } };

    let currentColIdx = 2; // Col B is 2
    MONTHS_DATA.forEach(m => {
      const startCol = currentColIdx;
      const endCol = currentColIdx + 5; // 5 weeks + 1 monthly subtotal
      worksheet.mergeCells(3, startCol, 3, endCol);
      
      const mCell = worksheet.getCell(3, startCol);
      mCell.value = m.name.toUpperCase();
      mCell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFF' } };
      mCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '3B82F6' } }; // blue-500
      mCell.alignment = { horizontal: 'center', vertical: 'middle' };
      mCell.border = { right: { style: 'medium', color: { argb: '000000' } } };
      
      currentColIdx += 6;
    });

    // Headers 2nd row: week labels + monthly totals + final Section Total column
    const weekHeaderRow = worksheet.getRow(4);
    weekHeaderRow.height = 25;
    
    worksheet.getCell('A4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } };
    worksheet.getCell('A4').border = { right: { style: 'medium', color: { argb: '000000' } } };

    currentColIdx = 2;
    MONTHS_DATA.forEach(m => {
      const mWeeks = weeks.filter(w => w.monthName === m.name);
      mWeeks.forEach(w => {
        const cell = worksheet.getCell(4, currentColIdx);
        cell.value = `${w.label}\n${w.dateRangeText}`;
        cell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: '334155' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F8FAFC' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = { bottom: { style: 'thin' }, right: { style: 'thin' } };
        currentColIdx++;
      });
      
      // Monthly subtotal column header
      const cell = worksheet.getCell(4, currentColIdx);
      cell.value = `${m.name.substring(0,3)} Total`;
      cell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: '1E3A8A' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E0F2FE' } }; // sky-100
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = { bottom: { style: 'thin', color: { argb: '000000' } }, right: { style: 'medium', color: { argb: '000000' } } };
      currentColIdx++;
    });

    // Final total column header
    worksheet.mergeCells('AL3:AL3'); // merge single cell
    worksheet.getCell('AL3').value = 'SECTION TOTAL';
    worksheet.getCell('AL3').font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFF' } };
    worksheet.getCell('AL3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F172A' } };
    worksheet.getCell('AL3').alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.getCell('AL4').value = 'Cumulative Cost';
    worksheet.getCell('AL4').font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FFFFFF' } };
    worksheet.getCell('AL4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E293B' } };
    worksheet.getCell('AL4').alignment = { horizontal: 'center', vertical: 'middle' };

    // --- POPULATE DATA ROWS FOR MASTER ---
    // Calculate aggregates
    const sectionWeeklyData: { [sec in SectionType]: { [weekId: string]: { cost: number, activeCount: number } } } = {} as any;
    const sectionMonthlyCosts: { [sec in SectionType]: { [monthName: string]: number } } = {} as any;
    const sectionTotals: { [sec in SectionType]: number } = {} as any;

    SECTIONS.forEach(sec => {
      sectionWeeklyData[sec] = {};
      sectionMonthlyCosts[sec] = {};
      sectionTotals[sec] = 0;
      weeks.forEach(w => {
        sectionWeeklyData[sec][w.id] = { cost: 0, activeCount: 0 };
      });
      MONTHS_DATA.forEach(m => {
        sectionMonthlyCosts[sec][m.name] = 0;
      });
    });

    allRecords.forEach(record => {
      const alloc = calculateWeeklyAllocation(record, weeks);
      const sec = record.section;
      if (!sectionWeeklyData[sec]) return;

      weeks.forEach(w => {
        const amt = alloc[w.id] || 0;
        if (amt > 0) {
          sectionWeeklyData[sec][w.id].cost += amt;
          
          if (record.startOfRepair && record.targetCompletion) {
            const rStart = new Date(record.startOfRepair + "T00:00:00");
            const rEnd = new Date(record.targetCompletion + "T23:59:59");
            const wStart = new Date(w.startDate);
            const wEnd = new Date(w.endDate);
            const overlaps = !(wEnd < rStart || wStart > rEnd);
            if (overlaps) {
              sectionWeeklyData[sec][w.id].activeCount += 1;
            }
          }
        }
      });
    });

    SECTIONS.forEach(sec => {
      MONTHS_DATA.forEach(m => {
        weeks.forEach(w => {
          if (w.monthName === m.name) {
            sectionMonthlyCosts[sec][m.name] += sectionWeeklyData[sec][w.id].cost;
          }
        });
      });
      sectionTotals[sec] = Object.values(sectionMonthlyCosts[sec]).reduce((a, b) => a + b, 0);
    });

    let currentMasterRowIdx = 5;
    SECTIONS.forEach(sec => {
      const row = worksheet.getRow(currentMasterRowIdx);
      row.height = 32;

      // Section Name cell
      const nameCell = row.getCell(1);
      nameCell.value = sec;
      nameCell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: '0F172A' } };
      nameCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } };
      nameCell.border = { right: { style: 'medium', color: { argb: '000000' } }, bottom: { style: 'thin' } };
      nameCell.alignment = { vertical: 'middle' };

      // Write weeks and months
      let cIdx = 2;
      MONTHS_DATA.forEach(m => {
        const mWeeks = weeks.filter(w => w.monthName === m.name);
        mWeeks.forEach(w => {
          const cell = row.getCell(cIdx);
          const data = sectionWeeklyData[sec][w.id];
          
          if (data.cost > 0) {
            cell.value = `₱${(data.cost / 1000).toFixed(0)}K\n(${data.activeCount} rep.)`;
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'EEF2FF' } }; // indigo-50
            cell.font = { name: 'Consolas', size: 8, bold: true, color: { argb: '312E81' } };
          } else {
            cell.value = '—';
            cell.font = { name: 'Consolas', size: 8, color: { argb: '94A3B8' } };
          }
          
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
          cell.border = { bottom: { style: 'thin' }, right: { style: 'thin' } };
          cIdx++;
        });

        // Month subtotal cell
        const mSubCell = row.getCell(cIdx);
        const val = sectionMonthlyCosts[sec][m.name];
        mSubCell.value = val;
        mSubCell.numFmt = '"₱"#,##0';
        mSubCell.font = { name: 'Consolas', size: 9, bold: true };
        mSubCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F0F9FF' } }; // sky-50
        mSubCell.alignment = { horizontal: 'right', vertical: 'middle' };
        mSubCell.border = { bottom: { style: 'thin' }, right: { style: 'medium', color: { argb: '000000' } } };
        cIdx++;
      });

      // Section total cell
      const totCell = row.getCell(cIdx);
      totCell.value = sectionTotals[sec];
      totCell.numFmt = '"₱"#,##0';
      totCell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFF' } };
      totCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '475569' } };
      totCell.alignment = { horizontal: 'right', vertical: 'middle' };
      totCell.border = { bottom: { style: 'thin' } };

      currentMasterRowIdx++;
    });

    // --- MASTER PORTFOLIO TOTALS ROW ---
    const totalRow = worksheet.getRow(currentMasterRowIdx);
    totalRow.height = 35;
    
    const labelCell = totalRow.getCell(1);
    labelCell.value = 'MASTER PORTFOLIO TOTAL';
    labelCell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFF' } };
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F172A' } };
    labelCell.border = { right: { style: 'medium', color: { argb: '000000' } } };
    labelCell.alignment = { vertical: 'middle' };

    let cIdx = 2;
    MONTHS_DATA.forEach(m => {
      const mWeeks = weeks.filter(w => w.monthName === m.name);
      
      mWeeks.forEach(w => {
        const cell = totalRow.getCell(cIdx);
        // Formula sum for weekly total
        const colLetter = cell.address.replace(/[0-9]/g, '');
        cell.value = {
          formula: `=SUM(${colLetter}5:${colLetter}9)`
        };
        cell.numFmt = '"₱"#,##0';
        cell.font = { name: 'Consolas', size: 8, bold: true, color: { argb: 'F59E0B' } }; // amber-500
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F172A' } };
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.border = { right: { style: 'thin' } };
        cIdx++;
      });

      // Formula sum for monthly total column
      const mSubCell = totalRow.getCell(cIdx);
      const colLetter = mSubCell.address.replace(/[0-9]/g, '');
      mSubCell.value = {
        formula: `=SUM(${colLetter}5:${colLetter}9)`
      };
      mSubCell.numFmt = '"₱"#,##0';
      mSubCell.font = { name: 'Consolas', size: 9, bold: true, color: { argb: 'FCD34D' } }; // amber-300
      mSubCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '020617' } }; // slate-950
      mSubCell.alignment = { horizontal: 'right', vertical: 'middle' };
      mSubCell.border = { right: { style: 'medium', color: { argb: 'FFFFFF' } } };
      cIdx++;
    });

    // Master grand total
    const grandCell = totalRow.getCell(cIdx);
    grandCell.value = {
      formula: `=SUM(AL5:AL9)`
    };
    grandCell.numFmt = '"₱"#,##0';
    grandCell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FCD34D' } };
    grandCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '020617' } };
    grandCell.alignment = { horizontal: 'right', vertical: 'middle' };

    // Set widths
    worksheet.getColumn(1).width = 25;
    for (let c = 2; c <= 37; c++) {
      worksheet.getColumn(c).width = 12;
    }
    worksheet.getColumn(38).width = 18; // AL

    // Freeze headers and Section name
    worksheet.views = [
      { state: 'frozen', xSplit: 1, ySplit: 4 }
    ];

  } else {
    // --- SECTION GANTT WORKSPACE EXCEL EXPORT ---
    const worksheet = workbook.addWorksheet(`${selectedSection} Section Gantt`);
    
    // Add title
    worksheet.mergeCells('A1:AN1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = `${selectedSection} Section Maintenance & Repair Cost Gantt Workspace`;
    titleCell.font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: 'FFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '4338CA' } }; // indigo-700
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getRow(1).height = 40;

    // Filters Sub-Banner Info
    worksheet.mergeCells('A2:AN2');
    const subtitleCell = worksheet.getCell('A2');
    const filterInfoText = `Active Filters: Project: ${activeFilters.selectedProject} | Type: ${activeFilters.selectedType} | Month: ${activeFilters.selectedMonth} | Status: ${activeFilters.selectedStatus} | Search: ${activeFilters.searchPropertyNum || 'None'}`;
    subtitleCell.value = `${filterInfoText}  •  Exported on: ${new Date().toLocaleString()}`;
    subtitleCell.font = { name: 'Segoe UI', size: 10, italic: true, color: { argb: 'E2E8F0' } };
    subtitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '312E81' } }; // indigo-950
    subtitleCell.alignment = { horizontal: 'left', vertical: 'middle' };
    worksheet.getRow(2).height = 25;

    // Fixed columns:
    // A: Section, B: Project, C: Equipment Type, D: Property No, E: Date Needed, F: Start of Repair, G: Target Comp, H: Repair Scope, I: Projected Cost, J: Status
    const fixedCols = [
      { header: 'Section', key: 'section', width: 14 },
      { header: 'Project Allocation', key: 'project', width: 28 },
      { header: 'Equipment Type', key: 'type', width: 18 },
      { header: 'Property Number', key: 'prop_num', width: 14 },
      { header: 'Date Needed', key: 'date_needed', width: 14 },
      { header: 'Start of Repair', key: 'start_repair', width: 14 },
      { header: 'Target Completion', key: 'target_comp', width: 14 },
      { header: 'Repair Scope', key: 'scope', width: 25 },
      { header: 'Projected Cost', key: 'cost', width: 18 },
      { header: 'Status', key: 'status', width: 14 }
    ];

    // Headers Row 3 (Months header)
    const monthHeaderRow = worksheet.getRow(3);
    monthHeaderRow.height = 25;
    
    // Fixed columns headers backfills
    fixedCols.forEach((col, idx) => {
      const cell = monthHeaderRow.getCell(idx + 1);
      cell.value = col.header;
      cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E293B' } }; // Slate-800
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = { right: { style: 'thin', color: { argb: '475569' } } };
    });
    worksheet.getCell(3, 10).border = { right: { style: 'medium', color: { argb: '000000' } } };

    // Month headers starting from column 11 (K)
    let colIdx = 11;
    MONTHS_DATA.forEach(m => {
      worksheet.mergeCells(3, colIdx, 3, colIdx + 4); // 5 weeks
      const cell = worksheet.getCell(3, colIdx);
      cell.value = m.name.toUpperCase();
      cell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '3B82F6' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { right: { style: 'medium', color: { argb: '000000' } } };
      colIdx += 5;
    });

    // Headers Row 4 (Week headers and details)
    const weekHeaderRow = worksheet.getRow(4);
    weekHeaderRow.height = 25;
    
    fixedCols.forEach((col, idx) => {
      const cell = weekHeaderRow.getCell(idx + 1);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } };
      cell.border = { right: { style: 'thin' }, bottom: { style: 'medium', color: { argb: '000000' } } };
    });
    worksheet.getCell(4, 10).border = { right: { style: 'medium', color: { argb: '000000' } }, bottom: { style: 'medium', color: { argb: '000000' } } };

    colIdx = 11;
    weeks.forEach(w => {
      const cell = weekHeaderRow.getCell(colIdx);
      cell.value = `${w.label}\n${w.dateRangeText}`;
      cell.font = { name: 'Segoe UI', size: 8, bold: true, color: { argb: '334155' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F8FAFC' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = { right: { style: 'thin' }, bottom: { style: 'medium', color: { argb: '000000' } } };
      colIdx++;
    });

    // Set column widths
    fixedCols.forEach((col, idx) => {
      worksheet.getColumn(idx + 1).width = col.width;
    });
    for (let c = 11; c <= 40; c++) {
      worksheet.getColumn(c).width = 11;
    }

    // --- GROUP BY PROJECT ALLOCATION AND EQUIPMENT TYPE ---
    // Group records by project allocation
    const projectsMap: { [projName: string]: EquipmentRecord[] } = {};
    records.forEach(r => {
      if (!projectsMap[r.projectAllocation]) {
        projectsMap[r.projectAllocation] = [];
      }
      projectsMap[r.projectAllocation].push(r);
    });

    const projectNames = Object.keys(projectsMap).sort();
    let currentRowIdx = 5;

    // Accumulators for section grand totals
    const sectionWeeklyTotals: { [weekId: string]: number } = {};
    weeks.forEach(w => { sectionWeeklyTotals[w.id] = 0; });
    let sectionGrandCost = 0;

    projectNames.forEach(projName => {
      const projRecords = projectsMap[projName];
      
      // Sort projRecords by Equipment Type
      projRecords.sort((a, b) => a.equipmentType.localeCompare(b.equipmentType));

      const projTotalCost = projRecords.reduce((sum, r) => sum + (r.projectedRepairCost || 0), 0);
      const projUnitCount = projRecords.length;

      // 1. PROJECT HEADER ROW
      worksheet.mergeCells(currentRowIdx, 1, currentRowIdx, 10);
      const projHeaderCell = worksheet.getCell(currentRowIdx, 1);
      projHeaderCell.value = `${projName.toUpperCase()}  (${projUnitCount} ${projUnitCount === 1 ? 'Unit' : 'Units'} Scheduled)`;
      projHeaderCell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: '1E3A8A' } };
      projHeaderCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'EEF2FF' } }; // Indigo-50
      projHeaderCell.alignment = { vertical: 'middle' };
      
      // Project headers row border
      for (let c = 1; c <= 40; c++) {
        worksheet.getCell(currentRowIdx, c).border = {
          top: { style: 'thin' },
          bottom: { style: 'thin' }
        };
      }
      worksheet.getCell(currentRowIdx, 10).border = { right: { style: 'medium', color: { argb: '000000' } }, bottom: { style: 'thin' } };

      // Calculate project weekly allocations for subtotal formulas
      const projWeeklyTotals: { [weekId: string]: number } = {};
      weeks.forEach(w => { projWeeklyTotals[w.id] = 0; });
      projRecords.forEach(r => {
        const alloc = calculateWeeklyAllocation(r, weeks);
        weeks.forEach(w => {
          projWeeklyTotals[w.id] += alloc[w.id] || 0;
        });
      });

      // Write project weekly totals in the project header row
      let colIdx = 11;
      weeks.forEach(w => {
        const cell = worksheet.getCell(currentRowIdx, colIdx);
        const val = projWeeklyTotals[w.id];
        if (val > 0) {
          cell.value = val;
          cell.numFmt = '"₱"#,##0';
          cell.font = { name: 'Consolas', size: 8, bold: true, color: { argb: '4338CA' } };
        } else {
          cell.value = '';
        }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'EEF2FF' } };
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        colIdx++;
      });

      worksheet.getRow(currentRowIdx).height = 25;
      currentRowIdx++;

      // 2. EQUIPMENT RECORDS UNDER PROJECT
      projRecords.forEach(record => {
        const row = worksheet.getRow(currentRowIdx);
        row.height = 24;
        row.outlineLevel = 1; // Group outline collapsible

        const norm = buildNormalizedRecord(record, weeks);
        const status = getRecordStatus(record);
        const totalCost = record.projectedRepairCost || 0;
        const alloc = norm.weeklyAllocations;

        // Write columns A to J
        row.getCell(1).value = record.section;
        row.getCell(2).value = record.projectAllocation;
        row.getCell(3).value = record.equipmentType;
        
        // Style Property number cell nicely
        const propCell = row.getCell(4);
        propCell.value = record.propertyNumber;
        propCell.font = { name: 'Consolas', size: 9, bold: true, color: { argb: '4F46E5' } };
        propCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F5F3FF' } };
        propCell.alignment = { horizontal: 'center', vertical: 'middle' };

        row.getCell(5).value = record.dateNeeded ? new Date(record.dateNeeded) : '';
        row.getCell(5).numFmt = 'yyyy-mm-dd';
        
        row.getCell(6).value = record.startOfRepair ? new Date(record.startOfRepair) : '';
        row.getCell(6).numFmt = 'yyyy-mm-dd';

        row.getCell(7).value = record.targetCompletion ? new Date(record.targetCompletion) : '';
        row.getCell(7).numFmt = 'yyyy-mm-dd';

        row.getCell(8).value = record.repairScope;
        row.getCell(8).alignment = { wrapText: true, vertical: 'middle' };

        const costCell = row.getCell(9);
        costCell.value = totalCost;
        costCell.numFmt = '"₱"#,##0';
        costCell.font = { name: 'Consolas', size: 9, bold: true };
        costCell.alignment = { horizontal: 'right', vertical: 'middle' };

        const statusCell = row.getCell(10);
        statusCell.value = status;
        statusCell.font = { name: 'Segoe UI', size: 9, bold: true };
        statusCell.alignment = { horizontal: 'center', vertical: 'middle' };
        statusCell.border = { right: { style: 'medium', color: { argb: '000000' } }, bottom: { style: 'thin' } };

        // Apply status colors to status cell
        const statusColors = STATUS_COLORS[status] || STATUS_COLORS['Unscheduled'];
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusColors.bg } };
        statusCell.font = { name: 'Segoe UI', size: 8, bold: true, color: { argb: statusColors.font } };

        // Draw Gantt bars in weekly cells starting from col 11
        const firstOverlapIdx = norm.isUnscheduled ? -1 : norm.barStartIdx;
        const lastOverlapIdx = norm.isUnscheduled ? -1 : norm.barEndIdx;

        colIdx = 11;
        weeks.forEach((w, idx) => {
          const cell = row.getCell(colIdx);
          const amt = alloc[w.id] || 0;
          const isWithinGantt = firstOverlapIdx !== -1 && lastOverlapIdx !== -1 && idx >= firstOverlapIdx && idx <= lastOverlapIdx;

          if (isWithinGantt) {
            // Gantt bar styling
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusColors.bg } };
            cell.font = { name: 'Segoe UI', size: 8, bold: true, color: { argb: statusColors.font } };
            
            // Print property number inside the first cell of the bar
            if (idx === firstOverlapIdx) {
              cell.value = `${record.propertyNumber} (₱${(totalCost / 1000).toFixed(0)}K)`;
              cell.alignment = { horizontal: 'left', vertical: 'middle' };
            } else {
              // Print weekly cost if we want or leave filled
              if (amt > 0) {
                cell.value = amt;
                cell.numFmt = '"₱"#,##0';
                cell.alignment = { horizontal: 'right', vertical: 'bottom' };
              }
            }
          } else {
            // Non-Gantt cell: print weekly allocation if there is financial value
            if (amt > 0) {
              cell.value = amt;
              cell.numFmt = '"₱"#,##0';
              cell.font = { name: 'Consolas', size: 8, color: { argb: '64748B' } };
              cell.alignment = { horizontal: 'right', vertical: 'middle' };
            }
          }

          cell.border = { right: { style: 'thin' }, bottom: { style: 'thin' } };
          colIdx++;
        });

        currentRowIdx++;
      });

      // 3. PROJECT FOOTER / SUBTOTAL ROW
      const subRow = worksheet.getRow(currentRowIdx);
      subRow.height = 24;
      subRow.outlineLevel = 0;
      
      subRow.getCell(1).value = 'Subtotal';
      worksheet.mergeCells(currentRowIdx, 1, currentRowIdx, 8);
      worksheet.getCell(currentRowIdx, 1).alignment = { horizontal: 'right', vertical: 'middle' };
      worksheet.getCell(currentRowIdx, 1).font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: '475569' } };

      const costSumCell = subRow.getCell(9);
      costSumCell.value = {
        formula: `=SUM(I${currentRowIdx - projUnitCount}:I${currentRowIdx - 1})`
      };
      costSumCell.numFmt = '"₱"#,##0';
      costSumCell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: '1E3A8A' } };
      costSumCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F8FAFC' } };
      costSumCell.border = { top: { style: 'thin' }, bottom: { style: 'double' }, left: { style: 'thin' }, right: { style: 'thin' } };

      subRow.getCell(10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F8FAFC' } };
      subRow.getCell(10).border = { top: { style: 'thin' }, bottom: { style: 'double' }, right: { style: 'medium', color: { argb: '000000' } } };

      // Sum formulas for weekly subtotal
      let cIdx = 11;
      weeks.forEach(w => {
        const cell = subRow.getCell(cIdx);
        const colLetter = cell.address.replace(/[0-9]/g, '');
        cell.value = {
          formula: `=SUM(${colLetter}${currentRowIdx - projUnitCount}:${colLetter}${currentRowIdx - 1})`
        };
        cell.numFmt = '"₱"#,##0';
        cell.font = { name: 'Consolas', size: 8, bold: true, color: { argb: '475569' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F8FAFC' } };
        cell.border = { top: { style: 'thin' }, bottom: { style: 'double' }, right: { style: 'thin' } };
        cIdx++;
      });

      currentRowIdx++;
      
      // Accumulate for grand totals
      sectionGrandCost += projTotalCost;
      weeks.forEach(w => {
        sectionWeeklyTotals[w.id] += projWeeklyTotals[w.id];
      });
    });

    // --- OVERALL SECTION GRAND TOTALS ROW ---
    const totalRow = worksheet.getRow(currentRowIdx);
    totalRow.height = 30;

    worksheet.mergeCells(currentRowIdx, 1, currentRowIdx, 8);
    const grandLabelCell = totalRow.getCell(1);
    grandLabelCell.value = `GRAND TOTAL (${selectedSection.toUpperCase()} SECTION)`;
    grandLabelCell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFF' } };
    grandLabelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1F2937' } }; // gray-800
    grandLabelCell.alignment = { horizontal: 'right', vertical: 'middle' };

    const grandCostCell = totalRow.getCell(9);
    grandCostCell.value = sectionGrandCost;
    grandCostCell.numFmt = '"₱"#,##0';
    grandCostCell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'F59E0B' } };
    grandCostCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '111827' } }; // gray-900
    grandCostCell.alignment = { horizontal: 'right', vertical: 'middle' };

    const emptyStatusCell = totalRow.getCell(10);
    emptyStatusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '111827' } };
    emptyStatusCell.border = { right: { style: 'medium', color: { argb: '000000' } } };

    let cIdx = 11;
    weeks.forEach(w => {
      const cell = totalRow.getCell(cIdx);
      cell.value = sectionWeeklyTotals[w.id] || 0;
      cell.numFmt = '"₱"#,##0';
      cell.font = { name: 'Consolas', size: 8, bold: true, color: { argb: '34D399' } }; // green-400
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '111827' } };
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
      cell.border = { right: { style: 'thin' } };
      cIdx++;
    });

    // Freeze first 10 columns and first 4 rows
    worksheet.views = [
      { state: 'frozen', xSplit: 10, ySplit: 4 }
    ];
  }

  // Generate unique file name
  const safeSection = selectedSection.replace(/\s+/g, '_');
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '_');
  let filename = '';
  if (isMaster) {
    filename = `Master_Repair_Cost_Gantt_July_December_2026.xlsx`;
  } else {
    filename = `${safeSection}_Section_Gantt_July_December_2026.xlsx`;
    if (activeFilters.selectedMonth !== 'All') {
      filename = `${safeSection}_Section_Gantt_${activeFilters.selectedMonth}_2026.xlsx`;
    }
  }

  // Trigger file download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

/**
 * PDF Export implementation using jsPDF and jsPDF-AutoTable
 */
export async function exportToPDF({
  records,
  allRecords,
  selectedSection,
  isMaster,
  isFullExport,
  activeFilters,
  weeks
}: {
  records: EquipmentRecord[];
  allRecords: EquipmentRecord[];
  selectedSection: SectionType;
  isMaster: boolean;
  isFullExport: boolean;
  activeFilters: {
    selectedProject: string;
    selectedType: string;
    searchPropertyNum: string;
    selectedMonth: string;
    selectedStatus: string;
  };
  weeks: WeekColumn[];
}) {
  // Setup standard A3 Landscape document (very wide, fits columns beautifully)
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a3'
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 420mm for A3
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm for A3

  // --- DRAW PAGE BORDERS AND HEADER BANNER ---
  const drawPageHeaderAndFooter = (docInstance: jsPDF, pageNum: number, totalPages: number) => {
    // Elegant dark slate top banner background
    docInstance.setFillColor(30, 41, 59); // slate-800
    docInstance.rect(15, 15, pageWidth - 30, 32, 'F');

    // Title
    docInstance.setTextColor(255, 255, 255);
    docInstance.setFont('Helvetica', 'bold');
    docInstance.setFontSize(18);
    if (isMaster) {
      docInstance.text('MASTER PORTFOLIO REPAIR COST GANTT REPORT', 20, 26);
    } else {
      docInstance.text(`${selectedSection.toUpperCase()} SECTION MAINTENANCE & REPAIR GANTT WORKSPACE`, 20, 26);
    }

    // Subtitle & Metadata
    docInstance.setFont('Helvetica', 'normal');
    docInstance.setFontSize(10);
    docInstance.setTextColor(203, 213, 225); // slate-300
    const filterText = isMaster 
      ? `Full Master Portfolio Overlook spanning 5 sections  •  July - December 2026`
      : `Filters: Project: ${activeFilters.selectedProject} | Type: ${activeFilters.selectedType} | Month: ${activeFilters.selectedMonth} | Status: ${activeFilters.selectedStatus}`;
    docInstance.text(`${filterText}  •  Export Date: ${new Date().toLocaleString()}`, 20, 32);

    // Dynamic brand element
    docInstance.setFillColor(245, 158, 11); // Amber accent marker
    docInstance.rect(15, 45, pageWidth - 30, 1.5, 'F');

    // Footer
    docInstance.setFontSize(9);
    docInstance.setTextColor(148, 163, 184); // slate-400
    docInstance.text(`Equipment Repair Forecast Portfolio Tracker  |  REPAIR_FORECAST Datasheet  |  Confidential Management Report`, 15, pageHeight - 10);
    docInstance.text(`Page ${pageNum} of ${totalPages}`, pageWidth - 15, pageHeight - 10, { align: 'right' });
  };

  if (isMaster) {
    // --- MASTER PDF REPORT ---
    // Prepare table headers
    // Row 1: Months
    // Row 2: Weeks / Month Totals
    const headRow1: any[] = [
      { content: 'Maintenance Section', styles: { halign: 'left', fillColor: [71, 85, 105], textColor: [255, 255, 255] } }
    ];
    const headRow2: any[] = [
      ''
    ];

    MONTHS_DATA.forEach(m => {
      headRow1.push({
        content: m.name.toUpperCase(),
        colSpan: 6,
        styles: { halign: 'center', fillColor: [59, 130, 246] }
      });

      const mWeeks = weeks.filter(w => w.monthName === m.name);
      mWeeks.forEach(w => {
        headRow2.push(`${w.label}\n${w.dateRangeText.split(' ')[1]}`); // e.g. "W1\n1–7"
      });
      headRow2.push(`${m.name.substring(0,3)} Tot`);
    });

    headRow1.push({
      content: 'CUMULATIVE',
      styles: { halign: 'center', fillColor: [15, 23, 42] }
    });
    headRow2.push('Sec Total');

    // Generate table body data
    const sectionWeeklyData: { [sec in SectionType]: { [weekId: string]: { cost: number, activeCount: number } } } = {} as any;
    const sectionMonthlyCosts: { [sec in SectionType]: { [monthName: string]: number } } = {} as any;
    const sectionTotals: { [sec in SectionType]: number } = {} as any;

    SECTIONS.forEach(sec => {
      sectionWeeklyData[sec] = {};
      sectionMonthlyCosts[sec] = {};
      sectionTotals[sec] = 0;
      weeks.forEach(w => {
        sectionWeeklyData[sec][w.id] = { cost: 0, activeCount: 0 };
      });
      MONTHS_DATA.forEach(m => {
        sectionMonthlyCosts[sec][m.name] = 0;
      });
    });

    allRecords.forEach(record => {
      const alloc = getPDFWeeklyAllocation(record, weeks);
      const sec = record.section;
      if (!sectionWeeklyData[sec]) return;

      weeks.forEach(w => {
        const amt = alloc[w.id] || 0;
        if (amt > 0) {
          sectionWeeklyData[sec][w.id].cost += amt;
          if (record.startOfRepair && record.targetCompletion) {
            const rStart = new Date(record.startOfRepair + "T00:00:00");
            const rEnd = new Date(record.targetCompletion + "T00:00:00");
            const wStart = new Date(w.startDate);
            wStart.setHours(0,0,0,0);
            const wEnd = new Date(w.endDate);
            wEnd.setHours(0,0,0,0);
            const overlaps = !(wEnd < rStart || wStart > rEnd);
            if (overlaps) {
              sectionWeeklyData[sec][w.id].activeCount += 1;
            }
          }
        }
      });
    });

    SECTIONS.forEach(sec => {
      MONTHS_DATA.forEach(m => {
        weeks.forEach(w => {
          if (w.monthName === m.name) {
            sectionMonthlyCosts[sec][m.name] += sectionWeeklyData[sec][w.id].cost;
          }
        });
      });
      // Section total must equal the sum of all equipment projected costs in that section
      sectionTotals[sec] = allRecords
        .filter(r => r.section === sec)
        .reduce((sum, r) => sum + (r.projectedRepairCost || 0), 0);
    });

    const bodyRows: any[] = [];
    SECTIONS.forEach(sec => {
      const rowData: any[] = [sec];
      MONTHS_DATA.forEach(m => {
        const mWeeks = weeks.filter(w => w.monthName === m.name);
        mWeeks.forEach(w => {
          const data = sectionWeeklyData[sec][w.id];
          if (data.cost > 0) {
            rowData.push(`${formatCompactCurrencyPDF(data.cost)}\n(${data.activeCount} rep)`);
          } else {
            rowData.push('—');
          }
        });
        rowData.push(formatCompactCurrencyPDF(sectionMonthlyCosts[sec][m.name]));
      });
      rowData.push(formatCurrencyPDF(sectionTotals[sec]));
      bodyRows.push(rowData);
    });

    // Master grand total row
    const grandRow: any[] = ['MASTER PORTFOLIO TOTAL'];
    MONTHS_DATA.forEach(m => {
      const mWeeks = weeks.filter(w => w.monthName === m.name);
      
      let mTotal = 0;
      mWeeks.forEach(w => {
        let wTotal = 0;
        SECTIONS.forEach(sec => {
          wTotal += sectionWeeklyData[sec][w.id].cost;
        });
        grandRow.push(formatCompactCurrencyPDF(wTotal));
        mTotal += wTotal;
      });
      
      grandRow.push(formatCompactCurrencyPDF(mTotal));
    });
    // Master Grand total cost column is the sum of all projected repair costs across all sections
    const grandCostAccum = allRecords.reduce((sum, r) => sum + (r.projectedRepairCost || 0), 0);
    grandRow.push(formatCurrencyPDF(grandCostAccum));
    bodyRows.push(grandRow);

    autoTable(doc, {
      head: [headRow1, headRow2],
      body: bodyRows,
      startY: 52,
      margin: { left: 15, right: 15, top: 52, bottom: 20 },
      styles: {
        font: 'Helvetica',
        fontSize: 7,
        cellPadding: 1.5,
        lineWidth: 0.1,
        lineColor: [226, 232, 240], // border-slate-200
        valign: 'middle',
        halign: 'center'
      },
      columnStyles: {
        0: { halign: 'left', fontStyle: 'bold', fontSize: 8.5, cellWidth: 35 }
      },
      didParseCell: (data) => {
        // Highlight Master grand total row
        if (data.row.index === bodyRows.length - 1) {
          data.cell.styles.fillColor = [15, 23, 42]; // slate-900
          data.cell.styles.textColor = [252, 211, 77]; // amber-300
          data.cell.styles.fontStyle = 'bold';
        }
        // Highlight Monthly Totals columns
        if (data.row.index < bodyRows.length - 1 && data.column.index > 0 && data.column.index % 6 === 0) {
          data.cell.styles.fillColor = [240, 249, 255]; // sky-50
          data.cell.styles.fontStyle = 'bold';
        }
        // Highlight Cumulative Cost cell
        if (data.row.index < bodyRows.length - 1 && data.column.index === data.table.columns.length - 1) {
          data.cell.styles.fillColor = [241, 245, 249];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    });

  } else {
    // --- SECTION WORKSPACE PDF REPORT ---
    // Prepare 2-row table headers
    const headRow1: any[] = [
      { content: 'Equipment Details', colSpan: 7, styles: { halign: 'center', fillColor: [30, 41, 59] } }
    ];
    const headRow2: any[] = [
      'Type', 'Property', 'Project Allocation', 'Start', 'Target', 'Cost', 'Status'
    ];

    MONTHS_DATA.forEach(m => {
      headRow1.push({
        content: m.name.toUpperCase(),
        colSpan: 5,
        styles: { halign: 'center', fillColor: [59, 130, 246] }
      });

      const mWeeks = weeks.filter(w => w.monthName === m.name);
      mWeeks.forEach(w => {
        headRow2.push(w.label);
      });
    });

    const bodyRows: any[] = [];
    
    // Sort & Group by Project Allocation
    const projectsMap: { [projName: string]: EquipmentRecord[] } = {};
    records.forEach(r => {
      if (!projectsMap[r.projectAllocation]) {
        projectsMap[r.projectAllocation] = [];
      }
      projectsMap[r.projectAllocation].push(r);
    });

    const projectNames = Object.keys(projectsMap).sort();
    
    // Key trackers to parse and paint custom background fills for Gantt bars
    // Format: list of row objects for styling cells
    const rowGanttRef: any[] = [];

    let currentPDFRowIdx = 0;
    projectNames.forEach(projName => {
      const projRecords = projectsMap[projName];
      projRecords.sort((a, b) => a.equipmentType.localeCompare(b.equipmentType));

      const projTotalCost = projRecords.reduce((sum, r) => sum + (r.projectedRepairCost || 0), 0);
      const projUnitCount = projRecords.length;

      // Project Header row
      const projHeaderRow = [
        { content: `${projName.toUpperCase()}   (${projUnitCount} Units Scheduled)`, colSpan: 7, styles: { fontStyle: 'bold', fillColor: [238, 242, 255], textColor: [30, 58, 138] } }
      ];

      // Sum of project weekly allocations for the header row
      const projWeeklyTotals: { [weekId: string]: number } = {};
      weeks.forEach(w => { projWeeklyTotals[w.id] = 0; });
      projRecords.forEach(r => {
        const alloc = getPDFWeeklyAllocation(r, weeks);
        weeks.forEach(w => {
          projWeeklyTotals[w.id] += alloc[w.id] || 0;
        });
      });

      weeks.forEach(w => {
        const val = projWeeklyTotals[w.id];
        projHeaderRow.push({
          content: val > 0 ? formatCompactCurrencyPDF(val) : '',
          styles: { fontStyle: 'bold', fillColor: [238, 242, 255], textColor: [67, 56, 202], halign: 'right' }
        } as any);
      });

      bodyRows.push(projHeaderRow);
      rowGanttRef.push({ isProjectHeader: true });
      currentPDFRowIdx++;

      // Equipment records rows
      projRecords.forEach(record => {
        const norm = buildNormalizedRecord(record, weeks);
        const status = getRecordStatus(record);
        const cost = record.projectedRepairCost || 0;
        const alloc = norm.weeklyAllocations;

        const firstOverlapIdx = norm.isUnscheduled ? -1 : norm.barStartIdx;
        const lastOverlapIdx = norm.isUnscheduled ? -1 : norm.barEndIdx;
        let customStatus = status.replace(' Schedule', '');

        if (norm.continuesBeyond) {
          customStatus = `${customStatus} (Cont. Beyond Dec)`;
        }

        // Determine Gantt bar label
        let label = `${record.propertyNumber}`;
        if (norm.startsBefore) {
          label = `${record.propertyNumber} (Carry-In)`;
        }

        const equipRow: any[] = [
          record.equipmentType,
          record.propertyNumber,
          record.projectAllocation,
          record.startOfRepair ? new Date(record.startOfRepair).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—',
          record.targetCompletion ? new Date(record.targetCompletion).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—',
          formatCurrencyPDF(cost),
          customStatus
        ];

        // Add 30 weeks timeline columns
        weeks.forEach((w, idx) => {
          const amt = alloc[w.id] || 0;
          const isWithinGantt = firstOverlapIdx !== -1 && lastOverlapIdx !== -1 && idx >= firstOverlapIdx && idx <= lastOverlapIdx;
          if (isWithinGantt && idx === firstOverlapIdx) {
            // Label inside first Gantt cell
            equipRow.push(label);
          } else {
            equipRow.push(amt > 0 ? formatCompactCurrencyPDF(amt) : '');
          }
        });

        bodyRows.push(equipRow);
        rowGanttRef.push({
          isProjectHeader: false,
          record,
          status,
          firstOverlapIdx,
          lastOverlapIdx
        });
        currentPDFRowIdx++;
      });

      // Project Subtotal Footer Row
      const subRow: any[] = [
        { content: 'Project Subtotal', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold', fillColor: [248, 250, 252] } },
        { content: formatCurrencyPDF(projTotalCost), styles: { fontStyle: 'bold', fillColor: [248, 250, 252], halign: 'right' } },
        { content: '', styles: { fillColor: [248, 250, 252] } }
      ];
      weeks.forEach(w => {
        const val = projWeeklyTotals[w.id];
        subRow.push({
          content: val > 0 ? formatCompactCurrencyPDF(val) : '',
          styles: { fontStyle: 'bold', fillColor: [248, 250, 252], halign: 'right' }
        } as any);
      });
      bodyRows.push(subRow);
      rowGanttRef.push({ isSubtotal: true });
      currentPDFRowIdx++;
    });

    // Section Grand Total overall Row
    const sectionGrandCost = records.reduce((sum, r) => sum + (r.projectedRepairCost || 0), 0);
    const sectionWeeklyTotals: { [weekId: string]: number } = {};
    weeks.forEach(w => { sectionWeeklyTotals[w.id] = 0; });
    records.forEach(r => {
      const alloc = getPDFWeeklyAllocation(r, weeks);
      weeks.forEach(w => {
        sectionWeeklyTotals[w.id] += alloc[w.id] || 0;
      });
    });

    const grandRow: any[] = [
      { content: `GRAND TOTAL (${selectedSection.toUpperCase()})`, colSpan: 5, styles: { halign: 'right', fontStyle: 'bold', fillColor: [31, 41, 55], textColor: [255, 255, 255] } },
      { content: formatCurrencyPDF(sectionGrandCost), styles: { fontStyle: 'bold', fillColor: [17, 24, 39], textColor: [252, 211, 77], halign: 'right' } },
      { content: '', styles: { fillColor: [17, 24, 39] } }
    ];
    weeks.forEach(w => {
      const val = sectionWeeklyTotals[w.id];
      grandRow.push({
        content: val > 0 ? formatCompactCurrencyPDF(val) : '',
        styles: { fontStyle: 'bold', fillColor: [17, 24, 39], textColor: [52, 211, 153], halign: 'right' }
      } as any);
    });
    bodyRows.push(grandRow);
    rowGanttRef.push({ isGrandTotal: true });

    // Render AutoTable on Landscape A3 PDF
    autoTable(doc, {
      head: [headRow1, headRow2],
      body: bodyRows,
      startY: 52,
      margin: { left: 15, right: 15, top: 52, bottom: 20 },
      styles: {
        font: 'Helvetica',
        fontSize: 6.5,
        cellPadding: 1.2,
        lineWidth: 0.1,
        lineColor: [226, 232, 240],
        valign: 'middle'
      },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 15 }, // Type
        1: { fontStyle: 'bold', halign: 'center', cellWidth: 12 }, // Prop No
        2: { cellWidth: 32 }, // Project Allocation
        3: { halign: 'center', cellWidth: 11 }, // Start
        4: { halign: 'center', cellWidth: 11 }, // Target
        5: { halign: 'right', cellWidth: 15 }, // Cost
        6: { halign: 'center', cellWidth: 12 } // Status
      },
      didParseCell: (data) => {
        const rowRef = rowGanttRef[data.row.index];
        if (!rowRef) return;

        // Color timeline columns 7 to 36 (representing W1 to W30)
        if (data.column.index >= 7 && !rowRef.isProjectHeader && !rowRef.isSubtotal && !rowRef.isGrandTotal) {
          const weekIdx = data.column.index - 7;
          const isWithinGantt = rowRef.firstOverlapIdx !== -1 && rowRef.lastOverlapIdx !== -1 && weekIdx >= rowRef.firstOverlapIdx && weekIdx <= rowRef.lastOverlapIdx;
          
          if (isWithinGantt) {
            const statusColors = STATUS_COLORS[rowRef.status] || STATUS_COLORS['Unscheduled'];
            data.cell.styles.fillColor = statusColors.rgb;
            data.cell.styles.textColor = statusColors.textRgb;
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fontSize = 6;
            if (weekIdx === rowRef.firstOverlapIdx) {
              data.cell.styles.halign = 'left';
            } else {
              data.cell.styles.halign = 'right';
            }
          }
        }
      }
    });
  }

  // Draw custom headers on each page dynamically
  const totalPages = doc.internal.pages.length - 1;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawPageHeaderAndFooter(doc, i, totalPages);
  }

  // Generate unique file name
  const safeSection = selectedSection.replace(/\s+/g, '_');
  let filename = '';
  if (isMaster) {
    filename = `Master_Repair_Cost_Gantt_July_December_2026.pdf`;
  } else {
    filename = `${safeSection}_Section_Gantt_July_December_2026.pdf`;
    if (activeFilters.selectedMonth !== 'All') {
      filename = `${safeSection}_Section_Gantt_${activeFilters.selectedMonth}_2026.pdf`;
    }
  }

  // Save the PDF doc
  doc.save(filename);
}
