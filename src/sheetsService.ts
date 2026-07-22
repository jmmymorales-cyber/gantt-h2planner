import { EquipmentRecord } from './types';

export interface SpreadsheetInfo {
  id: string;
  name: string;
  webViewLink?: string;
}

// Search for a spreadsheet named "Repair Cost Planning Master Forecast" in the user's Google Drive
export const searchSpreadsheet = async (accessToken: string): Promise<SpreadsheetInfo | null> => {
  try {
    const q = encodeURIComponent("mimeType='application/vnd.google-apps.spreadsheet' and name='Repair Cost Planning Master Forecast' and trashed=false");
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,webViewLink)`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    
    if (!res.ok) {
      throw new Error(`Failed to search Drive API: ${res.statusText}`);
    }
    
    const data = await res.json();
    if (data.files && data.files.length > 0) {
      return data.files[0];
    }
    return null;
  } catch (err) {
    console.error('Error searching spreadsheet:', err);
    return null;
  }
};

// Create a new Google Spreadsheet with the "REPAIR_FORECAST" worksheet
export const createSpreadsheet = async (accessToken: string): Promise<SpreadsheetInfo> => {
  try {
    const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: 'Repair Cost Planning Master Forecast',
        },
        sheets: [
          {
            properties: {
              title: 'REPAIR_FORECAST',
              gridProperties: {
                frozenRowCount: 1,
              }
            },
          },
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(`Failed to create Spreadsheet: ${res.statusText}`);
    }

    const data = await res.json();
    
    // Get webViewLink via Drive API
    let webViewLink = `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit`;
    try {
      const driveRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${data.spreadsheetId}?fields=webViewLink`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      if (driveRes.ok) {
        const driveData = await driveRes.json();
        webViewLink = driveData.webViewLink || webViewLink;
      }
    } catch (e) {
      console.warn('Failed to retrieve webViewLink from Drive API:', e);
    }

    return {
      id: data.spreadsheetId,
      name: data.properties.title,
      webViewLink,
    };
  } catch (err) {
    console.error('Error creating spreadsheet:', err);
    throw err;
  }
};

// Verify if a Spreadsheet ID is valid and contains "REPAIR_FORECAST"
// If it's valid but missing "REPAIR_FORECAST", we can create the sheet inside it
export const verifyAndFetchSpreadsheet = async (
  spreadsheetId: string,
  accessToken: string
): Promise<{ info: SpreadsheetInfo; sheetExists: boolean }> => {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Spreadsheet with ID ${spreadsheetId} not found or inaccessible.`);
  }

  const data = await res.json();
  const sheets = data.sheets || [];
  const sheetExists = sheets.some((s: any) => s.properties.title === 'REPAIR_FORECAST');

  // If sheet doesn't exist, try to add it
  if (!sheetExists) {
    try {
      const addSheetRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requests: [
              {
                addSheet: {
                  properties: {
                    title: 'REPAIR_FORECAST',
                    gridProperties: {
                      frozenRowCount: 1,
                    }
                  },
                },
              },
            ],
          }),
        }
      );
      if (!addSheetRes.ok) {
        throw new Error('Failed to create REPAIR_FORECAST sheet in spreadsheet.');
      }
    } catch (e: any) {
      throw new Error(`The spreadsheet is valid but we failed to add a worksheet named "REPAIR_FORECAST": ${e.message}`);
    }
  }

  // Get WebViewLink
  let webViewLink = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  try {
    const driveRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${spreadsheetId}?fields=webViewLink`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (driveRes.ok) {
      const driveData = await driveRes.json();
      webViewLink = driveData.webViewLink || webViewLink;
    }
  } catch (e) {
    // ignore
  }

  return {
    info: {
      id: spreadsheetId,
      name: data.properties.title,
      webViewLink,
    },
    sheetExists: true,
  };
};

export function cleanCurrencyString(val: any): { original: string; cleaned: string; parsed: number } {
  if (val === undefined || val === null) {
    return { original: '', cleaned: '', parsed: 0 };
  }
  const original = String(val);
  
  if (typeof val === 'number') {
    return { original, cleaned: String(val), parsed: val };
  }
  
  let str = original.trim();
  if (str === '') {
    return { original, cleaned: '', parsed: 0 };
  }
  
  // Remove ₱, commas, normal/non-breaking spaces
  let cleaned = str.replace(/₱/g, '');
  cleaned = cleaned.replace(/,/g, '');
  cleaned = cleaned.replace(/[\s\u00A0\u2007\u202F\u200B]+/g, '');
  
  // Keep only digits, decimal point, negative sign
  cleaned = cleaned.replace(/[^-0-9.]/g, '');
  
  if (cleaned === '') {
    return { original, cleaned: '', parsed: 0 };
  }
  
  const parsed = Number(cleaned);
  if (isNaN(parsed)) {
    return { original, cleaned, parsed: 0 };
  }
  
  return { original, cleaned, parsed };
}

export interface FetchResult {
  records: EquipmentRecord[];
  diagnostics: {
    rowsRead: number;
    validRecords: number;
    nonZeroCostRecords: number;
    zeroOrBlankCostRecords: number;
    totalParsedCost: number;
    validGanttDates: number;
    missingGanttDates: number;
    sampleLogs: Array<{
      id: string;
      originalCost: string;
      cleanedCost: string;
      parsedCost: number;
    }>;
  };
}

// Fetch repair forecast records from spreadsheet
export const fetchRecordsFromSheet = async (
  spreadsheetId: string,
  accessToken: string
): Promise<FetchResult> => {
  const range = 'REPAIR_FORECAST!A:Z';
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to fetch sheet values: ${res.statusText}`);
  }

  const data = await res.json();
  const rows: any[][] = data.values || [];

  if (rows.length === 0) {
    return {
      records: [],
      diagnostics: {
        rowsRead: 0,
        validRecords: 0,
        nonZeroCostRecords: 0,
        zeroOrBlankCostRecords: 0,
        totalParsedCost: 0,
        validGanttDates: 0,
        missingGanttDates: 0,
        sampleLogs: []
      }
    };
  }

  // 1. Normalize worksheet headers before matching
  const headerRow = rows[0] || [];
  const normalizedHeaders = headerRow.map(h => String(h).trim().toLowerCase());

  // Find column indexes by matching normalized header names
  const idIdx = normalizedHeaders.indexOf('id');
  const sectionIdx = normalizedHeaders.indexOf('section');
  const projectAllocationIdx = normalizedHeaders.indexOf('project allocation');
  const equipmentTypeIdx = normalizedHeaders.indexOf('equipment type');
  const propertyNumberIdx = normalizedHeaders.indexOf('property number');
  const dateNeededIdx = normalizedHeaders.indexOf('date needed');
  const commitmentDateIdx = normalizedHeaders.indexOf('commitment date');
  const startOfRepairIdx = normalizedHeaders.indexOf('start of repair');
  const targetCompletionIdx = normalizedHeaders.indexOf('target completion');
  const repairScopeIdx = normalizedHeaders.indexOf('repair scope');
  const projectedRepairCostIdx = normalizedHeaders.indexOf('projected repair cost');

  const getValueByHeader = (row: any[], index: number) => {
    if (index === -1 || index >= row.length) return '';
    return row[index] !== undefined && row[index] !== null ? String(row[index]).trim() : '';
  };

  const records: EquipmentRecord[] = [];
  const sampleLogs: any[] = [];
  
  let validRecordsCount = 0;
  let nonZeroCostRecordsCount = 0;
  let zeroOrBlankCostRecordsCount = 0;
  let totalParsedCostSum = 0;
  let validGanttDatesCount = 0;
  let missingGanttDatesCount = 0;

  // Skip header row at index 0
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0 || row.every(cell => cell === '' || cell === null || cell === undefined)) {
      continue; // Skip empty rows
    }

    const id = getValueByHeader(row, idIdx);
    const section = getValueByHeader(row, sectionIdx);

    // Skip row if both ID and Section are empty to avoid capturing fully empty rows
    if (!id && !section) {
      continue;
    }

    const rawCostValue = projectedRepairCostIdx !== -1 && projectedRepairCostIdx < row.length ? row[projectedRepairCostIdx] : '';
    const { original, cleaned, parsed } = cleanCurrencyString(rawCostValue);

    const projectAllocation = getValueByHeader(row, projectAllocationIdx);
    const equipmentType = getValueByHeader(row, equipmentTypeIdx);
    const propertyNumber = getValueByHeader(row, propertyNumberIdx);
    const dateNeeded = getValueByHeader(row, dateNeededIdx);
    const commitmentDate = getValueByHeader(row, commitmentDateIdx);
    const startOfRepair = getValueByHeader(row, startOfRepairIdx);
    const targetCompletion = getValueByHeader(row, targetCompletionIdx);
    const repairScope = getValueByHeader(row, repairScopeIdx);

    const hasGanttDates = startOfRepair !== '' && targetCompletion !== '';

    let parsedSection: any = 'Electrical';
    const cleanSec = (section || '').trim().toLowerCase();
    if (cleanSec.includes('electric')) parsedSection = 'Electrical';
    else if (cleanSec.includes('vehicle')) parsedSection = 'Vehicle';
    else if (cleanSec.includes('earth') || cleanSec.includes('moving')) parsedSection = 'Earthmoving';
    else if (cleanSec.includes('lift')) parsedSection = 'Lifting';
    else if (cleanSec.includes('pile') || cleanSec.includes('drive')) parsedSection = 'Pile Driving';

    records.push({
      id: id || `record-row-${i}`,
      section: parsedSection,
      projectAllocation: projectAllocation || 'General Project',
      equipmentType: equipmentType || 'Unknown Equipment',
      propertyNumber: propertyNumber || 'N/A',
      dateNeeded,
      commitmentDate,
      startOfRepair,
      targetCompletion,
      repairScope: repairScope || 'General Repair',
      projectedRepairCost: parsed,
    });

    validRecordsCount += 1;
    if (parsed > 0) {
      nonZeroCostRecordsCount += 1;
    } else {
      zeroOrBlankCostRecordsCount += 1;
    }
    totalParsedCostSum += parsed;

    if (hasGanttDates) {
      validGanttDatesCount += 1;
    } else {
      missingGanttDatesCount += 1;
    }

    if (sampleLogs.length < 5) {
      sampleLogs.push({
        id: id || `Row ${i}`,
        originalCost: original,
        cleanedCost: cleaned,
        parsedCost: parsed
      });
    }
  }

  const diagnostics = {
    rowsRead: rows.length,
    validRecords: validRecordsCount,
    nonZeroCostRecords: nonZeroCostRecordsCount,
    zeroOrBlankCostRecords: zeroOrBlankCostRecordsCount,
    totalParsedCost: totalParsedCostSum,
    validGanttDates: validGanttDatesCount,
    missingGanttDates: missingGanttDatesCount,
    sampleLogs
  };

  return { records, diagnostics };
};

// Clear sheet and rewrite all records
export const writeRecordsToSheet = async (
  spreadsheetId: string,
  accessToken: string,
  records: EquipmentRecord[]
): Promise<void> => {
  // 1. Clear existing values to prevent dangling rows
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/REPAIR_FORECAST!A:Z:clear`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  // 2. Format values for Google Sheets write-back
  const headers = [
    'ID',
    'Section',
    'Project Allocation',
    'Equipment Type',
    'Property Number',
    'Date Needed',
    'Commitment Date',
    'Start of Repair',
    'Target Completion',
    'Repair Scope',
    'Projected Repair Cost',
  ];

  const valueRows = records.map((r) => [
    r.id,
    r.section,
    r.projectAllocation,
    r.equipmentType,
    r.propertyNumber,
    r.dateNeeded,
    r.commitmentDate,
    r.startOfRepair,
    r.targetCompletion,
    r.repairScope,
    r.projectedRepairCost,
  ]);

  const body = {
    range: 'REPAIR_FORECAST!A:K',
    majorDimension: 'ROWS',
    values: [headers, ...valueRows],
  };

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/REPAIR_FORECAST!A:K?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to write values to sheet: ${res.statusText}`);
  }
};
