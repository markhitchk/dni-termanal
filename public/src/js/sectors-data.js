export const DNI_SECTORS_SEED = {
  network: {
    name: 'IMPERIUM STRATEGIC NETWORK',
    status: 'DATABASE OFFLINE',
    totals: { activeSectors: 8, activeFleets: 9, bases: 7, stations: 5, personnel: 0 }
  },
  sectors: [
    { id: 'sol', code: '01', name: 'STANTON', status: 'SECURE', control: 100, personnel: 0, primary: 'HURSTON' },
    { id: 'acheron', code: '02', name: 'PYRO', status: 'CONTESTED', control: 87, personnel: 0, primary: 'RUIN STATION' },
    { id: 'vega', code: '03', name: 'NYX', status: 'SECURE', control: 96, personnel: 0, primary: 'DELAMAR' },
    { id: 'nyx', code: '04', name: 'TERRA', status: 'ALERT', control: 74, personnel: 0, primary: 'TERRA III' },
    { id: 'arcadia', code: '05', name: 'MAGNUS', status: 'SECURE', control: 93, personnel: 0, primary: 'BOREA' },
    { id: 'helios', code: '06', name: 'CASTRA', status: 'SECURE', control: 91, personnel: 0, primary: 'CASCOM' },
    { id: 'orpheus', code: '07', name: 'HADRIAN', status: 'UNKNOWN', control: 61, personnel: 0, primary: 'HADRIAN SYSTEM' },
    { id: 'frontier', code: '08', name: 'ELLIS', status: 'ALERT', control: 68, personnel: 0, primary: 'GREEN' }
  ],
  assets: [
    { id: 'bastion-prime', sectorId: 'sol', type: 'base', name: 'Imperial Government', status: 'OPERATIONAL', personnel: 0, location: 'HURSTON', x: 24, y: 43 },
    { id: '1st-fleet', sectorId: 'sol', type: 'fleet', name: 'Fleet Dragoon', shortName: 'Fleet Dragoon', status: 'OPERATIONAL', personnel: 0, vessels: 8, commander: 'ADM. CAELUS', location: 'ORBIT — HURSTON', homeBaseId: 'bastion-prime', x: 76, y: 46 },
    { id: 'sol-relay', sectorId: 'sol', type: 'station', name: 'Imperial Security Bureau', status: 'OPERATIONAL', personnel: 0, location: 'CRUSADER', x: 51, y: 18 },
    { id: 'sol-yard', sectorId: 'sol', type: 'installation', name: 'Secret Service', status: 'OPERATIONAL', personnel: 0, location: 'ARCCORP', x: 48, y: 78 },
    { id: 'cerberus', sectorId: 'acheron', type: 'base', name: 'Imperial Medical Corps', shortName: 'Imperial Medical Corps', status: 'OPERATIONAL', personnel: 0, location: 'RUIN STATION', x: 22, y: 48 },
    { id: '4th-fleet', sectorId: 'acheron', type: 'fleet', name: 'Fleet Mythos', shortName: 'Fleet Mythos', status: 'OPERATIONAL', personnel: 0, vessels: 9, commander: 'ADM. VORAN', location: 'PYRO SYSTEM', homeBaseId: 'cerberus', x: 78, y: 48 },
    { id: '7th-support', sectorId: 'acheron', type: 'fleet', name: 'Fleet Verminoth', shortName: 'Fleet Verminoth', status: 'OPERATIONAL', personnel: 0, vessels: 4, commander: 'CDR. TAL', location: 'CHECKMATE STATION', homeBaseId: 'cerberus', x: 72, y: 75 },
    { id: 'relay-04', sectorId: 'acheron', type: 'station', name: 'Imperial Engineering Corps', status: 'OPERATIONAL', personnel: 0, location: 'TERMINUS', x: 50, y: 18 },
    { id: 'vega-bastion', sectorId: 'vega', type: 'base', name: 'Officer Corps', status: 'OPERATIONAL', personnel: 0, location: 'DELAMAR', x: 25, y: 50 },
    { id: '5th-fleet', sectorId: 'vega', type: 'fleet', name: 'Fleet Vettlir', shortName: 'Fleet Vettlir', status: 'OPERATIONAL', personnel: 0, vessels: 6, commander: 'ADM. RHEA', location: 'LEVSKI', homeBaseId: 'vega-bastion', x: 76, y: 48 },
    { id: 'vega-relay', sectorId: 'vega', type: 'station', name: 'Recruiter', status: 'OPERATIONAL', personnel: 0, location: "PEOPLE'S SERVICE STATION ALPHA", x: 50, y: 18 },
    { id: 'nyx-watch', sectorId: 'nyx', type: 'installation', name: 'Marketing', status: 'ALERT', personnel: 0, location: 'TERRA III', x: 25, y: 45 },
    { id: '9th-fleet', sectorId: 'nyx', type: 'fleet', name: 'Fleet Crips', shortName: 'Fleet Crips', status: 'ALERT', personnel: 0, vessels: 5, commander: 'CDR. KEST', location: 'TERRA SYSTEM', x: 75, y: 50 },
    { id: 'arcadia-base', sectorId: 'arcadia', type: 'base', name: 'Logistics', status: 'OPERATIONAL', personnel: 0, location: 'BOREA', x: 25, y: 50 },
    { id: '2nd-fleet', sectorId: 'arcadia', type: 'fleet', name: 'Imperial Naval Corps', shortName: 'Imperial Naval Corps', status: 'OPERATIONAL', personnel: 0, vessels: 7, commander: 'ADM. ORIS', location: 'MAGNUS SYSTEM', homeBaseId: 'arcadia-base', x: 75, y: 50 },
    { id: 'arcadia-station', sectorId: 'arcadia', type: 'station', name: 'Banker', status: 'OPERATIONAL', personnel: 0, location: 'BOREA', x: 50, y: 18 },
    { id: 'helios-base', sectorId: 'helios', type: 'base', name: 'Ambassador', status: 'OPERATIONAL', personnel: 0, location: 'CASCOM', x: 25, y: 50 },
    { id: '3rd-fleet', sectorId: 'helios', type: 'fleet', name: 'Imperial ODST', shortName: 'Imperial ODST', status: 'OPERATIONAL', personnel: 0, vessels: 6, commander: 'ADM. MERIDIAN', location: 'CASTRA SYSTEM', homeBaseId: 'helios-base', x: 75, y: 50 },
    { id: 'helios-array', sectorId: 'helios', type: 'installation', name: 'Foreign Affairs Agent', status: 'OPERATIONAL', personnel: 0, location: 'SHERMAN', x: 50, y: 20 },
    { id: 'orpheus-post', sectorId: 'orpheus', type: 'base', name: 'HC-3 | Lord Sovereign', status: 'UNKNOWN', personnel: 0, location: 'HADRIAN SYSTEM', x: 25, y: 50 },
    { id: '11th-fleet', sectorId: 'orpheus', type: 'fleet', name: 'Imperial Marine Corps', shortName: 'Imperial Marine Corps', status: 'OPERATIONAL', personnel: 0, vessels: 4, commander: 'CDR. SERA', location: 'HADRIAN SYSTEM', homeBaseId: 'orpheus-post', x: 75, y: 50 },
    { id: 'orpheus-relay', sectorId: 'orpheus', type: 'station', name: 'HC-2S | High Lords', status: 'OFFLINE', personnel: 0, location: 'HADRIAN SYSTEM', x: 50, y: 18 },
    { id: 'frontier-base', sectorId: 'frontier', type: 'base', name: 'HC-2', status: 'ALERT', personnel: 0, location: 'GREEN', x: 25, y: 50 },
    { id: '12th-fleet', sectorId: 'frontier', type: 'fleet', name: 'Imperial Logistics Corps', shortName: 'Imperial Logistics Corps', status: 'ALERT', personnel: 0, vessels: 5, commander: 'CDR. HOLT', location: 'AYDO', homeBaseId: 'frontier-base', x: 75, y: 50 },
    { id: 'frontier-station', sectorId: 'frontier', type: 'station', name: 'HC-1', status: 'OPERATIONAL', personnel: 0, location: 'ENCOLE STATION', x: 50, y: 18 }
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