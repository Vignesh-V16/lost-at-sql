import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guardSql } from '../src/utils/sqlGuard.js';

test('accepts plain SELECT statements', () => {
  const r = guardSql("SELECT emp_id, access_time FROM access_logs WHERE door_name = 'Research Lab';");
  assert.equal(r.ok, true);
  assert.equal(r.sql.endsWith(';'), false);
});

test('accepts WITH (CTE) queries, joins, window functions, CASE, REPLACE() and comments', () => {
  assert.equal(guardSql('-- who was there\nWITH x AS (SELECT * FROM employees) SELECT COUNT(*) FROM x /* done */').ok, true);
  assert.equal(guardSql('SELECT e.name, a.door_name FROM employees e JOIN access_logs a ON a.emp_id = e.emp_id GROUP BY e.name').ok, true);
  assert.equal(guardSql('SELECT emp_id, ROW_NUMBER() OVER (ORDER BY access_time) rn FROM access_logs').ok, true);
  assert.equal(guardSql("SELECT CASE WHEN amount > 100000 THEN 'big' ELSE 'small' END FROM transactions").ok, true);
  assert.equal(guardSql("SELECT REPLACE(name, ' ', '_') FROM employees").ok, true);
});

test('rejects writes, DDL, transactions and multi-statements', () => {
  for (const sql of [
    'DELETE FROM employees',
    'DROP TABLE employees',
    'SELECT 1; DROP TABLE employees',
    "SELECT * FROM employees WHERE name = 'x'; UPDATE employees SET name='y'",
    'PRAGMA table_info(employees)',
    'SELECT * FROM sqlite_master',
    'SELECT * FROM sqlite_schema',
    "INSERT INTO employees VALUES ('E999','x','y','z','w')",
    "REPLACE INTO employees VALUES ('E999','x','y','z','w')",
    "WITH x AS (SELECT 1) INSERT INTO employees SELECT * FROM x",
    'ATTACH DATABASE \'/etc/passwd\' AS p',
    'BEGIN; SELECT 1',
    'CREATE TABLE t (a)',
    'ALTER TABLE employees ADD COLUMN x',
    'SELECT load_extension(\'x\')',
    'VACUUM',
  ]) {
    assert.equal(guardSql(sql).ok, false, sql);
  }
});

test('keywords inside string literals and comments are fine', () => {
  assert.equal(guardSql("SELECT * FROM access_logs WHERE remarks LIKE '%delete the drop%'").ok, true);
  assert.equal(guardSql('SELECT 1 /* DROP TABLE x */').ok, true);
  assert.equal(guardSql("SELECT 'it''s; fine'").ok, true);
});

test('empty and oversized statements are rejected; max length is configurable', () => {
  assert.equal(guardSql('').ok, false);
  assert.equal(guardSql('   ').ok, false);
  assert.equal(guardSql(`SELECT '${'x'.repeat(5000)}'`).ok, false);
  assert.equal(guardSql(`SELECT '${'x'.repeat(300)}'`, { maxLength: 200 }).ok, false);
  assert.equal(guardSql(`SELECT '${'x'.repeat(300)}'`, { maxLength: 400 }).ok, true);
});
