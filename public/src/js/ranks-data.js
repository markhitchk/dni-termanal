const rank = (paygrade, code, name, description = '') => ({ paygrade, code, name, description });
const group = (name, ranks) => ({ name, ranks });

export const DNI_PAYGRADE_ORDER = Object.freeze([
  'HC-3', 'HC-2S', 'HC-2', 'HC-1',
  'O-9', 'O-8', 'O-7', 'O-6', 'O-5', 'O-4', 'O-3', 'O-2', 'O-1',
  'W-3', 'W-2', 'W-1',
  'E-9S', 'E-9', 'E-8', 'E-7', 'E-6', 'E-5', 'E-4', 'E-3', 'E-2', 'E-1', 'E-0'
]);

export const DNI_RANK_BRANCHES = Object.freeze([
  {
    id: 'army',
    name: 'Army',
    shortName: 'ARMY',
    groups: [
      group('Command', [
        rank('HC-3', 'LSOV', 'Lord Sovereign', 'The Sovereign of the Imperium'),
        rank('HC-2S', 'LG', 'Lord General of the Army', 'Supreme commander of the entire Army'),
        rank('HC-2', 'HGEN', 'High General'),
        rank('HC-1', 'GGEN', 'Grand General', 'Aids in leading the entire Army')
      ]),
      group('Flag Officers', [
        rank('O-9', 'GEN', 'General', 'Leads a Field Army'),
        rank('O-8', 'LTGEN', 'Lieutenant General', 'Leads a Corps (2+ Divisions)'),
        rank('O-7', 'MGEN', 'Major General', 'Leads a Division (3 Brigades)')
      ]),
      group('Senior Officers', [
        rank('O-6', 'COL', 'Colonel', 'Leads a Brigade (3-5 Battalions)'),
        rank('O-5', 'LTCOL', 'Lieutenant Colonel', 'Leads a Battalion (3-5 Companies)'),
        rank('O-4', 'MAJ', 'Major')
      ]),
      group('Junior Officers', [
        rank('O-3', 'CPT', 'Captain', 'Leads a Company (3-4 Platoons)'),
        rank('O-2', '1LT', 'First Lieutenant'),
        rank('O-1', '2LT', 'Second Lieutenant', 'Leads a Platoon (3-4 Squads)')
      ]),
      group('Warrant Officers', [
        rank('W-3', 'CWO3', 'Chief Warrant Officer 3'),
        rank('W-2', 'CWO2', 'Chief Warrant Officer 2'),
        rank('W-1', 'WO', 'Warrant Officer')
      ]),
      group('Enlisted', [
        rank('E-9S', 'SMA', 'Sergeant Major of the Army', 'Aids the Lord General of the Army'),
        rank('E-9', 'SGTMAJ', 'Sergeant Major', 'Aids either an O-5, O-6, O-7, or O-8'),
        rank('E-8', 'MSGT', 'Master Sergeant', 'Aids an O-3'),
        rank('E-7', 'GYSGT', 'Gunnery Sergeant', 'Aids an O-1'),
        rank('E-6', 'SSGT', 'Staff Sergeant'),
        rank('E-5', 'SGT', 'Sergeant', 'Leads a Squad (6-10 Soldiers)'),
        rank('E-4', 'CPL', 'Corporal'),
        rank('E-3', 'LCPL', 'Lance Corporal'),
        rank('E-2', 'PFC', 'Private First Class'),
        rank('E-1', 'PVT', 'Private'),
        rank('E-0', 'REC', 'Recruit')
      ])
    ]
  },
  {
    id: 'government',
    name: 'Government',
    shortName: 'GOV',
    groups: [
      group('High Command', [
        rank('HC-3', 'LSOV', 'Lord Sovereign', 'The Sovereign of the Imperium'),
        rank('HC-2S', 'LMR', 'Lord Minister', 'Supreme head of the Imperial Government'),
        rank('HC-2', 'PM', 'Prime Minister', 'Oversees the administration of the Government'),
        rank('HC-1', 'MIN', 'Minister', 'Leads a Ministry of the Imperium')
      ]),
      group('Senior Government Officials', [
        rank('O-9', 'DMIN', 'Deputy Minister', 'Second-in-command of a Ministry'),
        rank('O-8', 'GGOV', 'Governor General', 'Oversees multiple Imperial territories or jurisdictions'),
        rank('O-7', 'GOV', 'Governor', 'Governs an Imperial territory'),
        rank('O-6', 'LGOV', 'Lieutenant Governor', 'Assists the Governor in administering a territory')
      ]),
      group('Government Officials', [
        rank('O-5', 'COM', 'Commissioner', 'Oversees a commission or major government department'),
        rank('O-4', 'PREF', 'Prefect', 'Administers a designated district or jurisdiction'),
        rank('O-3', 'MAG', 'Magistrate', 'Oversees local administrative and judicial matters'),
        rank('O-2', 'CON', 'Consul', 'Represents Imperial interests and government authority'),
        rank('O-1', 'DEL', 'Delegate', 'Serves as an appointed government representative')
      ]),
      group('Policy Officers', [
        rank('W-3', 'SPD', 'Senior Policy Director', 'Oversees major policy development and implementation'),
        rank('W-2', 'PDIR', 'Policy Director', 'Directs the development of government policy'),
        rank('W-1', 'POFF', 'Policy Officer', 'Assists in developing and administering government policy')
      ]),
      group('Civil Service', [
        rank('E-9S', 'GSEC', 'Grand Secretary', 'Senior-most official of the Imperial Civil Service'),
        rank('E-9', 'CSEC', 'Chief Secretary', 'Oversees senior administrative operations'),
        rank('E-8', 'SSEC', 'Senior Secretary', 'Manages major administrative responsibilities'),
        rank('E-7', 'PSEC', 'Principal Secretary', 'Supervises government secretarial and clerical operations'),
        rank('E-6', 'CCLK', 'Chief Clerk', 'Leads a government clerical office'),
        rank('E-5', 'SCLK', 'Senior Clerk', 'Senior administrative and records official'),
        rank('E-4', 'CLK', 'Clerk', 'Performs standard government administrative duties'),
        rank('E-3', 'JCLK', 'Junior Clerk', 'Performs junior administrative and clerical duties'),
        rank('E-2', 'ACLK', 'Apprentice Clerk', 'Civil servant undergoing administrative training'),
        rank('E-1', 'CREC', 'Civil Recruit', 'Entry-level member of the Imperial Civil Service'),
        rank('E-0', 'REC', 'Recruit', 'Newly inducted government recruit')
      ])
    ]
  },
  {
    id: 'navy',
    name: 'Navy',
    shortName: 'NAVY',
    groups: [
      group('Command', [
        rank('HC-3', 'LSOV', 'Lord Sovereign', 'The Sovereign of the Imperium'),
        rank('HC-2S', 'LADM', 'Lord Admiral of the Navy', 'Supreme commander of the entire Navy'),
        rank('HC-2', 'FADM', 'Fleet Admiral', 'Oversees operations within an entire system'),
        rank('HC-1', 'HADM', 'High Admiral', 'Commands an entire fleet')
      ]),
      group('Flag Officers', [
        rank('O-9', 'ADM', 'Admiral', 'Commands a battle group or large task force within a fleet'),
        rank('O-8', 'VADM', 'Vice Admiral', 'Deputy to an Admiral, often responsible for specialized commands'),
        rank('O-7', 'RADM', 'Rear Admiral', 'Commands a task force')
      ]),
      group('Senior Officers', [
        rank('O-6', 'CAPT', 'Captain', 'Commands a capital ship'),
        rank('O-5', 'CDR', 'Commander', 'Commands a sub-capital ship'),
        rank('O-4', 'LCDR', 'Lieutenant Commander', 'Commands multicrew ships below sub-capital; may also serve as a department head aboard capital ships')
      ]),
      group('Junior Officers', [
        rank('O-3', 'LT', 'Lieutenant', 'May serve as XO aboard sub-capital ships'),
        rank('O-2', 'SLT', 'Lieutenant Junior Grade', 'Junior officer'),
        rank('O-1', 'ENS', 'Ensign', 'Entry-level officer rank')
      ]),
      group('Warrant Officers', [
        rank('W-3', 'CWO3', 'Chief Warrant Officer 3'),
        rank('W-2', 'CWO2', 'Chief Warrant Officer 2'),
        rank('W-1', 'WO', 'Warrant Officer')
      ]),
      group('Enlisted', [
        rank('E-9S', 'FMCPO', 'Command Master Chief Petty Officer', 'Senior Enlisted Advisor to the Lord Admiral and High Command'),
        rank('E-9', 'MCPO', 'Master Chief Petty Officer', 'Senior enlisted leader at the fleet or battle group level'),
        rank('E-8', 'SCPO', 'Senior Chief Petty Officer', 'Senior non-commissioned officer aboard ships'),
        rank('E-7', 'CPO', 'Chief Petty Officer', 'Squad Leader of a Large Squadron (8-9)'),
        rank('E-6', 'PO1', 'Petty Officer First Class', 'Squad Leader of a Medium Squadron (6-7)'),
        rank('E-5', 'PO2', 'Petty Officer Second Class', 'Squad Leader of a Small Squadron (4-5)'),
        rank('E-4', 'PO3', 'Petty Officer Third Class'),
        rank('E-3', 'SCR', 'Senior Crewman'),
        rank('E-2', 'CR', 'Crewman'),
        rank('E-1', 'CA', 'Crewman Apprentice'),
        rank('E-0', 'REC', 'Recruit')
      ])
    ]
  },
  {
    id: 'medical',
    name: 'Medical',
    shortName: 'MED',
    groups: [
      group('Command', [
        rank('HC-3', 'LSOV', 'Lord Sovereign', 'The Sovereign of the Imperium'),
        rank('HC-2S', 'LMD', 'Lord Medicaid', 'Supreme authority of the Imperial Medical Service'),
        rank('HC-2', 'LSG', 'Lord Surgeon General', 'Oversees the entire Imperial Medical Service'),
        rank('HC-1', 'SGIN', 'Surgeon General', 'Directs medical operations throughout the Imperium')
      ]),
      group('Senior Medical Command', [
        rank('O-9', 'VSGEN', 'Vice Surgeon General', 'Deputy to the Surgeon General'),
        rank('O-8', 'CMD', 'Chief Medical Director', 'Oversees major medical operations and facilities'),
        rank('O-7', 'SMD', 'Senior Medical Director', 'Directs large-scale medical operations')
      ]),
      group('Medical Officers', [
        rank('O-6', 'MDIR', 'Medical Director', 'Directs a medical facility or major medical unit'),
        rank('O-5', 'AMD', 'Assistant Medical Director', 'Assists in directing medical operations'),
        rank('O-4', 'CSUR', 'Chief Surgeon', 'Leads surgical personnel and operations'),
        rank('O-3', 'SSUR', 'Senior Surgeon', 'Senior surgical and medical officer'),
        rank('O-2', 'SUR', 'Surgeon', 'Performs and oversees surgical operations'),
        rank('O-1', 'MO', 'Medical Officer', 'Entry-level commissioned medical officer')
      ]),
      group('Medical Specialists', [
        rank('W-3', 'CMS', 'Chief Medical Specialist'),
        rank('W-2', 'SMS', 'Senior Medical Specialist'),
        rank('W-1', 'MS', 'Medical Specialist')
      ]),
      group('Enlisted Medical Personnel', [
        rank('E-9S', 'SMCM', 'Senior Master Chief Medic', 'Senior Enlisted Advisor of the Imperial Medical Service'),
        rank('E-9', 'MCM', 'Master Chief Medic', 'Senior enlisted medical leader'),
        rank('E-8', 'SCM', 'Senior Chief Medic', 'Senior medical NCO'),
        rank('E-7', 'CM', 'Chief Medic', 'Leads and supervises medical teams'),
        rank('E-6', 'SM', 'Senior Medic', 'Senior field and clinical medic'),
        rank('E-5', 'M1C', 'Medic First Class'),
        rank('E-4', 'M2C', 'Medic Second Class'),
        rank('E-3', 'M3C', 'Medic Third Class'),
        rank('E-2', 'JM', 'Junior Medic'),
        rank('E-1', 'MA', 'Medic Apprentice'),
        rank('E-0', 'REC', 'Recruit')
      ])
    ]
  },
  {
    id: 'intelligence',
    name: 'Intelligence',
    shortName: 'INTEL',
    groups: [
      group('Command', [
        rank('HC-3', 'LSOV', 'Lord Sovereign', 'The Sovereign of the Imperium'),
        rank('HC-2S', 'DG', 'Director General', 'Supreme authority of the Imperial Intelligence Service'),
        rank('HC-2', 'SD', 'Section Director', 'Oversees a major section of the Intelligence Service'),
        rank('HC-1', 'DC', 'Department Chief', 'Commands a specialized intelligence department')
      ]),
      group('Senior Intelligence Officers', [
        rank('O-9', 'INQ', 'Inquisitor', 'Senior investigative authority entrusted with high-priority and sensitive investigations'),
        rank('O-8', 'CCO', 'Chief Case Officer', 'Oversees major intelligence cases and case officers'),
        rank('O-7', 'SCO', 'Senior Case Officer', 'Directs complex intelligence cases and operations'),
        rank('O-6', 'CO', 'Case Officer', 'Manages intelligence cases and field operations')
      ]),
      group('Investigative Officers', [
        rank('O-5', 'SCI', 'Special Class Investigator', 'Conducts highly sensitive or specialized investigations'),
        rank('O-4', 'ASCI', 'Associate Special Class Investigator', 'Assists with specialized and high-priority investigations'),
        rank('O-3', 'SI', 'Senior Investigator', 'Leads major investigations and investigative teams'),
        rank('O-2', 'INV', 'Investigator', 'Conducts formal investigations and intelligence gathering'),
        rank('O-1', 'JI', 'Junior Investigator', 'Entry-level investigative officer')
      ]),
      group('Team Leaders', [
        rank('W-3', 'STL', 'Senior Team Leader', 'Oversees multiple operational teams or major field assignments'),
        rank('W-2', 'TL', 'Team Leader', 'Leads an intelligence or investigative team'),
        rank('W-1', 'ATL', 'Assistant Team Leader', 'Assists in the leadership of an operational team')
      ]),
      group('Agents', [
        rank('E-9S', 'LAG', 'Leading Agent', 'Senior Enlisted Advisor of the Imperial Intelligence Service'),
        rank('E-9', 'SCA', 'Senior Chief Agent', 'Senior operational leader within the Agent Corps'),
        rank('E-8', 'CA', 'Chief Agent', 'Supervises senior agents and field operations'),
        rank('E-7', 'ACA', 'Associate Chief Agent', 'Assists in supervising agents and operations'),
        rank('E-6', 'SSA', 'Supervisory Special Agent', 'Supervises special agents and investigative teams'),
        rank('E-5', 'SSA-II', 'Senior Special Agent', 'Veteran special agent assigned to advanced operations'),
        rank('E-4', 'SA', 'Special Agent', 'Conducts specialized intelligence and investigative operations'),
        rank('E-3', 'SEA', 'Senior Agent', 'Experienced field and intelligence agent'),
        rank('E-2', 'AGT', 'Agent', 'Standard field operative of the Intelligence Service'),
        rank('E-1', 'CAG', 'Candidate Agent', 'Agent undergoing initial training and evaluation'),
        rank('E-0', 'REC', 'Recruit', 'Newly inducted recruit')
      ])
    ]
  },
  {
    id: 'engineering-logistics',
    name: 'Engineering & Logistics',
    shortName: 'ENG/LOG',
    groups: [
      group('Command', [
        rank('HC-3', 'LSOV', 'Lord Sovereign', 'The Sovereign of the Imperium'),
        rank('HC-2S', 'DLG', 'Director of Logistics / Director of Engineering', 'Supreme authority of their respective branch'),
        rank('HC-2', 'DDLG', 'Deputy Director of Logistics / Deputy Director of Engineering', 'Deputy authority of their respective branch'),
        rank('HC-1', 'SCF', 'Sector Chief', 'Oversees Engineering and Logistics operations within an assigned sector')
      ]),
      group('Inspectorate', [
        rank('O-9', 'HIG', 'High Inspector General', 'Oversees inspections, standards, and operational compliance across the branch'),
        rank('O-8', 'SIG', 'Senior Inspector General', 'Conducts and supervises major inspections and evaluations'),
        rank('O-7', 'IG', 'Inspector General', 'Inspects facilities, personnel, projects, and logistical operations')
      ]),
      group('Senior Officers', [
        rank('O-6', 'LO', 'Engineer / Logistics Officer', 'Oversees engineering projects or logistical operations'),
        rank('O-5', 'SSUP', 'Senior Supervisor', 'Supervises major projects, facilities, or operational teams'),
        rank('O-4', 'SUP', 'Supervisor', 'Supervises engineering, logistical, or industrial operations')
      ]),
      group('Junior Officers', [
        rank('O-3', 'JSUP', 'Junior Supervisor', 'Assists in supervising personnel and operations'),
        rank('O-2', 'FMN', 'Foreman', 'Leads a work crew and oversees assigned projects'),
        rank('O-1', 'AFMN', 'Assistant Foreman', 'Assists a Foreman in managing a work crew')
      ]),
      group('Technical Specialists', [
        rank('W-3', 'CTS', 'Chief Technical Specialist', 'Senior technical authority within the branch'),
        rank('W-2', 'STS', 'Senior Technical Specialist', 'Provides advanced technical expertise and guidance'),
        rank('W-1', 'TS', 'Technical Specialist', 'Provides specialized technical expertise')
      ]),
      group('Workmen', [
        rank('E-9S', 'SMCW', 'Senior Master Chief Workman', 'Senior Enlisted Advisor of Engineering and Logistics'),
        rank('E-9', 'MCW', 'Master Chief Workman', 'Senior enlisted leader responsible for major work operations'),
        rank('E-8', 'SCW', 'Senior Chief Workman', 'Senior supervisor of work crews and technical personnel'),
        rank('E-7', 'CW', 'Chief Workman', 'Leads and supervises work crews'),
        rank('E-6', 'LW', 'Leading Workman', 'Experienced workman responsible for junior personnel'),
        rank('E-5', 'SW', 'Senior Workman', 'Senior and experienced member of a work crew'),
        rank('E-4', 'W1C', 'Workman First Class'),
        rank('E-3', 'W2C', 'Workman Second Class'),
        rank('E-2', 'W3C', 'Workman Third Class'),
        rank('E-1', 'WA', 'Workman Apprentice'),
        rank('E-0', 'REC', 'Recruit')
      ])
    ]
  }
]);

export function flattenDniRanks() {
  return DNI_RANK_BRANCHES.flatMap(branch => branch.groups.flatMap(section => section.ranks.map(item => ({
    ...item,
    branchId: branch.id,
    branch: branch.name,
    branchShortName: branch.shortName,
    group: section.name
  }))));
}

export function paygradeClass(paygrade) {
  const value = String(paygrade || '').toUpperCase();
  if (value.startsWith('HC-')) return 'HC';
  if (value.startsWith('O-')) return 'O';
  if (value.startsWith('W-')) return 'W';
  if (value.startsWith('E-')) return 'E';
  return '';
}

export function ranksForPaygrade(paygrade) {
  const target = String(paygrade || '').toUpperCase();
  return flattenDniRanks().filter(item => item.paygrade === target);
}