/**
 * OPERATION: BLACK CIPHER — case definition.
 *
 * Every string, expected value, hint, penalty and state transition below is
 * transcribed from the `lost-in-sql.html` prototype. The engine interprets
 * this data; it contains no case-specific code. Brief texts keep the
 * prototype's inline <b>…</b> emphasis — the client renders that one tag and
 * nothing else.
 *
 * Fields marked (hidden) are never serialised to participants.
 *
 * Skills tested (event rules): each SQL file is *designed* around a named
 * construct — FILE 01 and 02 a JOIN, FILE 03 a subquery, FILE 04 and 05
 * GROUP BY + HAVING + an aggregate. The brief asks for it and `skills`
 * advertises it, but validation only ever checks the RESULT: any query that
 * returns the right rows is accepted, whichever way it is written. A correct
 * answer that took another route gets a friendly note naming the construct.
 * The story, suspects and answers are the prototype's.
 */

export const CASE_NUMBER = 'NT-2045-0917';

/** The 12 persons of interest shown on the evidence board (prototype EMPLOYEES). */
export const ENTITIES = [
  { id: 'E101', name: 'Aditya Rao', department: 'AI Research', role: 'AI Research Lead' },
  { id: 'E102', name: 'Priya Nair', department: 'AI Research', role: 'Senior Data Scientist' },
  { id: 'E103', name: 'Karthik Iyer', department: 'IT Security', role: 'Security Systems Admin' },
  { id: 'E104', name: 'Meena Suresh', department: 'Robotics', role: 'Robotics Engineer' },
  { id: 'E105', name: 'Rohan Verma', department: 'AI Research', role: 'ML Engineer' },
  { id: 'E106', name: 'Divya Menon', department: 'Human Resources', role: 'HR Manager' },
  { id: 'E107', name: 'Sanjay Gupta', department: 'Facilities', role: 'Facilities Staff' },
  { id: 'E108', name: 'Anjali Deshmukh', department: 'IT Security', role: 'Cybersecurity Analyst' },
  { id: 'E109', name: 'Vikram Chawla', department: 'AI Research', role: 'Lab Technician' },
  { id: 'E110', name: 'Neha Kapoor', department: 'Finance', role: 'Finance Officer' },
  { id: 'E111', name: 'Arjun Malhotra', department: 'IT Security', role: 'Network Engineer' },
  { id: 'E112', name: 'Ritu Sharma', department: 'AI Research', role: 'Project Manager' },
];

/** Shared feedback strings (prototype wording). */
export const MESSAGES = Object.freeze({
  MISSING_EMP_ID: 'Your SELECT needs to include the <code>emp_id</code> column so the system can verify your findings.',
  SET_MISMATCH: "✗ Not quite — that result set doesn't match the evidence. Re-check your WHERE clause and run again.",
  FILE_CLOSED_PREFIX: '✅ File closed. ',
  MISSING_EMP_ID_NAME: 'Your SELECT needs to include the <code>emp_id</code> and <code>name</code> columns so the system can verify your findings.',
});

const REQUIRE_EMP_ID = { strategy: 'REQUIRED_COLUMN', config: { columns: ['emp_id'], message: MESSAGES.MISSING_EMP_ID } };
const REQUIRE_EMP_ID_NAME = { strategy: 'REQUIRED_COLUMN', config: { columns: ['emp_id', 'name'], message: MESSAGES.MISSING_EMP_ID_NAME } };
/** The columns the checker needs, then the answer itself. How the query is written is never checked. */
const exactEmpIds = (expected, requireColumns = REQUIRE_EMP_ID) => ({
  strategy: 'ALL_OF',
  config: { validators: [requireColumns, { strategy: 'EXACT_SET', config: { column: 'emp_id', expected } }] },
});

/** Evidence catalogue (spec §27). LOADING_DOCK_EXIT is awarded with the final deduction (no passive discovery — D-9). */
export const EVIDENCE_CATALOGUE = [
  { code: 'LAB_ENTRY_WINDOW', title: 'Research Lab entries, 09:45–09:58', source: 'access_logs', summary: 'Six employees badged into the Research Lab during the theft window.', relatedEntities: ['E101', 'E102', 'E104', 'E105', 'E109', 'E112'], timestamp: '09:45–09:58' },
  { code: 'CCTV_DISABLED', title: 'Research Lab CCTV disabled', source: 'cctv_admin_logs', summary: 'Karthik Iyer disabled the Research Lab CCTV from the Server Room for exactly four minutes.', relatedEntities: ['E103'], timestamp: '09:50:12–09:54:12' },
  { code: 'BLACK_CIPHER_PROJECT_MEMBER', title: 'Project Black Cipher roster', source: 'project_members', summary: 'Only four people were cleared for Project Black Cipher.', relatedEntities: ['E101', 'E102', 'E105', 'E112'] },
  { code: 'EXTERNAL_ENCRYPTED_CONTACT', title: 'Encrypted contact with an outsider', source: 'communications', summary: "Aditya Rao contacted an external buyer, 'X_Buyer_07', minutes before the theft.", relatedEntities: ['E101'], timestamp: '09:44:00' },
  { code: 'INTERNAL_ENCRYPTED_CONTACT', title: 'Encrypted internal exchange', source: 'communications', summary: 'Aditya Rao and Karthik Iyer exchanged encrypted messages just before the CCTV blackout.', relatedEntities: ['E101', 'E103'], timestamp: '09:38:00–09:39:10' },
  { code: 'FINANCIAL_MOTIVE', title: 'Unverified offshore payment', source: 'transactions', summary: "₹52,00,000 from 'Zenith Offshore Holdings' landed in Aditya Rao's account one day before the theft.", relatedEntities: ['E101'], timestamp: '2045-09-16' },
  { code: 'LOADING_DOCK_EXIT', title: 'Exit via Loading Dock B', source: 'access_logs', summary: 'Aditya Rao left through Loading Dock B carrying a large duffel bag flagged by the scanner.', relatedEntities: ['E101'], timestamp: '09:57:45' },
];

/* --------------------------------------------------------------- files */

export const FILES = [
  {
    code: 'FILE_01',
    sequence: 1,
    label: 'FILE 01',
    title: 'The Suspects',
    difficulty: 'easy',
    tables: ['employees', 'access_logs'],
    challenges: [
      {
        code: 'FILE_01',
        sequence: 1,
        kind: 'RESULT_SET',
        stageLabel: '',
        brief: 'List every employee who entered the <b>Research Lab</b> between <b>09:45</b> and <b>09:58</b> on 17 September 2045. Return <b>emp_id</b> and <b>name</b>. Times in <b>access_logs</b> look like <code>2045-09-17 09:46:10</code>.',
        starterSql: "SELECT e.emp_id, e.name\nFROM employees e\nJOIN access_logs a ON a.emp_id = e.emp_id\nWHERE a.door_name = 'Research Lab'\n  AND a.access_type = 'entry'\n  AND a.access_time BETWEEN '2045-09-17 09:45:00' AND '2045-09-17 09:58:00';",
        submitLabel: 'Submit Findings',
        skills: ['JOIN'],
        hints: [{ code: 'H1', text: "JOIN employees e to access_logs a ON a.emp_id = e.emp_id, then filter a.door_name = 'Research Lab', a.access_type = 'entry' and a.access_time BETWEEN '2045-09-17 09:45:00' AND '2045-09-17 09:58:00'." }],
        validation: exactEmpIds(['E101', 'E102', 'E105', 'E104', 'E109', 'E112'], REQUIRE_EMP_ID_NAME), // (hidden)
        referenceSql: "SELECT e.emp_id, e.name FROM employees e JOIN access_logs a ON a.emp_id = e.emp_id WHERE a.door_name = 'Research Lab' AND a.access_type = 'entry' AND a.access_time BETWEEN '2045-09-17 09:45:00' AND '2045-09-17 09:58:00'", // (hidden)
        failureMessage: MESSAGES.SET_MISMATCH,
        successMessage: 'Six employees badged into the Research Lab during the theft window. Everyone else is cleared — for now.', // (hidden until solved)
        onSuccess: {
          evidence: ['LAB_ENTRY_WINDOW'],
          transitions: [{ scope: 'resultSet', column: 'emp_id', inSet: 'SUSPECT', notInSet: 'CLEARED', from: ['UNKNOWN'] }],
        },
      },
    ],
  },
  {
    code: 'FILE_02',
    sequence: 2,
    label: 'FILE 02',
    title: 'The Security Breach',
    difficulty: 'medium',
    tables: ['cctv_admin_logs', 'employees'],
    challenges: [
      {
        code: 'FILE_02',
        sequence: 1,
        kind: 'RESULT_SET_THEN_BOOLEAN',
        stageLabel: '',
        brief: 'The Research Lab CCTV was <b>disabled</b> for four minutes. Find who disabled it. Return <b>emp_id</b> and <b>name</b>, then answer the question below.',
        starterSql: "SELECT c.emp_id, e.name, e.designation, c.action, c.action_time\nFROM cctv_admin_logs c\nJOIN employees e ON e.emp_id = c.emp_id\nWHERE c.action = 'disabled';",
        question: 'Was this person on your Round 1 Research Lab suspect list?',
        answerOptions: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }],
        skills: ['JOIN'],
        hints: [{ code: 'H1', text: "Filter cctv_admin_logs where action = 'disabled' and JOIN employees ON employees.emp_id = cctv_admin_logs.emp_id to name the admin. Then compare that emp_id against your Round 1 result set — did that person actually badge into the Research Lab?" }],
        validation: {
          strategy: 'BOOLEAN',
          config: {
            expected: 'no',
            requiresPriorResult: exactEmpIds(['E103'], REQUIRE_EMP_ID_NAME),
            priorMessage: 'Find the administrator who <b>disabled</b> the CCTV system first, with their <b>emp_id</b> and <b>name</b>.',
          },
        }, // (hidden)
        referenceSql: "SELECT c.emp_id, e.name FROM cctv_admin_logs c JOIN employees e ON e.emp_id = c.emp_id WHERE c.action = 'disabled'", // (hidden)
        referenceAnswer: 'no', // (hidden)
        failureMessage: '✗ Compare that emp_id against your Round 1 result set again.',
        successMessage: "Karthik Iyer disabled the Research Lab CCTV from the Server Room — he never badged into the lab itself. He isn't a Round 1 suspect. He's something else: a person of interest working from the outside.",
        onSuccess: {
          evidence: ['CCTV_DISABLED'],
          transitions: [{ entity: 'E103', to: 'PERSON_OF_INTEREST' }],
        },
      },
    ],
  },
  {
    code: 'FILE_03',
    sequence: 3,
    label: 'FILE 03',
    title: 'Inside Job',
    difficulty: 'medium',
    tables: ['project_members', 'access_logs'],
    challenges: [
      {
        code: 'FILE_03',
        sequence: 1,
        kind: 'RESULT_SET',
        stageLabel: '',
        brief: 'List the members of <b>Project Black Cipher</b> who are also on your Round 1 list — the employees who entered the Research Lab during the theft window. Return <b>emp_id</b>.',
        starterSql: "SELECT emp_id\nFROM project_members\nWHERE project_name = 'Black Cipher'\n  AND emp_id IN (\n    SELECT emp_id FROM access_logs\n    WHERE door_name = 'Research Lab'\n      AND access_type = 'entry'\n      AND access_time BETWEEN '2045-09-17 09:45:00' AND '2045-09-17 09:58:00'\n  );",
        submitLabel: 'Submit Findings',
        skills: ['SUBQUERY'],
        hints: [{ code: 'H1', text: "SELECT emp_id FROM project_members WHERE project_name = 'Black Cipher' AND emp_id IN (SELECT emp_id FROM access_logs WHERE … your Round 1 filter …)." }],
        validation: exactEmpIds(['E101', 'E102', 'E105', 'E112']), // (hidden)
        referenceSql: "SELECT emp_id FROM project_members WHERE project_name = 'Black Cipher' AND emp_id IN (SELECT emp_id FROM access_logs WHERE door_name = 'Research Lab' AND access_type = 'entry' AND access_time BETWEEN '2045-09-17 09:45:00' AND '2045-09-17 09:58:00')", // (hidden)
        failureMessage: MESSAGES.SET_MISMATCH,
        successMessage: 'Four trusted insiders remain: Aditya Rao, Priya Nair, Rohan Verma, and Ritu Sharma. Everyone else — even those who entered the lab — is now cleared.',
        onSuccess: {
          evidence: ['BLACK_CIPHER_PROJECT_MEMBER'],
          transitions: [{ scope: 'resultSet', column: 'emp_id', notInSet: 'CLEARED', from: ['SUSPECT'] }],
        },
      },
    ],
  },
  {
    code: 'FILE_04',
    sequence: 4,
    label: 'FILE 04',
    title: 'The Hidden Connection',
    difficulty: 'medium',
    tables: ['communications'],
    challenges: [
      {
        code: 'FILE_04A',
        sequence: 1,
        kind: 'RESULT_SET',
        stageLabel: 'PART A',
        brief: 'In <b>communications</b>, find who sent <b>more than one</b> <b>encrypted</b> message. Return <b>emp_id</b>.',
        starterSql: "SELECT emp_id, COUNT(*) AS encrypted_messages\nFROM communications\nWHERE message_type = 'encrypted'\nGROUP BY emp_id\nHAVING COUNT(*) > 1;",
        submitLabel: 'Submit Findings',
        successLabel: 'Confirm — Move to Part B',
        skills: ['GROUP_BY', 'HAVING', 'AGGREGATE'],
        hints: [{ code: 'H1', text: "Filter communications where message_type = 'encrypted', GROUP BY emp_id and add HAVING COUNT(*) > 1. One employee wrote to an outsider and to a colleague." }],
        validation: exactEmpIds(['E101']), // (hidden)
        referenceSql: "SELECT emp_id, COUNT(*) AS encrypted_messages FROM communications WHERE message_type = 'encrypted' GROUP BY emp_id HAVING COUNT(*) > 1", // (hidden)
        failureMessage: "✗ That's not the busiest encrypted sender. Count encrypted messages per emp_id and keep only those with more than one.",
        successMessage: '',
        onSuccess: {
          evidence: ['EXTERNAL_ENCRYPTED_CONTACT'],
          transitions: [{ entity: 'E101', to: 'PRIME_SUSPECT' }],
          // D-1: the prototype's `applyEliminations(4)` branch is unreachable, so the remaining
          // suspects are NOT cleared here. Uncomment to enable the intended-but-dead rule:
          // { scope: 'all', from: ['SUSPECT'], to: 'CLEARED', except: ['E101'] }
        },
      },
      {
        code: 'FILE_04B',
        sequence: 2,
        kind: 'RESULT_SET',
        stageLabel: 'PART B',
        brief: "In <b>communications</b>, find who <b>Aditya Rao (E101)</b> exchanged an <b>internal</b> <b>encrypted</b> message with. Return <b>emp_id</b> and <b>contact_person</b>.",
        starterSql: "SELECT emp_id, contact_person, message_type, comm_time\nFROM communications\nWHERE emp_id = 'E101' AND contact_type = 'internal' AND message_type = 'encrypted';",
        submitLabel: 'Submit Accomplice',
        hints: [{ code: 'H1', text: "Look at communications where emp_id = 'E101', contact_type = 'internal', message_type = 'encrypted'. The contact_person column names his accomplice." }],
        validation: {
          strategy: 'FIELD_MATCH',
          config: { column: 'contact_person', anyRowEquals: 'E103', requireColumns: ['emp_id'], missingColumnMessage: MESSAGES.MISSING_EMP_ID },
        }, // (hidden)
        referenceSql: "SELECT emp_id, contact_person FROM communications WHERE emp_id = 'E101' AND contact_type = 'internal' AND message_type = 'encrypted'", // (hidden)
        failureMessage: "✗ Make sure your query includes the contact_person column and filters for E101's internal encrypted message.",
        successMessage: "Aditya Rao contacted an external buyer, 'X_Buyer_07', at 09:44 — and just minutes earlier, exchanged encrypted messages with Karthik Iyer, the very administrator who disabled the CCTV. A conspiracy confirmed.",
        onSuccess: {
          evidence: ['INTERNAL_ENCRYPTED_CONTACT'],
          transitions: [{ entity: 'E103', to: 'ACCOMPLICE' }],
          connections: [{ source: 'E101', target: 'E103', type: 'ENCRYPTED_INTERNAL_COMMUNICATION', label: 'Encrypted internal messages', timestamp: '09:38–09:39' }],
        },
      },
    ],
  },
  {
    code: 'FILE_05',
    sequence: 5,
    label: 'FILE 05',
    title: 'Follow the Money',
    difficulty: 'medium',
    tables: ['transactions'],
    challenges: [
      {
        code: 'FILE_05',
        sequence: 1,
        kind: 'RESULT_SET',
        stageLabel: '',
        brief: 'In <b>transactions</b>, find who received more than <b>₹10,00,000</b> in total on <b>16 Sept 2045</b>. Return <b>emp_id</b>.',
        starterSql: "SELECT emp_id, SUM(amount) AS total_received\nFROM transactions\nWHERE txn_date = '2045-09-16'\nGROUP BY emp_id\nHAVING SUM(amount) > 1000000;",
        submitLabel: 'Submit Findings',
        skills: ['GROUP_BY', 'HAVING', 'AGGREGATE'],
        hints: [{ code: 'H1', text: "Group transactions on '2045-09-16' by emp_id and SUM(amount), then HAVING SUM(amount) > 1000000. Payroll totals stay under ₹1,00,000 — one total is a huge, unverified offshore payment." }],
        validation: exactEmpIds(['E101']), // (hidden)
        referenceSql: "SELECT emp_id, SUM(amount) AS total_received FROM transactions WHERE txn_date = '2045-09-16' GROUP BY emp_id HAVING SUM(amount) > 1000000", // (hidden)
        failureMessage: MESSAGES.SET_MISMATCH,
        successMessage: "₹52,00,000 landed in Aditya Rao's account from 'Zenith Offshore Holdings' — flagged as unverified, one day before the theft. Motive confirmed.",
        onSuccess: {
          evidence: ['FINANCIAL_MOTIVE'],
          transitions: [],
        },
      },
    ],
  },
  {
    code: 'FINAL',
    sequence: 6,
    isFinal: true,
    label: 'FINAL FILE',
    title: 'Recover Black Cipher',
    difficulty: 'hard',
    tables: ['employees', 'access_logs', 'cctv_admin_logs', 'project_members', 'communications', 'transactions'],
    challenges: [
      {
        code: 'FINAL',
        sequence: 1,
        kind: 'FINAL_DEDUCTION',
        stageLabel: '',
        brief: "Name the thief, the accomplice, the exact time and the method. Use everything you have uncovered.",
        editorLabel: 'OPTIONAL — reconstruct it all in one query',
        starterSql: "SELECT DISTINCT e.emp_id, e.name\nFROM employees e\nJOIN access_logs a ON e.emp_id = a.emp_id\nJOIN project_members p ON e.emp_id = p.emp_id\nJOIN communications c ON e.emp_id = c.emp_id\nJOIN transactions t ON e.emp_id = t.emp_id\nWHERE a.door_name = 'Research Lab';",
        submitLabel: 'Close the Case',
        hints: [],
        fields: [
          { key: 'thief', label: 'Who is the thief?', type: 'entity', placeholder: 'Select employee…' },
          { key: 'accomplice', label: 'Who is the accomplice?', type: 'entity', placeholder: 'Select employee…' },
          { key: 'time', label: 'Exact time of theft (HH:MM, 24h)', type: 'text', placeholder: 'eg: hh:mm' },
          {
            key: 'method',
            label: 'How was security bypassed?',
            type: 'select',
            placeholder: 'Select…',
            options: [
              { value: 'cctv', label: 'CCTV disabled remotely by an insider accomplice' },
              { value: 'force', label: 'Lab door forced open' },
              { value: 'password', label: 'Stolen login credentials' },
              { value: 'guard', label: 'Security guard bribed' },
            ],
          },
        ],
        validation: {
          strategy: 'FINAL_DEDUCTION',
          config: {
            fields: {
              thief: { type: 'EQUALS', value: 'E101' },
              accomplice: { type: 'EQUALS', value: 'E103' },
              time: { type: 'REGEX', pattern: '^09:5[0-4]$' },
              method: { type: 'EQUALS', value: 'cctv' },
            },
            feedback: {
              thief: 'the thief',
              accomplice: 'the accomplice',
              time: 'the time (check the CCTV blackout window)',
              method: 'the method',
            },
          },
        }, // (hidden)
        referenceAnswer: { thief: 'E101', accomplice: 'E103', time: '09:52', method: 'cctv' }, // (hidden)
        failureMessage: '✗ Close, but re-check: {issues}.',
        successMessage: 'Case closed.',
        onSuccess: {
          evidence: ['LOADING_DOCK_EXIT'],
          transitions: [],
        },
      },
    ],
  },
];

/* ------------------------------------------------------------ briefing */

export const BRIEFING = {
  stamp: 'Classified',
  beginLabel: 'Begin Investigation — Round 1',
  /** `{{investigator}}` is replaced with the participant/team name. */
  text: `DATE: 17 September 2045
TIME: 09:45 AM

NovaTech Research Institute prepares to unveil Black Cipher — an AI prototype capable of predicting cyber threats and solving complex problems in seconds. Security is at its highest level. Only a handful of scientists have access.

Then, at 09:58 AM, the lab enters lockdown.

"WARNING — BLACK CIPHER PROTOTYPE NOT FOUND."

No doors forced. No windows broken. No alarms tripped before the fact.
The thief was already inside.

The only evidence left is the institute's database: access logs, CCTV admin records, project rosters, communications, and financial transactions — all intact, all waiting to be queried.

Investigator {{investigator}}, the case is yours.`,
};

export const LANDING = {
  tag: 'Cyber Crime Investigation Division',
  subtitle: "OPERATION: BLACK CIPHER — the world's most advanced AI prototype has vanished from NovaTech Research Institute. No forced entry. No broken glass. Just a database, and thirteen minutes to account for. Your SQL skills are the only lead investigators have.",
};

/* -------------------------------------------------------------- reveal */

/** Shown only after the final deduction is validated server-side. (hidden) */
export const REVEAL = {
  badge: 'Case Closed',
  title: 'Black Cipher Recovered',
  paragraphs: [
    'The thief is identified. The accomplice is arrested. The stolen Black Cipher prototype is recovered before it can be sold to an international cyber-crime syndicate.',
    "<b>Aditya Rao</b>, AI Research Lead and a trusted member of Project Black Cipher, used his own access to enter the Research Lab at 09:46 AM. Minutes earlier, he'd arranged for <b>Karthik Iyer</b>, a Security Systems Administrator, to disable the lab's CCTV feed from the Server Room for a precise four-minute window. Under cover of that blackout, Aditya removed the prototype and carried it out through the Loading Dock, a day after receiving an unexplained ₹52,00,000 payment from an offshore account. NovaTech thanks the investigation team for preventing one of the biggest technological thefts in history.",
  ],
  facts: [
    { label: 'Thief', value: 'Aditya Rao (E101)' },
    { label: 'Accomplice', value: 'Karthik Iyer (E103)' },
    { label: 'Time of theft', value: '≈ 09:50–09:54 AM' },
    { label: 'Method', value: 'CCTV disabled remotely, 4-minute blackout' },
    { label: 'Location', value: 'Removed via Loading Dock B' },
  ],
};

/* ---------------------------------------------------------------- case */

export const BLACK_CIPHER_CASE = Object.freeze({
  slug: 'black-cipher',
  name: 'LOST AT SQL — Operation: Black Cipher',
  caseNumber: CASE_NUMBER,
  description: 'A one-hour SQL investigation. Participants query the NovaTech databases to find out who took Black Cipher, how, when and where.',
  dataset: 'black-cipher',
  durationMinutes: 60,
  entities: ENTITIES,
  evidenceCatalogue: EVIDENCE_CATALOGUE,
  files: FILES,
  briefing: BRIEFING,
  landing: LANDING,
  reveal: REVEAL,
  scoringPolicy: {
    initialScore: 1000,
    wrongAnswerPenalty: 25,
    hintPenalty: 50,
    hintPenaltyScope: 'file',
    finalAttemptPenalty: 25,
    timeBonus: { enabled: false, perMinuteRemaining: 0, max: 0 },
    completionBonus: 0,
    minimumScore: 0,
  },
  leaderboardPolicy: { order: ['score:desc', 'completed:desc', 'elapsedMs:asc'], groupBy: 'participant', visibleToParticipants: true, limit: 100 },
  queryScope: 'dataset',
  finalAttemptPolicy: { maxAttempts: 0 },
});

export function buildBlackCipherCase() {
  return JSON.parse(JSON.stringify(BLACK_CIPHER_CASE));
}
