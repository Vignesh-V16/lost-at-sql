/**
 * OPERATION: BLACK CIPHER — investigation dataset.
 *
 * Transcribed verbatim from the `lost-in-sql.html` prototype (SCHEMA_SQL +
 * SEED_SQL). Six tables, 50 rows. Timestamps are TEXT in
 * `YYYY-MM-DD HH:MM:SS` so that BETWEEN / comparison on strings behaves as
 * it did in the prototype. Do not "improve" the data: every challenge's
 * expected result set is derived from exactly these rows.
 *
 * Table shape (consumed by the Dataset model and the SQL sandbox):
 *   { name, description, columns: [{ name, type, isPrimary?, references? }], primaryKey: [..], indexes: [[col,..]], rows: [{...}] }
 */

const T = (name, description, columns, rows, extra = {}) => ({
  name,
  description,
  columns,
  rows,
  primaryKey: extra.primaryKey || columns.filter((c) => c.isPrimary).map((c) => c.name),
  indexes: extra.indexes || [],
});

const employees = T(
  'employees',
  'NovaTech Research Institute staff directory.',
  [
    { name: 'emp_id', type: 'TEXT', isPrimary: true },
    { name: 'name', type: 'TEXT' },
    { name: 'department', type: 'TEXT' },
    { name: 'designation', type: 'TEXT' },
    { name: 'email', type: 'TEXT' },
  ],
  [
    ['E101', 'Aditya Rao', 'AI Research', 'AI Research Lead', 'aditya.rao@novatech.com'],
    ['E102', 'Priya Nair', 'AI Research', 'Senior Data Scientist', 'priya.nair@novatech.com'],
    ['E103', 'Karthik Iyer', 'IT Security', 'Security Systems Admin', 'karthik.iyer@novatech.com'],
    ['E104', 'Meena Suresh', 'Robotics', 'Robotics Engineer', 'meena.suresh@novatech.com'],
    ['E105', 'Rohan Verma', 'AI Research', 'ML Engineer', 'rohan.verma@novatech.com'],
    ['E106', 'Divya Menon', 'Human Resources', 'HR Manager', 'divya.menon@novatech.com'],
    ['E107', 'Sanjay Gupta', 'Facilities', 'Facilities Staff', 'sanjay.gupta@novatech.com'],
    ['E108', 'Anjali Deshmukh', 'IT Security', 'Cybersecurity Analyst', 'anjali.deshmukh@novatech.com'],
    ['E109', 'Vikram Chawla', 'AI Research', 'Lab Technician', 'vikram.chawla@novatech.com'],
    ['E110', 'Neha Kapoor', 'Finance', 'Finance Officer', 'neha.kapoor@novatech.com'],
    ['E111', 'Arjun Malhotra', 'IT Security', 'Network Engineer', 'arjun.malhotra@novatech.com'],
    ['E112', 'Ritu Sharma', 'AI Research', 'Project Manager', 'ritu.sharma@novatech.com'],
  ].map(([emp_id, name, department, designation, email]) => ({ emp_id, name, department, designation, email })),
);

const access_logs = T(
  'access_logs',
  'Badge reader events for every secured door on 17 September 2045.',
  [
    { name: 'log_id', type: 'INTEGER', isPrimary: true },
    { name: 'emp_id', type: 'TEXT', references: { table: 'employees', column: 'emp_id' } },
    { name: 'door_name', type: 'TEXT' },
    { name: 'access_time', type: 'TEXT' },
    { name: 'access_type', type: 'TEXT' },
    { name: 'remarks', type: 'TEXT' },
  ],
  [
    [1, 'E101', 'Research Lab', '2045-09-17 09:46:10', 'entry', 'Badge scan normal'],
    [2, 'E102', 'Research Lab', '2045-09-17 09:47:05', 'entry', 'Badge scan normal'],
    [3, 'E105', 'Research Lab', '2045-09-17 09:49:40', 'entry', 'Badge scan normal'],
    [4, 'E104', 'Research Lab', '2045-09-17 09:52:15', 'entry', 'Retrieving equipment'],
    [5, 'E109', 'Research Lab', '2045-09-17 09:50:00', 'entry', 'Routine maintenance'],
    [6, 'E112', 'Research Lab', '2045-09-17 09:55:20', 'entry', 'Badge scan normal'],
    [7, 'E106', 'Research Lab', '2045-09-17 09:20:00', 'entry', 'Routine HR walkthrough'],
    [8, 'E110', 'Main Lobby', '2045-09-17 09:50:00', 'entry', 'Badge scan normal'],
    [9, 'E108', 'Server Room', '2045-09-17 09:48:00', 'entry', 'Badge scan normal'],
    [10, 'E103', 'Server Room', '2045-09-17 09:49:00', 'entry', 'Badge scan normal'],
    [11, 'E101', 'Loading Dock B', '2045-09-17 09:57:45', 'exit', 'Carrying large duffel bag - flagged by scanner'],
    [12, 'E102', 'Research Lab', '2045-09-17 09:58:30', 'exit', 'Badge scan normal'],
    [13, 'E105', 'Research Lab', '2045-09-17 09:59:10', 'exit', 'Badge scan normal'],
    [14, 'E112', 'Research Lab', '2045-09-17 10:01:00', 'exit', 'Badge scan normal'],
    [15, 'E103', 'Server Room', '2045-09-17 09:56:00', 'exit', 'Badge scan normal'],
  ].map(([log_id, emp_id, door_name, access_time, access_type, remarks]) => ({ log_id, emp_id, door_name, access_time, access_type, remarks })),
  { indexes: [['door_name', 'access_time'], ['emp_id']] },
);

const cctv_admin_logs = T(
  'cctv_admin_logs',
  'Administrative actions on the CCTV systems.',
  [
    { name: 'log_id', type: 'INTEGER', isPrimary: true },
    { name: 'emp_id', type: 'TEXT', references: { table: 'employees', column: 'emp_id' } },
    { name: 'system_name', type: 'TEXT' },
    { name: 'action', type: 'TEXT' },
    { name: 'action_time', type: 'TEXT' },
  ],
  [
    [1, 'E103', 'Research Lab CCTV', 'disabled', '2045-09-17 09:50:12'],
    [2, 'E103', 'Research Lab CCTV', 'enabled', '2045-09-17 09:54:12'],
    [3, 'E108', 'Server Room CCTV', 'enabled', '2045-09-17 08:00:00'],
  ].map(([log_id, emp_id, system_name, action, action_time]) => ({ log_id, emp_id, system_name, action, action_time })),
);

const project_members = T(
  'project_members',
  'Project rosters. Only Project Black Cipher staff knew the prototype existed.',
  [
    { name: 'emp_id', type: 'TEXT', references: { table: 'employees', column: 'emp_id' } },
    { name: 'project_name', type: 'TEXT' },
  ],
  [
    ['E101', 'Black Cipher'],
    ['E102', 'Black Cipher'],
    ['E105', 'Black Cipher'],
    ['E112', 'Black Cipher'],
    ['E104', 'RoboArm Gen4'],
    ['E109', 'RoboArm Gen4'],
    ['E108', 'NovaShield Security'],
    ['E111', 'NovaShield Security'],
  ].map(([emp_id, project_name]) => ({ emp_id, project_name })),
  { primaryKey: ['emp_id', 'project_name'], indexes: [['project_name']] },
);

const communications = T(
  'communications',
  'Recovered message metadata (deleted logs surfaced from backup).',
  [
    { name: 'comm_id', type: 'INTEGER', isPrimary: true },
    { name: 'emp_id', type: 'TEXT', references: { table: 'employees', column: 'emp_id' } },
    { name: 'contact_person', type: 'TEXT' },
    { name: 'contact_type', type: 'TEXT' },
    { name: 'message_type', type: 'TEXT' },
    { name: 'comm_time', type: 'TEXT' },
  ],
  [
    [1, 'E101', 'X_Buyer_07', 'external', 'encrypted', '2045-09-17 09:44:00'],
    [2, 'E101', 'E103', 'internal', 'encrypted', '2045-09-17 09:38:00'],
    [3, 'E103', 'E101', 'internal', 'encrypted', '2045-09-17 09:39:10'],
    [4, 'E102', 'E105', 'internal', 'normal', '2045-09-17 08:15:00'],
    [5, 'E112', 'E106', 'internal', 'normal', '2045-09-17 07:50:00'],
    [6, 'E105', 'E109', 'internal', 'normal', '2045-09-17 09:10:00'],
  ].map(([comm_id, emp_id, contact_person, contact_type, message_type, comm_time]) => ({ comm_id, emp_id, contact_person, contact_type, message_type, comm_time })),
  { indexes: [['emp_id'], ['contact_type', 'message_type']] },
);

const transactions = T(
  'transactions',
  'Payroll and inbound payments to employee accounts.',
  [
    { name: 'txn_id', type: 'INTEGER', isPrimary: true },
    { name: 'emp_id', type: 'TEXT', references: { table: 'employees', column: 'emp_id' } },
    { name: 'amount', type: 'REAL' },
    { name: 'txn_date', type: 'TEXT' },
    { name: 'source_account', type: 'TEXT' },
    { name: 'remarks', type: 'TEXT' },
  ],
  [
    [1, 'E101', 5200000, '2045-09-16', 'Zenith Offshore Holdings', 'Unverified - pending compliance review'],
    [2, 'E102', 85000, '2045-09-16', 'NovaTech Payroll', 'Monthly salary'],
    [3, 'E105', 82000, '2045-09-16', 'NovaTech Payroll', 'Monthly salary'],
    [4, 'E112', 95000, '2045-09-16', 'NovaTech Payroll', 'Monthly salary'],
    [5, 'E103', 78000, '2045-09-16', 'NovaTech Payroll', 'Monthly salary'],
    [6, 'E101', 90000, '2045-09-01', 'NovaTech Payroll', 'Monthly salary'],
  ].map(([txn_id, emp_id, amount, txn_date, source_account, remarks]) => ({ txn_id, emp_id, amount, txn_date, source_account, remarks })),
  { indexes: [['txn_date']] },
);

export const BLACK_CIPHER_DATASET = Object.freeze({
  slug: 'black-cipher',
  name: 'NovaTech Research Institute — recovered records',
  version: 1,
  tables: [employees, access_logs, cctv_admin_logs, project_members, communications, transactions].map((t, i) => ({ ...t, order: i + 1 })),
});

export function buildBlackCipherDataset() {
  // Deep copy so callers can never mutate the canonical definition.
  return JSON.parse(JSON.stringify(BLACK_CIPHER_DATASET));
}
