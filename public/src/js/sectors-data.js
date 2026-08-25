export const DNI_SECTORS_SEED = {
  network: {
    name: 'IMPERIUM STRATEGIC NETWORK',
    status: 'NOMINAL',
    totals: { activeSectors: 8, activeFleets: 12, bases: 17, stations: 6, personnel: 284 }
  },
  sectors: [
    { id: 'sol', code: '01', name: 'SOL', status: 'SECURE', control: 100, personnel: 64, primary: 'SOL PRIME' },
    { id: 'acheron', code: '02', name: 'ACHERON', status: 'CONTESTED', control: 87, personnel: 72, primary: 'ACHERON PRIME' },
    { id: 'vega', code: '03', name: 'VEGA', status: 'SECURE', control: 96, personnel: 39, primary: 'VEGA PRIME' },
    { id: 'nyx', code: '04', name: 'NYX', status: 'ALERT', control: 74, personnel: 21, primary: 'NYX ANCHOR' },
    { id: 'arcadia', code: '05', name: 'ARCADIA', status: 'SECURE', control: 93, personnel: 26, primary: 'ARCADIA' },
    { id: 'helios', code: '06', name: 'HELIOS', status: 'SECURE', control: 91, personnel: 18, primary: 'HELIOS GATE' },
    { id: 'orpheus', code: '07', name: 'ORPHEUS', status: 'UNKNOWN', control: 61, personnel: 24, primary: 'ORPHEUS DEEP' },
    { id: 'frontier', code: '08', name: 'FRONTIER', status: 'ALERT', control: 68, personnel: 20, primary: 'FRONTIER LINE' }
  ],
  assets: [
    { id: 'bastion-prime', sectorId: 'sol', type: 'base', name: 'BASTION PRIME', status: 'OPERATIONAL', personnel: 42, location: 'SOL PRIME', assigned: ['1st-fleet'], x: 24, y: 43 },
    { id: '1st-fleet', sectorId: 'sol', type: 'fleet', name: '1ST IMPERIAL FLEET', shortName: '1ST FLEET', status: 'OPERATIONAL', personnel: 31, vessels: 8, commander: 'ADM. CAELUS', location: 'ORBIT — SOL PRIME', homeBaseId: 'bastion-prime', x: 76, y: 46 },
    { id: 'sol-relay', sectorId: 'sol', type: 'station', name: 'SOL RELAY STATION', status: 'OPERATIONAL', personnel: 8, location: 'SOL HIGH ORBIT', x: 51, y: 18 },
    { id: 'sol-yard', sectorId: 'sol', type: 'installation', name: 'SOL NAVAL YARD', status: 'OPERATIONAL', personnel: 15, location: 'INNER SYSTEM', x: 48, y: 78 },

    { id: 'cerberus', sectorId: 'acheron', type: 'base', name: 'CERBERUS FORWARD BASE', shortName: 'CERBERUS', status: 'OPERATIONAL', personnel: 72, location: 'ACHERON PRIME', assigned: ['4th-fleet','7th-support'], x: 22, y: 48 },
    { id: '4th-fleet', sectorId: 'acheron', type: 'fleet', name: '4TH IMPERIAL FLEET', shortName: '4TH FLEET', status: 'OPERATIONAL', personnel: 38, vessels: 9, commander: 'ADM. VORAN', location: 'ORBIT — ACHERON PRIME', homeBaseId: 'cerberus', x: 78, y: 48 },
    { id: '7th-support', sectorId: 'acheron', type: 'fleet', name: '7TH SUPPORT GROUP', status: 'OPERATIONAL', personnel: 14, vessels: 4, commander: 'CDR. TAL', location: 'CERBERUS APPROACH', homeBaseId: 'cerberus', x: 72, y: 75 },
    { id: 'relay-04', sectorId: 'acheron', type: 'station', name: 'RELAY 04', status: 'OPERATIONAL', personnel: 6, location: 'ACHERON OUTER', x: 50, y: 18 },

    { id: 'vega-bastion', sectorId: 'vega', type: 'base', name: 'VEGA BASTION', status: 'OPERATIONAL', personnel: 29, location: 'VEGA PRIME', x: 25, y: 50 },
    { id: '5th-fleet', sectorId: 'vega', type: 'fleet', name: '5TH IMPERIAL FLEET', shortName: '5TH FLEET', status: 'OPERATIONAL', personnel: 26, vessels: 6, commander: 'ADM. RHEA', location: 'VEGA PRIME', homeBaseId: 'vega-bastion', x: 76, y: 48 },
    { id: 'vega-relay', sectorId: 'vega', type: 'station', name: 'VEGA RELAY', status: 'OPERATIONAL', personnel: 5, location: 'VEGA GATE', x: 50, y: 18 },

    { id: 'nyx-watch', sectorId: 'nyx', type: 'installation', name: 'NYX WATCH', status: 'ALERT', personnel: 12, location: 'NYX ANCHOR', x: 25, y: 45 },
    { id: '9th-fleet', sectorId: 'nyx', type: 'fleet', name: '9TH IMPERIAL FLEET', shortName: '9TH FLEET', status: 'ALERT', personnel: 21, vessels: 5, commander: 'CDR. KEST', location: 'NYX PERIMETER', x: 75, y: 50 },

    { id: 'arcadia-base', sectorId: 'arcadia', type: 'base', name: 'ARCADIA COMMAND', status: 'OPERATIONAL', personnel: 26, location: 'ARCADIA', x: 25, y: 50 },
    { id: '2nd-fleet', sectorId: 'arcadia', type: 'fleet', name: '2ND IMPERIAL FLEET', shortName: '2ND FLEET', status: 'OPERATIONAL', personnel: 28, vessels: 7, commander: 'ADM. ORIS', location: 'ARCADIA ORBIT', homeBaseId: 'arcadia-base', x: 75, y: 50 },
    { id: 'arcadia-station', sectorId: 'arcadia', type: 'station', name: 'ARCADIA RELAY', status: 'OPERATIONAL', personnel: 4, location: 'ARCADIA HIGH', x: 50, y: 18 },

    { id: 'helios-base', sectorId: 'helios', type: 'base', name: 'HELIOS GARRISON', status: 'OPERATIONAL', personnel: 18, location: 'HELIOS GATE', x: 25, y: 50 },
    { id: '3rd-fleet', sectorId: 'helios', type: 'fleet', name: '3RD IMPERIAL FLEET', shortName: '3RD FLEET', status: 'OPERATIONAL', personnel: 22, vessels: 6, commander: 'ADM. MERIDIAN', location: 'HELIOS GATE', homeBaseId: 'helios-base', x: 75, y: 50 },
    { id: 'helios-array', sectorId: 'helios', type: 'installation', name: 'HELIOS SENSOR ARRAY', status: 'OPERATIONAL', personnel: 7, location: 'GATE PERIMETER', x: 50, y: 20 },

    { id: 'orpheus-post', sectorId: 'orpheus', type: 'base', name: 'ORPHEUS LISTENING POST', status: 'UNKNOWN', personnel: 11, location: 'ORPHEUS DEEP', x: 25, y: 50 },
    { id: '11th-fleet', sectorId: 'orpheus', type: 'fleet', name: '11TH RECON FLEET', shortName: '11TH FLEET', status: 'OPERATIONAL', personnel: 13, vessels: 4, commander: 'CDR. SERA', location: 'ORPHEUS DEEP', x: 75, y: 50 },
    { id: 'orpheus-relay', sectorId: 'orpheus', type: 'station', name: 'ORPHEUS RELAY', status: 'OFFLINE', personnel: 0, location: 'OUTER ORPHEUS', x: 50, y: 18 },

    { id: 'frontier-base', sectorId: 'frontier', type: 'base', name: 'FRONTIER BASTION', status: 'ALERT', personnel: 20, location: 'FRONTIER LINE', x: 25, y: 50 },
    { id: '12th-fleet', sectorId: 'frontier', type: 'fleet', name: '12TH IMPERIAL FLEET', shortName: '12TH FLEET', status: 'ALERT', personnel: 19, vessels: 5, commander: 'CDR. HOLT', location: 'FRONTIER LINE', homeBaseId: 'frontier-base', x: 75, y: 50 },
    { id: 'frontier-station', sectorId: 'frontier', type: 'station', name: 'FRONTIER RELAY 06', status: 'OPERATIONAL', personnel: 5, location: 'FRONTIER APPROACH', x: 50, y: 18 }
  ],
  personnel: [
    { id: 'vesper', name: 'R. VESPER', rank: 'Lieutenant', status: 'ACTIVE', sectorId: 'acheron', assignmentId: '4th-fleet' },
    { id: 'tal', name: 'M. TAL', rank: 'Commander', status: 'ACTIVE', sectorId: 'acheron', assignmentId: '7th-support' },
    { id: 'eris', name: 'J. ERIS', rank: 'Chief Specialist', status: 'ACTIVE', sectorId: 'acheron', assignmentId: 'relay-04' },
    { id: 'aurek', name: 'K. AUREK', rank: 'Captain', status: 'ACTIVE', sectorId: 'sol', assignmentId: '1st-fleet' },
    { id: 'mara', name: 'S. MARA', rank: 'Lieutenant', status: 'ACTIVE', sectorId: 'sol', assignmentId: 'bastion-prime' },
    { id: 'rhea', name: 'D. RHEA', rank: 'Captain', status: 'ACTIVE', sectorId: 'vega', assignmentId: '5th-fleet' },
    { id: 'keel', name: 'T. KEEL', rank: 'Specialist', status: 'ACTIVE', sectorId: 'nyx', assignmentId: 'nyx-watch' },
    { id: 'oris', name: 'P. ORIS', rank: 'Captain', status: 'ACTIVE', sectorId: 'arcadia', assignmentId: '2nd-fleet' },
    { id: 'meridian', name: 'A. MERIDIAN', rank: 'Captain', status: 'ACTIVE', sectorId: 'helios', assignmentId: '3rd-fleet' },
    { id: 'sera', name: 'L. SERA', rank: 'Lieutenant', status: 'ACTIVE', sectorId: 'orpheus', assignmentId: '11th-fleet' },
    { id: 'holt', name: 'V. HOLT', rank: 'Commander', status: 'ACTIVE', sectorId: 'frontier', assignmentId: '12th-fleet' }
  ],
  activity: [
    { id: 'evt-1', time: '03:22', publicText: '4TH FLEET redeployed ACHERON → SOL', adminText: '4TH FLEET redeployed ACHERON → SOL / authorized by STRATEGIC COMMAND', type: 'REDEPLOYMENT' },
    { id: 'evt-2', time: '03:18', publicText: 'LT. VESPER transferred 4TH FLEET → BASTION PRIME', adminText: 'LT. VESPER transferred 4TH FLEET → BASTION PRIME / previous sector ACHERON / authorized by PERSONNEL COMMAND', type: 'TRANSFER' },
    { id: 'evt-3', time: '02:51', publicText: 'RELAY-06 status changed to OPERATIONAL', adminText: 'RELAY-06 status OFFLINE → OPERATIONAL / authorized by NETWORK CONTROL', type: 'STATUS' },
    { id: 'evt-4', time: '02:37', publicText: '7TH SUPPORT GROUP entered ACHERON SECTOR', adminText: '7TH SUPPORT GROUP entered ACHERON SECTOR / deployment order DNI-7S-441', type: 'MOVEMENT' },
    { id: 'evt-5', time: '01:54', publicText: 'NYX WATCH elevated to ALERT', adminText: 'NYX WATCH OPERATIONAL → ALERT / perimeter event review required', type: 'ALERT' }
  ]
};

export const ASSET_META = {
  fleet: { symbol: '●', label: 'NAVAL FLEET' },
  base: { symbol: '◆', label: 'MILITARY BASE' },
  station: { symbol: '◇', label: 'STATION' },
  installation: { symbol: '▣', label: 'INSTALLATION / FACILITY' }
};
