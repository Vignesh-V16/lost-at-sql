/**
 * TEMPORAL CORE — experimental second dataset (10 tables, ~390 rows).
 *
 * Kept as a demonstration that the engine is dataset-agnostic: a future
 * event can pair it with its own case files. It is NOT the Black Cipher
 * dataset and is not loaded by default — see content/index.js.
 *
 * Everything here is deterministic: filler rows are produced from a seeded
 * PRNG so that case-file answers never drift between resets.
 *
 * Timeline: 17 September 2045. Temporal Core critical failure at 09:58:03.
 */

const INCIDENT_DATE = '2045-09-17';

/* ---------------------------------------------------------------- helpers */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let rand = mulberry32(20450917);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
const pad = (n, w = 2) => String(n).padStart(w, '0');
const ts = (date, h, m, s = 0) => `${date} ${pad(h)}:${pad(m)}:${pad(s)}`;
const id = (prefix, n, w = 4) => `${prefix}-${pad(n, w)}`;

/* -------------------------------------------------------------- locations */

const locations = [
  { location_id: 'MAIN_LOBBY', name: 'Main Lobby', zone: 'GROUND', floor: 0, security_level: 1, camera_id: 'CAM-G-01', description: 'Public reception and visitor screening.' },
  { location_id: 'LOADING_DOCK', name: 'Loading Dock', zone: 'GROUND', floor: 0, security_level: 2, camera_id: 'CAM-G-02', description: 'Deliveries and logistics intake.' },
  { location_id: 'SECURITY_HUB', name: 'Security Hub', zone: 'GROUND', floor: 0, security_level: 3, camera_id: 'CAM-G-03', description: 'Central monitoring room for CCTV and access control.' },
  { location_id: 'CAFETERIA', name: 'Cafeteria', zone: 'LEVEL_1', floor: 1, security_level: 1, camera_id: 'CAM-L1-01', description: 'Staff dining area.' },
  { location_id: 'MED_BAY', name: 'Medical Bay', zone: 'LEVEL_1', floor: 1, security_level: 2, camera_id: 'CAM-L1-02', description: 'On-site clinic and bio-interface screening.' },
  { location_id: 'RESEARCH_WING_A', name: 'Research Wing A', zone: 'LEVEL_2', floor: 2, security_level: 3, camera_id: 'CAM-L2-01', description: 'Temporal systems research offices.' },
  { location_id: 'RESEARCH_WING_B', name: 'Research Wing B', zone: 'LEVEL_2', floor: 2, security_level: 3, camera_id: 'CAM-L2-02', description: 'Bio-interface and ethics research offices.' },
  { location_id: 'QUANTUM_LAB', name: 'Quantum Substrate Lab', zone: 'LEVEL_3', floor: 3, security_level: 4, camera_id: 'CAM-L3-01', description: 'Fabrication and calibration of quantum substrates.' },
  { location_id: 'EXEC_SUITE', name: 'Executive Suite', zone: 'LEVEL_5', floor: 5, security_level: 3, camera_id: 'CAM-L5-01', description: 'Director and executive offices.' },
  { location_id: 'SERVER_FARM', name: 'Server Farm', zone: 'SUBLEVEL_1', floor: -1, security_level: 4, camera_id: 'CAM-S1-01', description: 'Primary compute cluster.' },
  { location_id: 'NETWORK_OPS', name: 'Network Operations', zone: 'SUBLEVEL_1', floor: -1, security_level: 4, camera_id: 'CAM-S1-02', description: 'Chronos network control and maintenance consoles.' },
  { location_id: 'ARCHIVE_VAULT_B2', name: 'Archive Vault B2', zone: 'SUBLEVEL_2', floor: -2, security_level: 4, camera_id: 'CAM-S2-03', description: 'Cold storage for decommissioned hardware and sealed archives.' },
  { location_id: 'CORE_ANTEROOM', name: 'Core Anteroom', zone: 'SUBLEVEL_3', floor: -3, security_level: 4, camera_id: 'CAM-S3-06', description: 'Airlock and decontamination chamber before the Temporal Core.' },
  { location_id: 'TEMPORAL_CORE', name: 'Temporal Core', zone: 'SUBLEVEL_3', floor: -3, security_level: 5, camera_id: 'CAM-S3-07', description: 'Housing of the BLACK CIPHER quantum substrate and the Temporal Core reactor.' },
];

/* --------------------------------------------------------------- projects */

const projects = [
  { project_code: 'PRJ-BC-07', name: 'Black Cipher', lead_id: 'E-1042', classification: 'BLACK', budget: 48000000, status: 'COMPROMISED', started_on: '2041-03-01', description: 'Self-improving general intelligence hosted on quantum substrate Q-7.' },
  { project_code: 'PRJ-TS-04', name: 'Temporal Core Stabilization', lead_id: 'E-1001', classification: 'TOP SECRET', budget: 21500000, status: 'ACTIVE', started_on: '2043-06-12', description: 'Containment of temporal drift produced by the core reactor.' },
  { project_code: 'PRJ-QS-11', name: 'Quantum Substrate Fabrication', lead_id: 'E-1156', classification: 'SECRET', budget: 9800000, status: 'ACTIVE', started_on: '2042-01-20', description: 'Manufacture and calibration of Q-series substrates.' },
  { project_code: 'PRJ-SEC-01', name: 'Perimeter Security', lead_id: 'E-1107', classification: 'CONFIDENTIAL', budget: 3200000, status: 'ACTIVE', started_on: '2040-09-01', description: 'Physical and digital access control for the institute.' },
  { project_code: 'PRJ-NET-02', name: 'Chronos Network', lead_id: 'E-1288', classification: 'CONFIDENTIAL', budget: 4100000, status: 'ACTIVE', started_on: '2041-11-15', description: 'Internal secure network and relay infrastructure.' },
  { project_code: 'PRJ-FAC-03', name: 'Facility Operations', lead_id: 'E-1203', classification: 'INTERNAL', budget: 1750000, status: 'ACTIVE', started_on: '2039-04-03', description: 'HVAC, power and building systems maintenance.' },
  { project_code: 'PRJ-BIO-05', name: 'Neural Bridge', lead_id: 'E-1455', classification: 'SECRET', budget: 6400000, status: 'ON HOLD', started_on: '2044-02-28', description: 'Human-machine bio-interface research.' },
  { project_code: 'PRJ-AUD-09', name: 'External Audit 2045', lead_id: 'C-2041', classification: 'INTERNAL', budget: 250000, status: 'ACTIVE', started_on: '2045-08-01', description: 'Independent financial and compliance audit.' },
  { project_code: 'PRJ-FIN-00', name: 'Finance Operations', lead_id: 'E-1310', classification: 'INTERNAL', budget: 900000, status: 'ACTIVE', started_on: '2038-01-01', description: 'Treasury, payroll and procurement.' },
];

/* -------------------------------------------------------------- employees */

const employees = [
  // --- persons of interest ---
  { employee_id: 'E-1001', full_name: 'Dr. Aarav Menon', role: 'Director of Temporal Systems', department: 'Temporal Systems', access_level: 5, project_code: 'PRJ-BC-07', badge_id: 'B-7001', manager_id: null, hired_on: '2036-05-14', status: 'ACTIVE' },
  { employee_id: 'E-1042', full_name: 'Dr. Elena Voss', role: 'Lead Architect, Black Cipher', department: 'Black Cipher Program', access_level: 5, project_code: 'PRJ-BC-07', badge_id: 'B-7042', manager_id: 'E-1001', hired_on: '2038-09-03', status: 'ACTIVE' },
  { employee_id: 'E-1107', full_name: 'Kabir Rathod', role: 'Head of Security', department: 'Security', access_level: 4, project_code: 'PRJ-SEC-01', badge_id: 'B-7107', manager_id: 'E-1001', hired_on: '2039-02-11', status: 'ACTIVE' },
  { employee_id: 'E-1156', full_name: 'Dr. Yuki Tanaka', role: 'Quantum Substrate Engineer', department: 'Quantum Substrate', access_level: 4, project_code: 'PRJ-BC-07', badge_id: 'B-7156', manager_id: 'E-1042', hired_on: '2041-07-19', status: 'ACTIVE' },
  { employee_id: 'E-1203', full_name: 'Marcus Hale', role: 'Facilities Engineer', department: 'Facilities', access_level: 3, project_code: 'PRJ-FAC-03', badge_id: 'B-7203', manager_id: 'E-1107', hired_on: '2040-10-05', status: 'ACTIVE' },
  { employee_id: 'E-1220', full_name: 'Priya Nair', role: 'Data Ethics Officer', department: 'Ethics & Compliance', access_level: 3, project_code: 'PRJ-BC-07', badge_id: 'B-7220', manager_id: 'E-1001', hired_on: '2042-03-22', status: 'ACTIVE' },
  { employee_id: 'E-1288', full_name: 'Leon Adebayo', role: 'Network Operations Lead', department: 'Network Operations', access_level: 4, project_code: 'PRJ-NET-02', badge_id: 'B-7288', manager_id: 'E-1107', hired_on: '2041-01-08', status: 'ACTIVE' },
  { employee_id: 'E-1310', full_name: 'Sofia Lindqvist', role: 'Chief Financial Officer', department: 'Finance', access_level: 3, project_code: 'PRJ-FIN-00', badge_id: 'B-7310', manager_id: 'E-1001', hired_on: '2037-11-30', status: 'ACTIVE' },
  { employee_id: 'E-1377', full_name: 'Daniel Okafor', role: 'Research Intern', department: 'Research', access_level: 2, project_code: 'PRJ-TS-04', badge_id: 'B-7377', manager_id: 'E-1042', hired_on: '2045-06-02', status: 'ACTIVE' },
  { employee_id: 'C-2041', full_name: 'Ingrid Sato', role: 'External Auditor', department: 'Audit', access_level: 2, project_code: 'PRJ-AUD-09', badge_id: 'B-9041', manager_id: 'E-1310', hired_on: '2045-08-01', status: 'CONTRACTOR' },
  { employee_id: 'E-1401', full_name: 'Ravi Deshmukh', role: 'Building Systems Technician', department: 'Building Systems', access_level: 3, project_code: 'PRJ-FAC-03', badge_id: 'B-7401', manager_id: 'E-1203', hired_on: '2043-08-14', status: 'ACTIVE' },
  { employee_id: 'E-1455', full_name: 'Dr. Hana Kowalski', role: 'Bio-Interface Lead', department: 'Bio-Interface', access_level: 3, project_code: 'PRJ-BIO-05', badge_id: 'B-7455', manager_id: 'E-1001', hired_on: '2040-04-17', status: 'ACTIVE' },
  // --- other staff ---
  { employee_id: 'E-1012', full_name: 'Nadia Farouk', role: 'Executive Assistant', department: 'Administration', access_level: 2, project_code: null, badge_id: 'B-7012', manager_id: 'E-1001', hired_on: '2037-02-09', status: 'ACTIVE' },
  { employee_id: 'E-1063', full_name: 'Tomás Herrera', role: 'Temporal Physicist', department: 'Temporal Systems', access_level: 4, project_code: 'PRJ-TS-04', badge_id: 'B-7063', manager_id: 'E-1001', hired_on: '2039-06-24', status: 'ACTIVE' },
  { employee_id: 'E-1088', full_name: 'Grace Whitfield', role: 'Systems Analyst', department: 'Temporal Systems', access_level: 3, project_code: 'PRJ-TS-04', badge_id: 'B-7088', manager_id: 'E-1063', hired_on: '2040-01-13', status: 'ACTIVE' },
  { employee_id: 'E-1119', full_name: 'Samuel Ortega', role: 'Security Officer', department: 'Security', access_level: 3, project_code: 'PRJ-SEC-01', badge_id: 'B-7119', manager_id: 'E-1107', hired_on: '2041-05-30', status: 'ACTIVE' },
  { employee_id: 'E-1134', full_name: 'Amara Osei', role: 'Security Officer', department: 'Security', access_level: 3, project_code: 'PRJ-SEC-01', badge_id: 'B-7134', manager_id: 'E-1107', hired_on: '2042-09-19', status: 'ACTIVE' },
  { employee_id: 'E-1171', full_name: 'Wei Zhang', role: 'Substrate Technician', department: 'Quantum Substrate', access_level: 3, project_code: 'PRJ-QS-11', badge_id: 'B-7171', manager_id: 'E-1156', hired_on: '2042-11-02', status: 'ACTIVE' },
  { employee_id: 'E-1195', full_name: 'Olivia Brennan', role: 'Substrate Technician', department: 'Quantum Substrate', access_level: 3, project_code: 'PRJ-QS-11', badge_id: 'B-7195', manager_id: 'E-1156', hired_on: '2043-03-27', status: 'ACTIVE' },
  { employee_id: 'E-1241', full_name: 'Jonas Eriksen', role: 'Compliance Analyst', department: 'Ethics & Compliance', access_level: 2, project_code: null, badge_id: 'B-7241', manager_id: 'E-1220', hired_on: '2043-10-16', status: 'ACTIVE' },
  { employee_id: 'E-1266', full_name: 'Fatima Al-Sayed', role: 'Network Engineer', department: 'Network Operations', access_level: 3, project_code: 'PRJ-NET-02', badge_id: 'B-7266', manager_id: 'E-1288', hired_on: '2042-06-08', status: 'ACTIVE' },
  { employee_id: 'E-1299', full_name: 'Victor Nowak', role: 'Network Engineer', department: 'Network Operations', access_level: 3, project_code: 'PRJ-NET-02', badge_id: 'B-7299', manager_id: 'E-1288', hired_on: '2044-01-22', status: 'ACTIVE' },
  { employee_id: 'E-1322', full_name: 'Chloe Dubois', role: 'Accountant', department: 'Finance', access_level: 2, project_code: 'PRJ-FIN-00', badge_id: 'B-7322', manager_id: 'E-1310', hired_on: '2041-08-30', status: 'ACTIVE' },
  { employee_id: 'E-1348', full_name: 'Arjun Pillai', role: 'Procurement Officer', department: 'Finance', access_level: 2, project_code: 'PRJ-FIN-00', badge_id: 'B-7348', manager_id: 'E-1310', hired_on: '2042-12-05', status: 'ACTIVE' },
  { employee_id: 'E-1360', full_name: 'Mei Lin', role: 'Research Scientist', department: 'Research', access_level: 3, project_code: 'PRJ-TS-04', badge_id: 'B-7360', manager_id: 'E-1063', hired_on: '2043-05-11', status: 'ACTIVE' },
  { employee_id: 'E-1389', full_name: 'Isaac Mensah', role: 'Research Intern', department: 'Research', access_level: 2, project_code: 'PRJ-TS-04', badge_id: 'B-7389', manager_id: 'E-1063', hired_on: '2045-06-02', status: 'ACTIVE' },
  { employee_id: 'E-1412', full_name: 'Elif Demir', role: 'HVAC Technician', department: 'Building Systems', access_level: 2, project_code: 'PRJ-FAC-03', badge_id: 'B-7412', manager_id: 'E-1203', hired_on: '2044-04-19', status: 'ACTIVE' },
  { employee_id: 'E-1433', full_name: 'Bruno Costa', role: 'Logistics Coordinator', department: 'Logistics', access_level: 2, project_code: null, badge_id: 'B-7433', manager_id: 'E-1203', hired_on: '2041-03-15', status: 'ACTIVE' },
  { employee_id: 'E-1470', full_name: 'Dr. Lena Fischer', role: 'Bio-Interface Researcher', department: 'Bio-Interface', access_level: 3, project_code: 'PRJ-BIO-05', badge_id: 'B-7470', manager_id: 'E-1455', hired_on: '2044-07-07', status: 'ACTIVE' },
  { employee_id: 'E-1488', full_name: 'Hugo Martins', role: 'Legal Counsel', department: 'Legal', access_level: 2, project_code: null, badge_id: 'B-7488', manager_id: 'E-1001', hired_on: '2040-12-01', status: 'ACTIVE' },
];

const employeeById = Object.fromEntries(employees.map((e) => [e.employee_id, e]));

/* --------------------------------------------------------------- suspects */

const suspects = [
  { suspect_id: 'SUS-01', employee_id: 'E-1001', name: 'Dr. Aarav Menon', role: 'Director of Temporal Systems', department: 'Temporal Systems', access_level: 5, last_known_location: 'EXEC_SUITE', alibi: 'In a board call from the executive suite from 09:30 onward.', flagged_reason: 'Highest clearance. Refused to shut Black Cipher down.', risk_score: 41 },
  { suspect_id: 'SUS-02', employee_id: 'E-1042', name: 'Dr. Elena Voss', role: 'Lead Architect, Black Cipher', department: 'Black Cipher Program', access_level: 5, last_known_location: 'RESEARCH_WING_A', alibi: 'Left the core at 09:44 for a stand-up in Research Wing A.', flagged_reason: 'Pushed to decommission Black Cipher days before the incident.', risk_score: 58 },
  { suspect_id: 'SUS-03', employee_id: 'E-1107', name: 'Kabir Rathod', role: 'Head of Security', department: 'Security', access_level: 4, last_known_location: 'SECURITY_HUB', alibi: 'Responded to a door-fault alert in the core at 09:55.', flagged_reason: 'Used an override to enter the core three minutes before the failure.', risk_score: 63 },
  { suspect_id: 'SUS-04', employee_id: 'E-1156', name: 'Dr. Yuki Tanaka', role: 'Quantum Substrate Engineer', department: 'Quantum Substrate', access_level: 4, last_known_location: 'QUANTUM_LAB', alibi: 'Claims she ran a scheduled substrate calibration and returned to the lab.', flagged_reason: 'Inside the core during the calibration window.', risk_score: 55 },
  { suspect_id: 'SUS-05', employee_id: 'E-1203', name: 'Marcus Hale', role: 'Facilities Engineer', department: 'Facilities', access_level: 3, last_known_location: 'LOADING_DOCK', alibi: 'HVAC inspection in the core, ticket FAC-8821.', flagged_reason: 'Was inside the core minutes before the camera loop began.', risk_score: 37 },
  { suspect_id: 'SUS-06', employee_id: 'E-1220', name: 'Priya Nair', role: 'Data Ethics Officer', department: 'Ethics & Compliance', access_level: 3, last_known_location: 'RESEARCH_WING_B', alibi: 'Escorted an intern to the core observation deck at 09:52.', flagged_reason: 'Filed three complaints about Black Cipher oversight.', risk_score: 29 },
  { suspect_id: 'SUS-07', employee_id: 'E-1288', name: 'Leon Adebayo', role: 'Network Operations Lead', department: 'Network Operations', access_level: 4, last_known_location: 'NETWORK_OPS', alibi: 'On shift in Network Operations all morning.', flagged_reason: 'Controls the relay network used for encrypted messages.', risk_score: 44 },
  { suspect_id: 'SUS-08', employee_id: 'E-1310', name: 'Sofia Lindqvist', role: 'Chief Financial Officer', department: 'Finance', access_level: 3, last_known_location: 'EXEC_SUITE', alibi: 'Budget review with the external auditor.', flagged_reason: 'Moved a large sum days before the theft.', risk_score: 48 },
  { suspect_id: 'SUS-09', employee_id: 'E-1377', name: 'Daniel Okafor', role: 'Research Intern', department: 'Research', access_level: 2, last_known_location: 'CAFETERIA', alibi: 'Was denied entry at 09:20, later escorted in at 09:52.', flagged_reason: 'Attempted to access the core without clearance.', risk_score: 33 },
  { suspect_id: 'SUS-10', employee_id: 'C-2041', name: 'Ingrid Sato', role: 'External Auditor', department: 'Audit', access_level: 2, last_known_location: 'EXEC_SUITE', alibi: 'With the CFO reviewing accounts.', flagged_reason: 'Outsider with access to financial systems.', risk_score: 26 },
  { suspect_id: 'SUS-11', employee_id: 'E-1401', name: 'Ravi Deshmukh', role: 'Building Systems Technician', department: 'Building Systems', access_level: 3, last_known_location: 'NETWORK_OPS', alibi: 'Servicing the maintenance console in Network Operations.', flagged_reason: 'Holds the maintenance tablet that can override camera feeds.', risk_score: 39 },
  { suspect_id: 'SUS-12', employee_id: 'E-1455', name: 'Dr. Hana Kowalski', role: 'Bio-Interface Lead', department: 'Bio-Interface', access_level: 3, last_known_location: 'MED_BAY', alibi: 'Running screenings in the medical bay.', flagged_reason: 'Neural Bridge project was defunded in favour of Black Cipher.', risk_score: 31 },
];

/* ---------------------------------------------------------------- devices */

const devices = [
  { device_id: 'DEV-0871', device_type: 'BAY_SENSOR', owner_id: null, assigned_location: 'TEMPORAL_CORE', mac_address: '02:C7:19:00:08:71', last_seen_at: ts(INCIDENT_DATE, 10, 30, 0), last_seen_location: 'TEMPORAL_CORE', status: 'ACTIVE', label: 'Substrate bay Q-7 sensor' },
  { device_id: 'DEV-0902', device_type: 'WORKSTATION', owner_id: 'E-1042', assigned_location: 'RESEARCH_WING_A', mac_address: '02:C7:19:00:09:02', last_seen_at: ts(INCIDENT_DATE, 10, 31, 14), last_seen_location: 'RESEARCH_WING_A', status: 'ACTIVE', label: 'Voss workstation' },
  { device_id: 'DEV-0903', device_type: 'WORKSTATION', owner_id: 'E-1001', assigned_location: 'EXEC_SUITE', mac_address: '02:C7:19:00:09:03', last_seen_at: ts(INCIDENT_DATE, 10, 29, 51), last_seen_location: 'EXEC_SUITE', status: 'ACTIVE', label: 'Menon workstation' },
  { device_id: 'DEV-0911', device_type: 'SECURITY_CONSOLE', owner_id: 'E-1107', assigned_location: 'SECURITY_HUB', mac_address: '02:C7:19:00:09:11', last_seen_at: ts(INCIDENT_DATE, 10, 32, 3), last_seen_location: 'SECURITY_HUB', status: 'ACTIVE', label: 'Security master console' },
  { device_id: 'DEV-0915', device_type: 'WORKSTATION', owner_id: 'E-1156', assigned_location: 'QUANTUM_LAB', mac_address: '02:C7:19:00:09:15', last_seen_at: ts(INCIDENT_DATE, 9, 49, 2), last_seen_location: 'QUANTUM_LAB', status: 'ACTIVE', label: 'Tanaka calibration workstation' },
  { device_id: 'DEV-0916', device_type: 'MOBILE', owner_id: 'E-1156', assigned_location: 'QUANTUM_LAB', mac_address: '02:C7:19:00:09:16', last_seen_at: ts(INCIDENT_DATE, 10, 5, 40), last_seen_location: 'ARCHIVE_VAULT_B2', status: 'ACTIVE', label: 'Tanaka institute phone' },
  { device_id: 'DEV-0921', device_type: 'MOBILE', owner_id: 'E-1203', assigned_location: 'LOADING_DOCK', mac_address: '02:C7:19:00:09:21', last_seen_at: ts(INCIDENT_DATE, 10, 28, 7), last_seen_location: 'LOADING_DOCK', status: 'ACTIVE', label: 'Hale institute phone' },
  { device_id: 'DEV-0924', device_type: 'WORKSTATION', owner_id: 'E-1220', assigned_location: 'RESEARCH_WING_B', mac_address: '02:C7:19:00:09:24', last_seen_at: ts(INCIDENT_DATE, 10, 30, 22), last_seen_location: 'RESEARCH_WING_B', status: 'ACTIVE', label: 'Nair workstation' },
  { device_id: 'DEV-0927', device_type: 'NETWORK_CONSOLE', owner_id: 'E-1288', assigned_location: 'NETWORK_OPS', mac_address: '02:C7:19:00:09:27', last_seen_at: ts(INCIDENT_DATE, 10, 32, 9), last_seen_location: 'NETWORK_OPS', status: 'ACTIVE', label: 'Chronos relay console' },
  { device_id: 'DEV-0930', device_type: 'WORKSTATION', owner_id: 'E-1310', assigned_location: 'EXEC_SUITE', mac_address: '02:C7:19:00:09:30', last_seen_at: ts(INCIDENT_DATE, 10, 31, 48), last_seen_location: 'EXEC_SUITE', status: 'ACTIVE', label: 'Lindqvist workstation' },
  { device_id: 'DEV-0932', device_type: 'MAINTENANCE_TABLET', owner_id: 'E-1401', assigned_location: 'NETWORK_OPS', mac_address: '02:C7:19:00:09:32', last_seen_at: ts(INCIDENT_DATE, 10, 12, 30), last_seen_location: 'NETWORK_OPS', status: 'ACTIVE', label: 'Building systems maintenance tablet' },
  { device_id: 'DEV-0935', device_type: 'MOBILE', owner_id: 'E-1377', assigned_location: 'RESEARCH_WING_A', mac_address: '02:C7:19:00:09:35', last_seen_at: ts(INCIDENT_DATE, 10, 27, 55), last_seen_location: 'CAFETERIA', status: 'ACTIVE', label: 'Okafor institute phone' },
  { device_id: 'DEV-0938', device_type: 'LAPTOP', owner_id: 'C-2041', assigned_location: 'EXEC_SUITE', mac_address: '02:C7:19:00:09:38', last_seen_at: ts(INCIDENT_DATE, 10, 30, 41), last_seen_location: 'EXEC_SUITE', status: 'ACTIVE', label: 'Auditor laptop (external)' },
  { device_id: 'DEV-0941', device_type: 'MOBILE', owner_id: 'E-1401', assigned_location: 'NETWORK_OPS', mac_address: '02:C7:19:00:09:41', last_seen_at: ts(INCIDENT_DATE, 10, 31, 2), last_seen_location: 'NETWORK_OPS', status: 'ACTIVE', label: 'Deshmukh institute phone' },
  { device_id: 'DEV-0944', device_type: 'WORKSTATION', owner_id: 'E-1455', assigned_location: 'MED_BAY', mac_address: '02:C7:19:00:09:44', last_seen_at: ts(INCIDENT_DATE, 10, 29, 16), last_seen_location: 'MED_BAY', status: 'ACTIVE', label: 'Kowalski workstation' },
  { device_id: 'DEV-0947', device_type: 'MOBILE', owner_id: 'E-1107', assigned_location: 'SECURITY_HUB', mac_address: '02:C7:19:00:09:47', last_seen_at: ts(INCIDENT_DATE, 10, 31, 37), last_seen_location: 'SECURITY_HUB', status: 'ACTIVE', label: 'Rathod institute phone' },
  { device_id: 'DEV-0950', device_type: 'WORKSTATION', owner_id: 'E-1063', assigned_location: 'RESEARCH_WING_A', mac_address: '02:C7:19:00:09:50', last_seen_at: ts(INCIDENT_DATE, 10, 30, 5), last_seen_location: 'RESEARCH_WING_A', status: 'ACTIVE', label: 'Herrera workstation' },
  { device_id: 'DEV-0953', device_type: 'WORKSTATION', owner_id: 'E-1088', assigned_location: 'RESEARCH_WING_A', mac_address: '02:C7:19:00:09:53', last_seen_at: ts(INCIDENT_DATE, 10, 30, 18), last_seen_location: 'RESEARCH_WING_A', status: 'ACTIVE', label: 'Whitfield workstation' },
  { device_id: 'DEV-0956', device_type: 'MOBILE', owner_id: 'E-1119', assigned_location: 'SECURITY_HUB', mac_address: '02:C7:19:00:09:56', last_seen_at: ts(INCIDENT_DATE, 10, 31, 12), last_seen_location: 'MAIN_LOBBY', status: 'ACTIVE', label: 'Ortega institute phone' },
  { device_id: 'DEV-0959', device_type: 'MOBILE', owner_id: 'E-1134', assigned_location: 'SECURITY_HUB', mac_address: '02:C7:19:00:09:59', last_seen_at: ts(INCIDENT_DATE, 10, 31, 20), last_seen_location: 'LOADING_DOCK', status: 'ACTIVE', label: 'Osei institute phone' },
  { device_id: 'DEV-0962', device_type: 'WORKSTATION', owner_id: 'E-1171', assigned_location: 'QUANTUM_LAB', mac_address: '02:C7:19:00:09:62', last_seen_at: ts(INCIDENT_DATE, 10, 30, 33), last_seen_location: 'QUANTUM_LAB', status: 'ACTIVE', label: 'Zhang workstation' },
  { device_id: 'DEV-0965', device_type: 'WORKSTATION', owner_id: 'E-1195', assigned_location: 'QUANTUM_LAB', mac_address: '02:C7:19:00:09:65', last_seen_at: ts(INCIDENT_DATE, 10, 30, 47), last_seen_location: 'QUANTUM_LAB', status: 'ACTIVE', label: 'Brennan workstation' },
  { device_id: 'DEV-0968', device_type: 'HVAC_CONTROLLER', owner_id: null, assigned_location: 'CORE_ANTEROOM', mac_address: '02:C7:19:00:09:68', last_seen_at: ts(INCIDENT_DATE, 10, 32, 0), last_seen_location: 'CORE_ANTEROOM', status: 'ACTIVE', label: 'Sublevel 3 HVAC controller' },
  { device_id: 'DEV-0971', device_type: 'DOOR_CONTROLLER', owner_id: null, assigned_location: 'TEMPORAL_CORE', mac_address: '02:C7:19:00:09:71', last_seen_at: ts(INCIDENT_DATE, 10, 32, 0), last_seen_location: 'TEMPORAL_CORE', status: 'FAULT', label: 'Temporal Core blast door controller' },
  { device_id: 'DEV-0974', device_type: 'MOBILE', owner_id: 'E-1288', assigned_location: 'NETWORK_OPS', mac_address: '02:C7:19:00:09:74', last_seen_at: ts(INCIDENT_DATE, 10, 31, 55), last_seen_location: 'NETWORK_OPS', status: 'ACTIVE', label: 'Adebayo institute phone' },
];

/* ------------------------------------------------------------ access logs */

// Hand-written, story-critical entries (17 Sep 2045).
const keyAccessLogs = [
  ['AL-0021', 'E-1042', 'TEMPORAL_CORE', ts(INCIDENT_DATE, 7, 58, 12), 'ENTRY', 'GRANTED', 'BADGE'],
  ['AL-0022', 'E-1042', 'TEMPORAL_CORE', ts(INCIDENT_DATE, 8, 40, 3), 'EXIT', 'GRANTED', 'BADGE'],
  ['AL-0023', 'E-1001', 'EXEC_SUITE', ts(INCIDENT_DATE, 8, 47, 20), 'ENTRY', 'GRANTED', 'BADGE'],
  ['AL-0024', 'E-1156', 'QUANTUM_LAB', ts(INCIDENT_DATE, 8, 52, 44), 'ENTRY', 'GRANTED', 'BADGE'],
  ['AL-0025', 'E-1001', 'TEMPORAL_CORE', ts(INCIDENT_DATE, 9, 12, 5), 'ENTRY', 'GRANTED', 'BADGE'],
  ['AL-0026', 'E-1001', 'TEMPORAL_CORE', ts(INCIDENT_DATE, 9, 26, 38), 'EXIT', 'GRANTED', 'BADGE'],
  ['AL-0027', 'E-1377', 'TEMPORAL_CORE', ts(INCIDENT_DATE, 9, 20, 17), 'ENTRY', 'DENIED', 'BADGE'],
  ['AL-0028', 'E-1401', 'NETWORK_OPS', ts(INCIDENT_DATE, 9, 30, 2), 'ENTRY', 'GRANTED', 'BADGE'],
  ['AL-0029', 'E-1042', 'TEMPORAL_CORE', ts(INCIDENT_DATE, 9, 32, 50), 'ENTRY', 'GRANTED', 'BADGE'],
  ['AL-0030', 'E-1203', 'TEMPORAL_CORE', ts(INCIDENT_DATE, 9, 35, 11), 'ENTRY', 'GRANTED', 'BADGE'],
  ['AL-0031', 'E-1156', 'TEMPORAL_CORE', ts(INCIDENT_DATE, 9, 41, 12), 'ENTRY', 'GRANTED', 'BADGE'],
  ['AL-0032', 'E-1107', 'SECURITY_HUB', ts(INCIDENT_DATE, 9, 36, 40), 'ENTRY', 'GRANTED', 'BADGE'],
  ['AL-0033', 'E-1203', 'TEMPORAL_CORE', ts(INCIDENT_DATE, 9, 43, 27), 'EXIT', 'GRANTED', 'BADGE'],
  ['AL-0034', 'E-1042', 'TEMPORAL_CORE', ts(INCIDENT_DATE, 9, 44, 9), 'EXIT', 'GRANTED', 'BADGE'],
  ['AL-0035', 'E-1220', 'TEMPORAL_CORE', ts(INCIDENT_DATE, 9, 52, 30), 'ENTRY', 'GRANTED', 'BADGE'],
  ['AL-0036', 'E-1377', 'TEMPORAL_CORE', ts(INCIDENT_DATE, 9, 52, 41), 'ENTRY', 'GRANTED', 'ESCORT'],
  ['AL-0037', 'E-1107', 'TEMPORAL_CORE', ts(INCIDENT_DATE, 9, 55, 2), 'ENTRY', 'GRANTED', 'OVERRIDE'],
  ['AL-0038', 'E-1156', 'TEMPORAL_CORE', ts(INCIDENT_DATE, 9, 57, 19), 'EXIT', 'GRANTED', 'BADGE'],
  ['AL-0039', 'E-1220', 'TEMPORAL_CORE', ts(INCIDENT_DATE, 9, 59, 5), 'EXIT', 'GRANTED', 'BADGE'],
  ['AL-0040', 'E-1377', 'TEMPORAL_CORE', ts(INCIDENT_DATE, 9, 59, 12), 'EXIT', 'GRANTED', 'ESCORT'],
  ['AL-0041', 'E-1107', 'TEMPORAL_CORE', ts(INCIDENT_DATE, 10, 1, 48), 'EXIT', 'GRANTED', 'BADGE'],
  ['AL-0042', 'E-1042', 'RESEARCH_WING_A', ts(INCIDENT_DATE, 9, 47, 30), 'ENTRY', 'GRANTED', 'BADGE'],
  ['AL-0043', 'E-1156', 'CORE_ANTEROOM', ts(INCIDENT_DATE, 9, 58, 40), 'EXIT', 'GRANTED', 'BADGE'],
  ['AL-0044', 'E-1156', 'ARCHIVE_VAULT_B2', ts(INCIDENT_DATE, 10, 4, 21), 'ENTRY', 'GRANTED', 'BADGE'],
  ['AL-0045', 'E-1107', 'SECURITY_HUB', ts(INCIDENT_DATE, 10, 6, 2), 'ENTRY', 'GRANTED', 'BADGE'],
  ['AL-0046', 'E-1401', 'NETWORK_OPS', ts(INCIDENT_DATE, 10, 9, 15), 'EXIT', 'GRANTED', 'BADGE'],
  ['AL-0047', 'E-1156', 'ARCHIVE_VAULT_B2', ts(INCIDENT_DATE, 10, 11, 4), 'EXIT', 'GRANTED', 'BADGE'],
  ['AL-0048', 'E-1156', 'QUANTUM_LAB', ts(INCIDENT_DATE, 10, 16, 33), 'ENTRY', 'GRANTED', 'BADGE'],
  ['AL-0049', 'E-1401', 'NETWORK_OPS', ts(INCIDENT_DATE, 10, 14, 51), 'ENTRY', 'GRANTED', 'BADGE'],
  ['AL-0050', 'E-1377', 'CAFETERIA', ts(INCIDENT_DATE, 10, 8, 26), 'ENTRY', 'GRANTED', 'BADGE'],
];

// Deterministic filler: ordinary morning traffic through public/less sensitive areas.
const fillerLocations = ['MAIN_LOBBY', 'CAFETERIA', 'RESEARCH_WING_A', 'RESEARCH_WING_B', 'EXEC_SUITE', 'SERVER_FARM', 'MED_BAY', 'LOADING_DOCK', 'QUANTUM_LAB', 'NETWORK_OPS'];
const fillerStaff = employees.map((e) => e.employee_id);

function buildAccessLogs() {
  const rows = [];
  // Early morning arrivals through the lobby (AL-0001 .. AL-0020)
  const arrivals = ['E-1012', 'E-1107', 'E-1119', 'E-1134', 'E-1288', 'E-1266', 'E-1042', 'E-1203', 'E-1401', 'E-1001', 'E-1156', 'E-1220', 'E-1377', 'E-1310', 'C-2041', 'E-1455', 'E-1063', 'E-1088', 'E-1322', 'E-1433'];
  arrivals.forEach((emp, i) => {
    const minute = 20 + i * 4;
    rows.push({ log_id: id('AL', i + 1), employee_id: emp, location_id: 'MAIN_LOBBY', timestamp: ts(INCIDENT_DATE, 7 + Math.floor(minute / 60), minute % 60, between(0, 59)), direction: 'ENTRY', result: 'GRANTED', badge_id: employeeById[emp].badge_id, method: 'BADGE' });
  });
  keyAccessLogs.forEach(([log_id, employee_id, location_id, timestamp, direction, result, method]) => {
    rows.push({ log_id, employee_id, location_id, timestamp, direction, result, badge_id: employeeById[employee_id].badge_id, method });
  });
  // Filler AL-0051 .. AL-0086 — never touches TEMPORAL_CORE or ARCHIVE_VAULT_B2.
  for (let n = 51; n <= 86; n += 1) {
    const emp = pick(fillerStaff);
    const hour = between(8, 11);
    const minute = between(0, 59);
    const loc = pick(fillerLocations);
    const level = locations.find((l) => l.location_id === loc).security_level;
    const denied = employeeById[emp].access_level < level;
    rows.push({ log_id: id('AL', n), employee_id: emp, location_id: loc, timestamp: ts(INCIDENT_DATE, hour, minute, between(0, 59)), direction: rand() > 0.4 ? 'ENTRY' : 'EXIT', result: denied ? 'DENIED' : 'GRANTED', badge_id: employeeById[emp].badge_id, method: 'BADGE' });
  }
  return rows.sort((a, b) => a.log_id.localeCompare(b.log_id));
}

/* -------------------------------------------------------------- cctv logs */

function buildCctvLogs() {
  const rows = [];
  let n = 1;
  const push = (camera_id, location_id, timestamp, status, frame_hash, operator_id, note) => {
    rows.push({ record_id: id('CC', n), camera_id, location_id, timestamp, status, frame_hash, operator_id, note });
    n += 1;
  };
  // Loading dock camera offline for scheduled maintenance (red herring).
  push('CAM-G-02', 'LOADING_DOCK', ts(INCIDENT_DATE, 6, 0, 0), 'ACTIVE', '9c1e4b2a', 'E-1134', 'Shift start.');
  push('CAM-G-02', 'LOADING_DOCK', ts(INCIDENT_DATE, 6, 30, 0), 'OFFLINE', null, 'E-1401', 'Scheduled lens replacement, ticket FAC-8790.');
  push('CAM-G-02', 'LOADING_DOCK', ts(INCIDENT_DATE, 7, 15, 0), 'ACTIVE', 'a41f0c77', 'E-1401', 'Maintenance complete.');
  // Lobby, hub and research wings — routine.
  const routine = [
    ['CAM-G-01', 'MAIN_LOBBY'], ['CAM-G-03', 'SECURITY_HUB'], ['CAM-L2-01', 'RESEARCH_WING_A'], ['CAM-L2-02', 'RESEARCH_WING_B'],
    ['CAM-L3-01', 'QUANTUM_LAB'], ['CAM-S1-02', 'NETWORK_OPS'], ['CAM-L5-01', 'EXEC_SUITE'],
  ];
  routine.forEach(([cam, loc]) => {
    for (let h = 8; h <= 10; h += 1) {
      push(cam, loc, ts(INCIDENT_DATE, h, 0, 0), 'ACTIVE', Math.floor(rand() * 0xffffffff).toString(16).padStart(8, '0'), null, null);
    }
  });
  // Core anteroom camera — active throughout.
  [[9, 27], [9, 33], [9, 39], [9, 45], [9, 51], [9, 57], [10, 3], [10, 9]].forEach(([h, m]) => {
    push('CAM-S3-06', 'CORE_ANTEROOM', ts(INCIDENT_DATE, h, m, 0), 'ACTIVE', Math.floor(rand() * 0xffffffff).toString(16).padStart(8, '0'), null, null);
  });
  // Temporal Core corridor camera — LOOPED from 09:39 to 10:03.
  push('CAM-S3-07', 'TEMPORAL_CORE', ts(INCIDENT_DATE, 9, 27, 0), 'ACTIVE', '3b9d10e4', null, null);
  push('CAM-S3-07', 'TEMPORAL_CORE', ts(INCIDENT_DATE, 9, 33, 0), 'ACTIVE', '7ac2f951', null, null);
  push('CAM-S3-07', 'TEMPORAL_CORE', ts(INCIDENT_DATE, 9, 39, 0), 'LOOPED', 'f7a1d3c0', null, 'Frame hash repeating. Feed replaced by 6-minute segment.');
  push('CAM-S3-07', 'TEMPORAL_CORE', ts(INCIDENT_DATE, 9, 45, 0), 'LOOPED', 'f7a1d3c0', null, 'Frame hash repeating.');
  push('CAM-S3-07', 'TEMPORAL_CORE', ts(INCIDENT_DATE, 9, 51, 0), 'LOOPED', 'f7a1d3c0', null, 'Frame hash repeating.');
  push('CAM-S3-07', 'TEMPORAL_CORE', ts(INCIDENT_DATE, 9, 57, 0), 'LOOPED', 'f7a1d3c0', null, 'Frame hash repeating.');
  push('CAM-S3-07', 'TEMPORAL_CORE', ts(INCIDENT_DATE, 10, 3, 0), 'LOOPED', 'f7a1d3c0', null, 'Frame hash repeating. Loop ends at 10:03:40.');
  push('CAM-S3-07', 'TEMPORAL_CORE', ts(INCIDENT_DATE, 10, 9, 0), 'ACTIVE', '51e8b7aa', 'E-1119', 'Feed restored. Operator reviewing.');
  // Archive vault camera — catches a figure with a transport case.
  push('CAM-S2-03', 'ARCHIVE_VAULT_B2', ts(INCIDENT_DATE, 9, 58, 0), 'ACTIVE', 'c0ffee12', null, null);
  push('CAM-S2-03', 'ARCHIVE_VAULT_B2', ts(INCIDENT_DATE, 10, 4, 0), 'ACTIVE', 'd4e5f601', null, 'Single individual entering with a sealed transport case.');
  push('CAM-S2-03', 'ARCHIVE_VAULT_B2', ts(INCIDENT_DATE, 10, 10, 0), 'ACTIVE', 'e6a7b8c9', null, 'Individual exits without the case.');
  return rows;
}

/* --------------------------------------------------------- communications */

function buildCommunications() {
  const d = (day, h, m, s = 0) => ts(`2045-09-${pad(day)}`, h, m, s);
  const rows = [
    // Routine internal mail, 10–16 Sept.
    ['CM-0001', 'E-1012', 'E-1001', 'INTERNAL_MAIL', d(10, 8, 5), 'Board agenda', 'Board pack attached for Friday. Item 4 is Black Cipher governance.', 0],
    ['CM-0002', 'E-1063', 'E-1088', 'INTERNAL_MAIL', d(10, 9, 14), 'Drift readings', 'Temporal drift is 0.4% above tolerance. Can you re-run the model?', 0],
    ['CM-0003', 'E-1088', 'E-1063', 'INTERNAL_MAIL', d(10, 11, 2), 'RE: Drift readings', 'Re-ran it twice. Same result. Flagging to Menon.', 0],
    ['CM-0004', 'E-1203', 'E-1412', 'INTERNAL_MAIL', d(11, 7, 45), 'S3 HVAC', 'Sublevel 3 HVAC is cycling again. Book a slot with Deshmukh for the controller.', 0],
    ['CM-0005', 'E-1310', 'E-1322', 'INTERNAL_MAIL', d(11, 10, 20), 'Q3 close', 'Need the Q3 ledger reconciled before the auditor arrives Monday.', 0],
    ['CM-0006', 'E-1220', 'E-1241', 'INTERNAL_MAIL', d(11, 14, 30), 'Oversight report', 'Third complaint filed on Black Cipher oversight. Attach the log excerpts.', 0],
    ['CM-0007', 'E-1288', 'E-1266', 'INTERNAL_MAIL', d(12, 8, 12), 'Relay firmware', 'Push relay firmware 4.2 to all nodes tonight.', 0],
    ['CM-0008', 'E-1455', 'E-1470', 'INTERNAL_MAIL', d(12, 9, 33), 'Neural Bridge', 'Funding is frozen until Q1. Keep the samples in cold storage.', 0],
    ['CM-0009', 'E-1377', 'E-1389', 'CHAT', d(12, 12, 40), null, 'Lunch? Cafeteria has the good noodles today.', 0],
    ['CM-0010', 'E-1389', 'E-1377', 'CHAT', d(12, 12, 41), null, 'On my way.', 0],
    ['CM-0011', 'E-1171', 'E-1156', 'INTERNAL_MAIL', d(13, 9, 8), 'Q-8 batch', 'Q-8 batch cooled without cracks. Ready for inspection.', 0],
    ['CM-0012', 'E-1156', 'E-1171', 'INTERNAL_MAIL', d(13, 9, 40), 'RE: Q-8 batch', 'Good. Hold it until after Wednesday’s calibration window.', 0],
    ['CM-0013', 'E-1107', 'E-1119', 'INTERNAL_MAIL', d(13, 7, 30), 'Shift roster', 'You are on the hub Wednesday morning. Osei covers the dock.', 0],
    ['CM-0014', 'E-1348', 'E-1310', 'INTERNAL_MAIL', d(13, 15, 10), 'Substrate supplier', 'Helix Dynamics quote for substrate housings attached.', 0],
    ['CM-0015', 'E-1001', 'E-1012', 'INTERNAL_MAIL', d(14, 8, 0), 'Wednesday', 'Clear my 09:30. Board call moves to the suite.', 0],
    ['CM-0016', 'E-1266', 'E-1299', 'CHAT', d(14, 10, 15), null, 'Relay node 7 dropped again. Can you check it?', 0],
    ['CM-0017', 'E-1299', 'E-1266', 'CHAT', d(14, 10, 22), null, 'Rebooted. Stable now.', 0],
    ['CM-0018', 'E-1433', 'E-1203', 'INTERNAL_MAIL', d(14, 11, 50), 'Dock delivery', 'Two crates of coolant arrive Wednesday 08:00.', 0],
    ['CM-0019', 'E-1488', 'E-1001', 'INTERNAL_MAIL', d(15, 9, 5), 'Governance', 'Legal review of the Black Cipher charter is complete. No blocking issues.', 0],
    ['CM-0020', 'E-1360', 'E-1063', 'INTERNAL_MAIL', d(15, 13, 20), 'Paper draft', 'Draft of the drift paper attached.', 0],
    // Security relay test (ENCRYPTED_RELAY, innocent).
    ['CM-0021', 'E-1107', 'E-1288', 'ENCRYPTED_RELAY', d(15, 16, 0), 'Relay test', 'Testing encrypted relay after firmware update. Reply if received.', 0],
    ['CM-0022', 'E-1288', 'E-1107', 'ENCRYPTED_RELAY', d(15, 16, 2), 'RE: Relay test', 'Received. Relay is clean.', 0],
    ['CM-0023', 'C-2041', 'E-1310', 'EXTERNAL_MAIL', d(15, 17, 30), 'Audit schedule', 'I will be on site Wednesday from 09:00. Please have Q3 ready.', 0],
    ['CM-0024', 'E-1119', 'E-1134', 'CHAT', d(16, 7, 55), null, 'Swap breaks? I have a dentist at 11.', 0],
    ['CM-0025', 'E-1134', 'E-1119', 'CHAT', d(16, 7, 58), null, 'Fine by me.', 0],
    ['CM-0026', 'E-1470', 'E-1455', 'INTERNAL_MAIL', d(16, 9, 10), 'Screenings', 'Wednesday screenings are booked 09:00–11:00 in Med Bay.', 0],
    ['CM-0027', 'E-1088', 'E-1001', 'INTERNAL_MAIL', d(16, 10, 30), 'Drift escalation', 'Drift remains above tolerance. Recommend postponing Wednesday calibration.', 0],
    ['CM-0028', 'E-1001', 'E-1088', 'INTERNAL_MAIL', d(16, 11, 5), 'RE: Drift escalation', 'Calibration proceeds as scheduled. Tanaka has signed off.', 0],
    ['CM-0029', 'E-1241', 'E-1220', 'INTERNAL_MAIL', d(16, 14, 0), 'Observation deck', 'Intern Okafor asked to see the core. I said he needs an escort.', 0],
    // Red herrings, 16 Sept.
    ['CM-0030', 'E-1042', 'E-1001', 'INTERNAL_MAIL', d(16, 18, 42), 'We need to talk about shutting it down', 'Black Cipher asked me today why its substrate is removable. We should shut it down before Friday.', 1],
    ['CM-0031', 'E-1001', 'E-1042', 'INTERNAL_MAIL', d(16, 19, 15), 'RE: We need to talk about shutting it down', 'Absolutely not. The board meets Friday and this project is the institute. Drop it.', 1],
    ['CM-0032', 'E-1455', 'E-1001', 'INTERNAL_MAIL', d(16, 20, 3), 'Neural Bridge funding', 'Every credit you put into Black Cipher came out of my programme. I want that on record.', 0],
    // 17 Sept morning.
    ['CM-0033', 'E-1203', 'E-1401', 'INTERNAL_MAIL', d(17, 7, 40), 'FAC-8821', 'Core HVAC inspection at 09:35. I need the S3 controller unlocked from the maintenance console.', 0],
    ['CM-0034', 'E-1401', 'E-1203', 'INTERNAL_MAIL', d(17, 7, 52), 'RE: FAC-8821', 'Unlocked from 09:30. Lock it back when you are done.', 0],
    ['CM-0035', 'E-1310', 'E-1001', 'INTERNAL_MAIL', d(17, 8, 15), 'Budget reallocation', 'Moving 12,000,000 credits from Neural Bridge to Black Cipher per board resolution. Auditor is aware.', 1],
    ['CM-0036', 'E-1377', 'E-1042', 'INTERNAL_MAIL', d(17, 8, 30), 'Core observation', 'Could I observe the core today? I promise not to touch anything.', 0],
    ['CM-0037', 'E-1042', 'E-1377', 'INTERNAL_MAIL', d(17, 8, 41), 'RE: Core observation', 'Not without an escort. Ask Priya Nair.', 0],
    ['CM-0038', 'E-1156', 'broker@meridian-holdings.net', 'EXTERNAL_MAIL', d(17, 8, 50), 'Delivery', 'Package ready by noon. Confirm final transfer.', 1],
    ['CM-0039', 'E-1012', 'E-1310', 'CHAT', d(17, 9, 2), null, 'The auditor is in reception.', 0],
    ['CM-0040', 'E-1063', 'E-1042', 'CHAT', d(17, 9, 10), null, 'Stand-up moved to 09:45 in Wing A.', 0],
    // The conspiracy.
    ['CM-0041', 'E-1156', 'E-1401', 'ENCRYPTED_RELAY', d(17, 9, 21, 7), null, 'Window opens 09:39. Keep S3-07 dark until I say. Vault after.', 1],
    ['CM-0042', 'E-1401', 'E-1156', 'ENCRYPTED_RELAY', d(17, 9, 23, 48), null, 'Loop is staged from the maintenance tablet. 24 minutes max before the hub notices.', 1],
    ['CM-0043', 'E-1156', 'E-1401', 'ENCRYPTED_RELAY', d(17, 9, 58, 50), null, 'Done. Moving it to B2.', 1],
    ['CM-0044', 'E-1401', 'E-1156', 'ENCRYPTED_RELAY', d(17, 10, 12, 2), null, 'Feed restored. Nobody looked.', 1],
    // Aftermath.
    ['CM-0045', 'E-1107', 'E-1001', 'INTERNAL_MAIL', d(17, 10, 20), 'INCIDENT', 'Core reported critical at 09:58. Substrate bay Q-7 is empty. Locking down sublevels.', 1],
    ['CM-0046', 'E-1119', 'E-1107', 'CHAT', d(17, 10, 24), null, 'S3-07 frame hashes were identical for 24 minutes. Someone looped it.', 1],
    ['CM-0047', 'E-1042', 'E-1001', 'INTERNAL_MAIL', d(17, 10, 31), 'It’s gone', 'Black Cipher is gone. Not deleted. Gone. Someone took the substrate.', 1],
    ['CM-0048', 'E-1220', 'E-1001', 'INTERNAL_MAIL', d(17, 10, 45), 'Okafor', 'For the record, the intern was with me the whole time on the observation deck.', 0],
  ];
  return rows.map(([message_id, sender_id, recipient_id, channel, timestamp, subject, content, flagged]) => ({ message_id, sender_id, recipient_id, channel, timestamp, subject, content, flagged }));
}

/* ----------------------------------------------------------- transactions */

function buildTransactions() {
  const rows = [];
  let n = 1;
  const push = (account_holder_id, counterparty, amount, direction, timestamp, reference, flagged) => {
    rows.push({ txn_id: id('TX', n), account_holder_id, counterparty, amount, currency: 'CR', direction, timestamp, reference, flagged });
    n += 1;
  };
  // Payroll for everyone on 31 Aug (TX-0001 .. TX-0030).
  employees.forEach((e) => {
    const salary = 4200 + (e.access_level * 1800) + between(0, 900);
    push(e.employee_id, 'NOVATECH PAYROLL', salary, 'IN', '2045-08-31 06:00:00', 'SALARY-AUG-2045', 0);
  });
  // Everyday outgoing spend (TX-0031 .. TX-0100) — small, unremarkable.
  const merchants = ['METRO TRANSIT', 'NOVA GRID ENERGY', 'ORBITAL GROCERS', 'CAFE LUMEN', 'CITY WATER CO', 'STREAMWAVE MEDIA', 'HARBOUR PHARMACY', 'ATLAS BOOKS'];
  for (let i = 0; i < 70; i += 1) {
    const e = pick(employees);
    const day = between(18, 30);
    const month = day > 24 ? '08' : '09';
    const dd = month === '09' ? day - 17 : day;
    push(e.employee_id, pick(merchants), between(12, 480), 'OUT', `2045-${month}-${pad(dd)} ${pad(between(7, 21))}:${pad(between(0, 59))}:00`, 'CARD-PURCHASE', 0);
  }
  // Story-critical transfers.
  push('E-1156', 'MERIDIAN HOLDINGS', 500000, 'IN', '2045-08-21 22:14:09', 'CONSULTING-Q3', 1); // TX-0101
  push('E-1310', 'NOVATECH BOARD', 1200000, 'IN', '2045-09-01 09:00:00', 'RETENTION-BONUS', 1); // TX-0102 (red herring)
  push('E-1156', 'MERIDIAN HOLDINGS', 450000, 'IN', '2045-09-04 23:41:55', 'CONSULTING-Q3', 1); // TX-0103
  push('E-1107', 'SENTINEL PRIVATE SECURITY', 85000, 'IN', '2045-09-06 12:30:00', 'ADVISORY-FEE', 1); // TX-0104 (red herring)
  push('E-1401', 'MERIDIAN HOLDINGS', 120000, 'IN', '2045-09-10 21:05:33', 'MAINT-RETAINER', 1); // TX-0105
  push('E-1377', 'STUDENT LOAN BOARD', 620, 'OUT', '2045-09-12 08:00:00', 'LOAN-REPAYMENT', 0); // TX-0106
  push('E-1156', 'MERIDIAN HOLDINGS', 500000, 'IN', '2045-09-16 23:58:01', 'FINAL-TRANCHE', 1); // TX-0107
  push('E-1455', 'BIOSYNTH LABS', 40000, 'IN', '2045-09-14 10:15:00', 'SPEAKER-FEE', 0); // TX-0108
  push('E-1042', 'NOVATECH PAYROLL', 25000, 'IN', '2045-09-15 06:00:00', 'PATENT-AWARD', 0); // TX-0109
  push('E-1401', 'CAFE LUMEN', 18, 'OUT', '2045-09-17 08:05:00', 'CARD-PURCHASE', 0); // TX-0110
  return rows;
}

/* -------------------------------------------------------- security events */

const securityEvents = [
  { event_id: 'SE-0001', timestamp: ts(INCIDENT_DATE, 6, 30, 12), event_type: 'CAMERA_OFFLINE', severity: 'LOW', location_id: 'LOADING_DOCK', device_id: 'DEV-0932', employee_id: 'E-1401', description: 'CAM-G-02 taken offline for scheduled lens replacement (FAC-8790).', resolved: 1 },
  { event_id: 'SE-0002', timestamp: ts(INCIDENT_DATE, 7, 15, 40), event_type: 'CAMERA_ONLINE', severity: 'LOW', location_id: 'LOADING_DOCK', device_id: 'DEV-0932', employee_id: 'E-1401', description: 'CAM-G-02 restored.', resolved: 1 },
  { event_id: 'SE-0003', timestamp: ts(INCIDENT_DATE, 7, 58, 12), event_type: 'HIGH_CLEARANCE_ENTRY', severity: 'INFO', location_id: 'TEMPORAL_CORE', device_id: 'DEV-0971', employee_id: 'E-1042', description: 'Level 5 badge entry logged.', resolved: 1 },
  { event_id: 'SE-0004', timestamp: ts(INCIDENT_DATE, 8, 2, 0), event_type: 'RELAY_HANDSHAKE', severity: 'INFO', location_id: 'NETWORK_OPS', device_id: 'DEV-0927', employee_id: 'E-1288', description: 'Chronos relay nightly handshake completed.', resolved: 1 },
  { event_id: 'SE-0005', timestamp: ts(INCIDENT_DATE, 9, 12, 5), event_type: 'HIGH_CLEARANCE_ENTRY', severity: 'INFO', location_id: 'TEMPORAL_CORE', device_id: 'DEV-0971', employee_id: 'E-1001', description: 'Level 5 badge entry logged.', resolved: 1 },
  { event_id: 'SE-0006', timestamp: ts(INCIDENT_DATE, 9, 20, 17), event_type: 'ACCESS_DENIED', severity: 'MEDIUM', location_id: 'TEMPORAL_CORE', device_id: 'DEV-0971', employee_id: 'E-1377', description: 'Badge B-7377 rejected: clearance level 2 below required level 5.', resolved: 1 },
  { event_id: 'SE-0007', timestamp: ts(INCIDENT_DATE, 9, 30, 30), event_type: 'CONSOLE_UNLOCK', severity: 'LOW', location_id: 'NETWORK_OPS', device_id: 'DEV-0932', employee_id: 'E-1401', description: 'S3 HVAC controller unlocked for ticket FAC-8821.', resolved: 1 },
  { event_id: 'SE-0008', timestamp: ts(INCIDENT_DATE, 9, 35, 11), event_type: 'MAINTENANCE_ENTRY', severity: 'INFO', location_id: 'TEMPORAL_CORE', device_id: 'DEV-0971', employee_id: 'E-1203', description: 'Facilities entry under ticket FAC-8821.', resolved: 1 },
  { event_id: 'SE-0009', timestamp: ts(INCIDENT_DATE, 9, 37, 15), event_type: 'DOOR_FAULT', severity: 'MEDIUM', location_id: 'CORE_ANTEROOM', device_id: 'DEV-0971', employee_id: null, description: 'Blast door controller reported intermittent fault. Security notified.', resolved: 0 },
  { event_id: 'SE-0010', timestamp: ts(INCIDENT_DATE, 9, 38, 40), event_type: 'FEED_OVERRIDE', severity: 'HIGH', location_id: 'TEMPORAL_CORE', device_id: 'DEV-0932', employee_id: null, description: 'Camera CAM-S3-07 feed override issued from maintenance tablet. Operator field blank.', resolved: 0 },
  { event_id: 'SE-0011', timestamp: ts(INCIDENT_DATE, 9, 41, 12), event_type: 'HIGH_CLEARANCE_ENTRY', severity: 'INFO', location_id: 'TEMPORAL_CORE', device_id: 'DEV-0971', employee_id: 'E-1156', description: 'Level 4 badge entry logged under calibration window CAL-7741.', resolved: 1 },
  { event_id: 'SE-0012', timestamp: ts(INCIDENT_DATE, 9, 45, 3), event_type: 'CALIBRATION_SCRIPT_EXEC', severity: 'MEDIUM', location_id: 'TEMPORAL_CORE', device_id: 'DEV-0915', employee_id: 'E-1156', description: 'Calibration script CAL-7741 executed remotely from Quantum Lab workstation. Script hash does not match approved version.', resolved: 0 },
  { event_id: 'SE-0013', timestamp: ts(INCIDENT_DATE, 9, 47, 12), event_type: 'SUBSTRATE_BAY_OPEN', severity: 'CRITICAL', location_id: 'TEMPORAL_CORE', device_id: 'DEV-0871', employee_id: null, description: 'Substrate bay Q-7 opened while calibration script CAL-7741 was suppressing alarms.', resolved: 0 },
  { event_id: 'SE-0014', timestamp: ts(INCIDENT_DATE, 9, 55, 2), event_type: 'OVERRIDE_ENTRY', severity: 'HIGH', location_id: 'TEMPORAL_CORE', device_id: 'DEV-0911', employee_id: 'E-1107', description: 'Head of Security used master override to enter core in response to DOOR_FAULT SE-0009.', resolved: 1 },
  { event_id: 'SE-0015', timestamp: ts(INCIDENT_DATE, 9, 58, 3), event_type: 'TEMPORAL_CORE_CRITICAL', severity: 'CRITICAL', location_id: 'TEMPORAL_CORE', device_id: 'DEV-0871', employee_id: null, description: 'Temporal Core reactor reported critical error. Substrate Q-7 not detected. BLACK CIPHER status: MISSING.', resolved: 0 },
  { event_id: 'SE-0016', timestamp: ts(INCIDENT_DATE, 10, 3, 40), event_type: 'FEED_RESTORED', severity: 'MEDIUM', location_id: 'TEMPORAL_CORE', device_id: 'DEV-0932', employee_id: null, description: 'CAM-S3-07 override cleared from maintenance tablet.', resolved: 0 },
  { event_id: 'SE-0017', timestamp: ts(INCIDENT_DATE, 10, 4, 21), event_type: 'VAULT_ENTRY', severity: 'MEDIUM', location_id: 'ARCHIVE_VAULT_B2', device_id: null, employee_id: 'E-1156', description: 'Badge entry to Archive Vault B2 outside scheduled archive hours.', resolved: 0 },
  { event_id: 'SE-0018', timestamp: ts(INCIDENT_DATE, 10, 6, 2), event_type: 'LOCKDOWN', severity: 'CRITICAL', location_id: 'SECURITY_HUB', device_id: 'DEV-0911', employee_id: 'E-1107', description: 'Sublevel lockdown initiated by Head of Security.', resolved: 1 },
  { event_id: 'SE-0019', timestamp: ts(INCIDENT_DATE, 10, 24, 0), event_type: 'CCTV_ANOMALY', severity: 'HIGH', location_id: 'SECURITY_HUB', device_id: 'DEV-0911', employee_id: 'E-1119', description: 'Operator flagged identical frame hashes on CAM-S3-07 between 09:39 and 10:03.', resolved: 0 },
  { event_id: 'SE-0020', timestamp: ts(INCIDENT_DATE, 10, 40, 0), event_type: 'INVESTIGATION_OPENED', severity: 'INFO', location_id: 'SECURITY_HUB', device_id: null, employee_id: 'E-1107', description: 'Case BLACK CIPHER opened. CHRONOS investigators granted database access.', resolved: 0 },
  { event_id: 'SE-0021', timestamp: ts(INCIDENT_DATE, 8, 12, 33), event_type: 'ACCESS_DENIED', severity: 'LOW', location_id: 'SERVER_FARM', device_id: null, employee_id: 'E-1433', description: 'Logistics badge rejected at server farm.', resolved: 1 },
  { event_id: 'SE-0022', timestamp: ts(INCIDENT_DATE, 8, 44, 10), event_type: 'VISITOR_CHECKIN', severity: 'INFO', location_id: 'MAIN_LOBBY', device_id: null, employee_id: 'C-2041', description: 'External auditor checked in at reception.', resolved: 1 },
  { event_id: 'SE-0023', timestamp: ts(INCIDENT_DATE, 9, 5, 50), event_type: 'HVAC_CYCLE', severity: 'LOW', location_id: 'CORE_ANTEROOM', device_id: 'DEV-0968', employee_id: null, description: 'Sublevel 3 HVAC cycled unexpectedly.', resolved: 1 },
  { event_id: 'SE-0024', timestamp: ts(INCIDENT_DATE, 11, 2, 0), event_type: 'DEVICE_PING', severity: 'MEDIUM', location_id: 'ARCHIVE_VAULT_B2', device_id: 'DEV-0916', employee_id: 'E-1156', description: 'Institute phone DEV-0916 last associated with vault access point at 10:05.', resolved: 0 },
  { event_id: 'SE-0025', timestamp: ts(INCIDENT_DATE, 11, 30, 0), event_type: 'AUDIT_FLAG', severity: 'HIGH', location_id: 'EXEC_SUITE', device_id: 'DEV-0938', employee_id: 'C-2041', description: 'Auditor flagged three incoming transfers from MERIDIAN HOLDINGS to a staff account.', resolved: 0 },
];

/* ------------------------------------------------------------- assembling */

const col = (name, type, extra = {}) => ({ name, type, isPrimary: false, references: null, description: '', ...extra });
const pk = (name, type, description) => col(name, type, { isPrimary: true, description });
const fk = (name, type, table, column, description) => col(name, type, { references: { table, column }, description });

export function buildTemporalCoreDataset() {
  // Re-seed on every build so resets produce byte-identical filler rows.
  rand = mulberry32(20450917);
  return [
    {
      name: 'suspects',
      order: 1,
      description: 'Persons of interest flagged by CHRONOS after the incident. One row per suspect, linked to the employees table.',
      columns: [
        pk('suspect_id', 'TEXT', 'Suspect identifier (SUS-xx).'),
        fk('employee_id', 'TEXT', 'employees', 'employee_id', 'Employee record for this suspect.'),
        col('name', 'TEXT', { description: 'Full name.' }),
        col('role', 'TEXT', { description: 'Job title.' }),
        col('department', 'TEXT'),
        col('access_level', 'INTEGER', { description: 'Clearance level 1–5.' }),
        fk('last_known_location', 'TEXT', 'locations', 'location_id', 'Where the suspect was last seen after the incident.'),
        col('alibi', 'TEXT', { description: 'Statement given to security.' }),
        col('flagged_reason', 'TEXT', { description: 'Why CHRONOS flagged this person.' }),
        col('risk_score', 'INTEGER', { description: 'Preliminary risk score 0–100 (not evidence).' }),
      ],
      rows: suspects,
    },
    {
      name: 'employees',
      order: 2,
      description: 'Every person with a NovaTech badge, including contractors.',
      columns: [
        pk('employee_id', 'TEXT', 'Employee identifier (E-xxxx, contractors C-xxxx).'),
        col('full_name', 'TEXT'),
        col('role', 'TEXT'),
        col('department', 'TEXT'),
        col('access_level', 'INTEGER', { description: 'Clearance level 1–5.' }),
        fk('project_code', 'TEXT', 'projects', 'project_code', 'Primary project assignment.'),
        col('badge_id', 'TEXT', { description: 'Physical badge printed on the access card.' }),
        fk('manager_id', 'TEXT', 'employees', 'employee_id', 'Reporting line.'),
        col('hired_on', 'DATE'),
        col('status', 'TEXT', { description: 'ACTIVE or CONTRACTOR.' }),
      ],
      rows: employees,
    },
    {
      name: 'access_logs',
      order: 3,
      description: 'Badge reader events for every secured door on 17 September 2045.',
      columns: [
        pk('log_id', 'TEXT', 'Access log identifier (AL-xxxx).'),
        fk('employee_id', 'TEXT', 'employees', 'employee_id'),
        fk('location_id', 'TEXT', 'locations', 'location_id', 'Door that was used.'),
        col('timestamp', 'DATETIME', { description: 'YYYY-MM-DD HH:MM:SS' }),
        col('direction', 'TEXT', { description: 'ENTRY or EXIT.' }),
        col('result', 'TEXT', { description: 'GRANTED or DENIED.' }),
        col('badge_id', 'TEXT'),
        col('method', 'TEXT', { description: 'BADGE, ESCORT or OVERRIDE.' }),
      ],
      rows: buildAccessLogs(),
    },
    {
      name: 'cctv_logs',
      order: 4,
      description: 'Periodic health records from every camera. A repeating frame_hash means the feed is not live.',
      columns: [
        pk('record_id', 'TEXT', 'CCTV record identifier (CC-xxxx).'),
        col('camera_id', 'TEXT', { description: 'Camera identifier, e.g. CAM-S3-07.' }),
        fk('location_id', 'TEXT', 'locations', 'location_id'),
        col('timestamp', 'DATETIME'),
        col('status', 'TEXT', { description: 'ACTIVE, LOOPED or OFFLINE.' }),
        col('frame_hash', 'TEXT', { description: 'Hash of the current frame.' }),
        fk('operator_id', 'TEXT', 'employees', 'employee_id', 'Operator who touched the camera, if any.'),
        col('note', 'TEXT'),
      ],
      rows: buildCctvLogs(),
    },
    {
      name: 'communications',
      order: 5,
      description: 'Internal mail, chat and relay messages recovered from the Chronos network.',
      columns: [
        pk('message_id', 'TEXT', 'Message identifier (CM-xxxx).'),
        fk('sender_id', 'TEXT', 'employees', 'employee_id'),
        col('recipient_id', 'TEXT', { description: 'Employee id, or an external address.' }),
        col('channel', 'TEXT', { description: 'INTERNAL_MAIL, CHAT, EXTERNAL_MAIL or ENCRYPTED_RELAY.' }),
        col('timestamp', 'DATETIME'),
        col('subject', 'TEXT'),
        col('content', 'TEXT'),
        col('flagged', 'INTEGER', { description: '1 if flagged by CHRONOS.' }),
      ],
      rows: buildCommunications(),
    },
    {
      name: 'projects',
      order: 6,
      description: 'Research programmes run by the institute.',
      columns: [
        pk('project_code', 'TEXT', 'Project code (PRJ-xx-nn).'),
        col('name', 'TEXT'),
        fk('lead_id', 'TEXT', 'employees', 'employee_id', 'Project lead.'),
        col('classification', 'TEXT'),
        col('budget', 'INTEGER', { description: 'Credits.' }),
        col('status', 'TEXT'),
        col('started_on', 'DATE'),
        col('description', 'TEXT'),
      ],
      rows: projects,
    },
    {
      name: 'transactions',
      order: 7,
      description: 'Bank movements on staff accounts, obtained under warrant.',
      columns: [
        pk('txn_id', 'TEXT', 'Transaction identifier (TX-xxxx).'),
        fk('account_holder_id', 'TEXT', 'employees', 'employee_id', 'Staff member whose account moved.'),
        col('counterparty', 'TEXT', { description: 'Who sent or received the money.' }),
        col('amount', 'INTEGER', { description: 'Credits.' }),
        col('currency', 'TEXT'),
        col('direction', 'TEXT', { description: 'IN (received) or OUT (paid).' }),
        col('timestamp', 'DATETIME'),
        col('reference', 'TEXT'),
        col('flagged', 'INTEGER', { description: '1 if flagged by the auditor.' }),
      ],
      rows: buildTransactions(),
    },
    {
      name: 'locations',
      order: 8,
      description: 'Every secured area of the NovaTech Research Institute.',
      columns: [
        pk('location_id', 'TEXT', 'Location code, e.g. TEMPORAL_CORE.'),
        col('name', 'TEXT'),
        col('zone', 'TEXT'),
        col('floor', 'INTEGER', { description: 'Negative numbers are sublevels.' }),
        col('security_level', 'INTEGER', { description: 'Clearance required 1–5.' }),
        col('camera_id', 'TEXT', { description: 'Camera covering this area.' }),
        col('description', 'TEXT'),
      ],
      rows: locations,
    },
    {
      name: 'devices',
      order: 9,
      description: 'Registered devices: workstations, phones, tablets, sensors and controllers.',
      columns: [
        pk('device_id', 'TEXT', 'Device identifier (DEV-xxxx).'),
        col('device_type', 'TEXT'),
        fk('owner_id', 'TEXT', 'employees', 'employee_id', 'Registered owner, if personal.'),
        fk('assigned_location', 'TEXT', 'locations', 'location_id'),
        col('mac_address', 'TEXT'),
        col('last_seen_at', 'DATETIME'),
        fk('last_seen_location', 'TEXT', 'locations', 'location_id'),
        col('status', 'TEXT'),
        col('label', 'TEXT'),
      ],
      rows: devices,
    },
    {
      name: 'security_events',
      order: 10,
      description: 'Alerts raised by CHRONOS on the day of the incident.',
      columns: [
        pk('event_id', 'TEXT', 'Event identifier (SE-xxxx).'),
        col('timestamp', 'DATETIME'),
        col('event_type', 'TEXT'),
        col('severity', 'TEXT', { description: 'INFO, LOW, MEDIUM, HIGH or CRITICAL.' }),
        fk('location_id', 'TEXT', 'locations', 'location_id'),
        fk('device_id', 'TEXT', 'devices', 'device_id'),
        fk('employee_id', 'TEXT', 'employees', 'employee_id'),
        col('description', 'TEXT'),
        col('resolved', 'INTEGER'),
      ],
      rows: securityEvents,
    },
  ];
}

export const INCIDENT = {
  date: INCIDENT_DATE,
  criticalAt: ts(INCIDENT_DATE, 9, 58, 3),
};

export const TEMPORAL_CORE_DATASET = Object.freeze({
  slug: 'temporal-core',
  name: 'Temporal Core — experimental dataset',
  version: 1,
  get tables() {
    return buildTemporalCoreDataset().map((t) => ({ ...t, primaryKey: t.columns.filter((c) => c.isPrimary).map((c) => c.name), indexes: [] }));
  },
});
