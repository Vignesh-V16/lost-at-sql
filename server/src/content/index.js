/**
 * Content registry — every case and dataset the engine ships with.
 *
 * A future event ("OPERATION: RED PHANTOM") adds a folder here with its own
 * dataset + case definition and nothing else changes.
 */
import { BLACK_CIPHER_DATASET, buildBlackCipherDataset } from './blackCipher/dataset.js';
import { BLACK_CIPHER_CASE, buildBlackCipherCase } from './blackCipher/case.js';
import { TEMPORAL_CORE_DATASET } from './temporalCore/dataset.js';

export const DATASETS = Object.freeze({
  [BLACK_CIPHER_DATASET.slug]: () => buildBlackCipherDataset(),
  [TEMPORAL_CORE_DATASET.slug]: () => ({ slug: TEMPORAL_CORE_DATASET.slug, name: TEMPORAL_CORE_DATASET.name, version: 1, tables: TEMPORAL_CORE_DATASET.tables }),
});

export const CASES = Object.freeze({
  [BLACK_CIPHER_CASE.slug]: () => buildBlackCipherCase(),
});

export const DEFAULT_CASE_SLUG = BLACK_CIPHER_CASE.slug;

export function getDataset(slug = BLACK_CIPHER_DATASET.slug) {
  const factory = DATASETS[slug];
  if (!factory) throw new Error(`Unknown dataset ${slug}`);
  return factory();
}

export function getCase(slug = DEFAULT_CASE_SLUG) {
  const factory = CASES[slug];
  if (!factory) throw new Error(`Unknown case ${slug}`);
  return factory();
}
