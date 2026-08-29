export const DNI_SECTORS_SEED = {
  network: {
    name: 'IMPERIUM STRATEGIC NETWORK',
    status: 'DATABASE OFFLINE',
    totals: { activeSectors: 3, activeFleets: 9, bases: 7, stations: 5, personnel: 0 }
  },
  sectors: [
    { id: 'stanton', code: '01', name: 'STANTON', status: 'SECURE', control: 100, personnel: 0, primary: 'HURSTON' },
    { id: 'pyro', code: '02', name: 'PYRO', status: 'CONTESTED', control: 87, personnel: 0, primary: 'RUIN STATION' },
    { id: 'nyx', code: '03', name: 'NYX', status: 'SECURE', control: 96, personnel: 0, primary: 'LEVSKI / DELAMAR' }
  ],
  assets: [
    { id: 'bastion-prime', sectorId: 'stanton', type: 'base', name: 'Imperial Government', status: 'OPERATIONAL', personnel: 0, location: 'LORVILLE — HURSTON', x: 24, y: 43 },
    { id: '1st-fleet', sectorId: 'stanton', type: 'fleet', name: 'Fleet Dragoon', shortName: 'Fleet Dragoon', status: 'OPERATIONAL', personnel: 0, vessels: 8, commander: 'ADM. CAELUS', location: 'ORBIT — HURSTON', homeBaseId: 'bastion-prime', x: 76, y: 46 },
    { id: 'sol-relay', sectorId: 'stanton', type: 'station', name: 'Imperial Security Bureau', status: 'OPERATIONAL', personnel: 0, location: 'SERAPHIM STATION — CRUSADER', x: 51, y: 18 },
    { id: 'sol-yard', sectorId: 'stanton', type: 'installation', name: 'Secret Service', status: 'OPERATIONAL', personnel: 0, location: 'SECURITY POST KAREAH', x: 48, y: 78 },

    { id: 'cerberus', sectorId: 'pyro', type: 'base', name: 'Imperial Medical Corps', shortName: 'Imperial Medical Corps', status: 'OPERATIONAL', personnel: 0, location: 'RUIN STATION', x: 22, y: 48 },
    { id: '4th-fleet', sectorId: 'pyro', type: 'fleet', name: 'Fleet Mythos', shortName: 'Fleet Mythos', status: 'OPERATIONAL', personnel: 0, vessels: 9, commander: 'ADM. VORAN', location: 'PYRO SYSTEM', homeBaseId: 'cerberus', x: 78, y: 48 },
    { id: '7th-support', sectorId: 'pyro', type: 'fleet', name: 'Fleet Verminoth', shortName: 'Fleet Verminoth', status: 'OPERATIONAL', personnel: 0, vessels: 4, commander: 'CDR. TAL', location: 'CHECKMATE STATION', homeBaseId: 'cerberus', x: 72, y: 75 },
    { id: 'relay-04', sectorId: 'pyro', type: 'station', name: 'Imperial Engineering Corps', status: 'OPERATIONAL', personnel: 0, location: 'TERMINUS', x: 50, y: 18 },

    { id: 'vega-bastion', sectorId: 'nyx', type: 'base', name: 'Officer Corps', status: 'OPERATIONAL', personnel: 0, location: 'DELAMAR', x: 25, y: 50 },
    { id: '5th-fleet', sectorId: 'nyx', type: 'fleet', name: 'Fleet Vettlir', shortName: 'Fleet Vettlir', status: 'OPERATIONAL', personnel: 0, vessels: 6, commander: 'ADM. RHEA', location: 'LEVSKI', homeBaseId: 'vega-bastion', x: 76, y: 48 },
    { id: 'vega-relay', sectorId: 'nyx', type: 'station', name: 'Recruiter', status: 'OPERATIONAL', personnel: 0, location: "PEOPLE'S SERVICE STATION ALPHA", x: 50, y: 18 },

    { id: 'nyx-watch', sectorId: 'stanton', type: 'installation', name: 'Marketing', status: 'OPERATIONAL', personnel: 0, location: 'NEW BABBAGE — MICROTECH', x: 25, y: 45 },
    { id: '9th-fleet', sectorId: 'stanton', type: 'fleet', name: 'Fleet Crips', shortName: 'Fleet Crips', status: 'OPERATIONAL', personnel: 0, vessels: 5, commander: 'CDR. KEST', location: 'TERRA GATEWAY — STANTON', x: 75, y: 50 },
    { id: 'arcadia-base', sectorId: 'stanton', type: 'base', name: 'Logistics', status: 'OPERATIONAL', personnel: 0, location: 'ORISON — CRUSADER', x: 25, y: 50 },
    { id: '2nd-fleet', sectorId: 'stanton', type: 'fleet', name: 'Imperial Naval Corps', shortName: 'Imperial Naval Corps', status: 'OPERATIONAL', personnel: 0, vessels: 7, commander: 'ADM. ORIS', location: 'MAGNUS GATEWAY — STANTON', homeBaseId: 'arcadia-base', x: 75, y: 50 },
    { id: 'arcadia-station', sectorId: 'stanton', type: 'station', name: 'Banker', status: 'OPERATIONAL', personnel: 0, location: 'BAIJINI POINT — ARCCORP', x: 50, y: 18 },

    { id: 'helios-base', sectorId: 'pyro', type: 'base', name: 'Ambassador', status: 'OPERATIONAL', personnel: 0, location: 'NYX GATEWAY — PYRO', x: 25, y: 50 },
    { id: '3rd-fleet', sectorId: 'pyro', type: 'fleet', name: 'Imperial ODST', shortName: 'Imperial ODST', status: 'OPERATIONAL', personnel: 0, vessels: 6, commander: 'ADM. MERIDIAN', location: 'ORBITUARY', homeBaseId: 'helios-base', x: 75, y: 50 },
    { id: 'helios-array', sectorId: 'pyro', type: 'installation', name: 'Foreign Affairs Agent', status: 'OPERATIONAL', personnel: 0, location: 'PATCH CITY', x: 50, y: 20 },

    { id: 'orpheus-post', sectorId: 'nyx', type: 'base', name: 'HC-3 | Lord Sovereign', status: 'OPERATIONAL', personnel: 0, location: "PEOPLE'S SERVICE STATION DELTA", x: 25, y: 50 },
    { id: '11th-fleet', sectorId: 'nyx', type: 'fleet', name: 'Imperial Marine Corps', shortName: 'Imperial Marine Corps', status: 'OPERATIONAL', personnel: 0, vessels: 4, commander: 'CDR. SERA', location: "PEOPLE'S SERVICE STATION LAMBDA", homeBaseId: 'orpheus-post', x: 75, y: 50 },
    { id: 'orpheus-relay', sectorId: 'nyx', type: 'station', name: 'HC-2S | High Lords', status: 'OPERATIONAL', personnel: 0, location: "PEOPLE'S SERVICE STATION THETA", x: 50, y: 18 },

    { id: 'frontier-base', sectorId: 'pyro', type: 'base', name: 'HC-2', status: 'ALERT', personnel: 0, location: "RAT'S NEST", x: 25, y: 50 },
    { id: '12th-fleet', sectorId: 'pyro', type: 'fleet', name: 'Imperial Logistics Corps', shortName: 'Imperial Logistics Corps', status: 'ALERT', personnel: 0, vessels: 5, commander: 'CDR. HOLT', location: 'STARLIGHT SERVICE STATION', homeBaseId: 'frontier-base', x: 75, y: 50 },
    { id: 'frontier-station', sectorId: 'pyro', type: 'station', name: 'HC-1', status: 'OPERATIONAL', personnel: 0, location: 'DUDLEY & DAUGHTERS', x: 50, y: 18 }
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