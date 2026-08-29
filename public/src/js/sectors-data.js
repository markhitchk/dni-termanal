export const DNI_SECTORS_SEED = {
  network: {
    name: 'IMPERIUM STRATEGIC NETWORK',
    status: 'DATABASE OFFLINE',
    totals: { activeSectors: 8, activeFleets: 9, bases: 7, stations: 5, personnel: 0 }
  },
  sectors: [
    { id: 'sol', code: '01', name: 'SOL', status: 'SECURE', control: 100, personnel: 0, primary: 'SOL PRIME' },
    { id: 'acheron', code: '02', name: 'ACHERON', status: 'CONTESTED', control: 87, personnel: 0, primary: 'ACHERON PRIME' },
    { id: 'vega', code: '03', name: 'VEGA', status: 'SECURE', control: 96, personnel: 0, primary: 'VEGA PRIME' },
    { id: 'nyx', code: '04', name: 'NYX', status: 'ALERT', control: 74, personnel: 0, primary: 'NYX ANCHOR' },
    { id: 'arcadia', code: '05', name: 'ARCADIA', status: 'SECURE', control: 93, personnel: 0, primary: 'ARCADIA' },
    { id: 'helios', code: '06', name: 'HELIOS', status: 'SECURE', control: 91, personnel: 0, primary: 'HELIOS GATE' },
    { id: 'orpheus', code: '07', name: 'ORPHEUS', status: 'UNKNOWN', control: 61, personnel: 0, primary: 'ORPHEUS DEEP' },
    { id: 'frontier', code: '08', name: 'FRONTIER', status: 'ALERT', control: 68, personnel: 0, primary: 'FRONTIER LINE' }
  ],
  assets: [
    { id: 'bastion-prime', sectorId: 'sol', type: 'base', name: 'Imperial Government', status: 'OPERATIONAL', personnel: 0, location: 'SOL PRIME', x: 24, y: 43 },
    { id: '1st-fleet', sectorId: 'sol', type: 'fleet', name: 'Fleet Dragoon', shortName: 'Fleet Dragoon', status: 'OPERATIONAL', personnel: 0, vessels: 8, commander: 'ADM. CAELUS', location: 'ORBIT — SOL PRIME', homeBaseId: 'bastion-prime', x: 76, y: 46 },
    { id: 'sol-relay', sectorId: 'sol', type: 'station', name: 'Imperial Security Bureau', status: 'OPERATIONAL', personnel: 0, location: 'SOL HIGH ORBIT', x: 51, y: 18 },
    { id: 'sol-yard', sectorId: 'sol', type: 'installation', name: 'Secret Service', status: 'OPERATIONAL', personnel: 0, location: 'INNER SYSTEM', x: 48, y: 78 },
    { id: 'cerberus', sectorId: 'acheron', type: 'base', name: 'Imperial Medical Corps', shortName: 'Imperial Medical Corps', status: 'OPERATIONAL', personnel: 0, location: 'ACHERON PRIME', x: 22, y: 48 },
    { id: '4th-fleet', sectorId: 'acheron', type: 'fleet', name: 'Fleet Mythos', shortName: 'Fleet Mythos', status: 'OPERATIONAL', personnel: 0, vessels: 9, commander: 'ADM. VORAN', location: 'ORBIT — ACHERON PRIME', homeBaseId: 'cerberus', x: 78, y: 48 },
    { id: '7th-support', sectorId: 'acheron', type: 'fleet', name: 'Fleet Verminoth', shortName: 'Fleet Verminoth', status: 'OPERATIONAL', personnel: 0, vessels: 4, commander: 'CDR. TAL', location: 'CERBERUS APPROACH', homeBaseId: 'cerberus', x: 72, y: 75 },
    { id: 'relay-04', sectorId: 'acheron', type: 'station', name: 'Imperial Engineering Corps', status: 'OPERATIONAL', personnel: 0, location: 'ACHERON OUTER', x: 50, y: 18 },
    { id: 'vega-bastion', sectorId: 'vega', type: 'base', name: 'Officer Corps', status: 'OPERATIONAL', personnel: 0, location: 'VEGA PRIME', x: 25, y: 50 },
    { id: '5th-fleet', sectorId: 'vega', type: 'fleet', name: 'Fleet Vettlir', shortName: 'Fleet Vettlir', status: 'OPERATIONAL', personnel: 0, vessels: 6, commander: 'ADM. RHEA', location: 'VEGA PRIME', homeBaseId: 'vega-bastion', x: 76, y: 48 },
    { id: 'vega-relay', sectorId: 'vega', type: 'station', name: 'Recruiter', status: 'OPERATIONAL', personnel: 0, location: 'VEGA GATE', x: 50, y: 18 },
    { id: 'nyx-watch', sectorId: 'nyx', type: 'installation', name: 'Marketing', status: 'ALERT', personnel: 0, location: 'NYX ANCHOR', x: 25, y: 45 },
    { id: '9th-fleet', sectorId: 'nyx', type: 'fleet', name: 'Fleet Crips', shortName: 'Fleet Crips', status: 'ALERT', personnel: 0, vessels: 5, commander: 'CDR. KEST', location: 'NYX PERIMETER', x: 75, y: 50 },
    { id: 'arcadia-base', sectorId: 'arcadia', type: 'base', name: 'Logistics', status: 'OPERATIONAL', personnel: 0, location: 'ARCADIA', x: 25, y: 50 },
    { id: '2nd-fleet', sectorId: 'arcadia', type: 'fleet', name: 'Imperial Naval Corps', shortName: 'Imperial Naval Corps', status: 'OPERATIONAL', personnel: 0, vessels: 7, commander: 'ADM. ORIS', location: 'ARCADIA ORBIT', homeBaseId: 'arcadia-base', x: 75, y: 50 },
    { id: 'arcadia-station', sectorId: 'arcadia', type: 'station', name: 'Banker', status: 'OPERATIONAL', personnel: 0, location: 'ARCADIA HIGH', x: 50, y: 18 },
    { id: 'helios-base', sectorId: 'helios', type: 'base', name: 'Ambassador', status: 'OPERATIONAL', personnel: 0, location: 'HELIOS GATE', x: 25, y: 50 },
    { id: '3rd-fleet', sectorId: 'helios', type: 'fleet', name: 'Imperial ODST', shortName: 'Imperial ODST', status: 'OPERATIONAL', personnel: 0, vessels: 6, commander: 'ADM. MERIDIAN', location: 'HELIOS GATE', homeBaseId: 'helios-base', x: 75, y: 50 },
    { id: 'helios-array', sectorId: 'helios', type: 'installation', name: 'Foreign Affairs Agent', status: 'OPERATIONAL', personnel: 0, location: 'GATE PERIMETER', x: 50, y: 20 },
    { id: 'orpheus-post', sectorId: 'orpheus', type: 'base', name: 'HC-3 | Lord Sovereign', status: 'UNKNOWN', personnel: 0, location: 'ORPHEUS DEEP', x: 25, y: 50 },
    { id: '11th-fleet', sectorId: 'orpheus', type: 'fleet', name: 'Imperial Marine Corps', shortName: 'Imperial Marine Corps', status: 'OPERATIONAL', personnel: 0, vessels: 4, commander: 'CDR. SERA', location: 'ORPHEUS DEEP', homeBaseId: 'orpheus-post', x: 75, y: 50 },
    { id: 'orpheus-relay', sectorId: 'orpheus', type: 'station', name: 'HC-2S | High Lords', status: 'OFFLINE', personnel: 0, location: 'OUTER ORPHEUS', x: 50, y: 18 },
    { id: 'frontier-base', sectorId: 'frontier', type: 'base', name: 'HC-2', status: 'ALERT', personnel: 0, location: 'FRONTIER LINE', x: 25, y: 50 },
    { id: '12th-fleet', sectorId: 'frontier', type: 'fleet', name: 'Imperial Logistics Corps', shortName: 'Imperial Logistics Corps', status: 'ALERT', personnel: 0, vessels: 5, commander: 'CDR. HOLT', location: 'FRONTIER LINE', homeBaseId: 'frontier-base', x: 75, y: 50 },
    { id: 'frontier-station', sectorId: 'frontier', type: 'station', name: 'HC-1', status: 'OPERATIONAL', personnel: 0, location: 'FRONTIER APPROACH', x: 50, y: 18 }
  ],
  personnel: [],
  activity: []
};

export const ASSET_META = {
  fleet: { symbol: '●', label: 'NAVAL FLEET' },
  base: { symbol: '◆', label: 'MILITARY BASE' },
  station: { symbol: '◇', label: 'STATION' },
  installation: { symbol: '▣', label: 'INSTALLATION / FACILITY' }
};
