import { isDeepStrictEqual } from 'node:util';

// Canonical kit sections, as published by CRL's authoring-kit/navigation.ts.
const sections = ['introduction', 'schemaVersion', 'summary', 'forceModel',
  'conceptLayerModel', 'rules', 'typeAllowlist', 'referenceArtifacts',
  'verificationLegend', 'examples', 'verifyLoop', 'judgeLens', 'feedbackUrl',
  'boundary', 'dispositionModel'];
const collections = { rules: ['rule', 'id'], examples: ['example', 'id'], referenceArtifacts: ['artifact', 'name'] };
const next = 'Retrieve a member ID for full guidance and prerequisites, or view: full for the entire kit.';
const fail = message => { throw new Error(message); };
const text = value => typeof value === 'string' && value.trim().length > 0;
const own = (o, key) => Object.prototype.hasOwnProperty.call(o, key);

function uniqueMap(items, label, key = 'id') {
  if (!Array.isArray(items) || !items.length) fail(`${label}: missing or empty collection`);
  const result = new Map();
  for (const item of items) {
    if (!item || !text(item[key])) fail(`${label}: missing ${key}`);
    if (result.has(item[key])) fail(`${label}: duplicate ${item[key]}`);
    result.set(item[key], item);
  }
  return result;
}

// Navigation contains metadata only. Never use it as a content fallback.
export function resolveKitEntry(overview, full, id) {
  const metadata = overview.index.find(entry => entry.id === id);
  if (!metadata) fail(`unknown kit entry: ${id}`);
  const colon = id.indexOf(':');
  const kind = id.slice(0, colon), key = id.slice(colon + 1);
  let entry;
  if (kind === 'section' && sections.includes(key) && own(full, key)) {
    entry = full[key];
    if (own(collections, key)) {
      const [prefix, field] = collections[key];
      if (!Array.isArray(entry)) fail(`missing collection body: ${id}`);
      const memberIds = entry.map(member => `${prefix}:${member[field]}`);
      if (!isDeepStrictEqual(metadata.members, memberIds)) fail(`collection members differ: ${id}`);
      entry = { memberIds, next };
    }
  } else if (kind === 'rule') {
    entry = full.rules?.find(rule => rule.id === key);
    if (!text(entry?.rule)) fail(`missing rule body: ${id}`);
  } else if (kind === 'example') {
    entry = full.examples?.find(example => example.id === key);
    if (!text(entry?.snippet)) fail(`missing example body: ${id}`);
  } else if (kind === 'artifact') {
    entry = full.referenceArtifacts?.find(artifact => artifact.name === key);
    if (!text(entry?.source)) fail(`missing artifact body: ${id}`);
  }
  if (entry === undefined || entry === null) fail(`missing kit body: ${id}`);
  return { id, requires: metadata.requires, entry };
}

export function verifyKitCache(overview, full, hash) {
  if (!/^[a-f0-9]{64}$/.test(hash)) fail('invalid kit hash');
  if (overview.fullContentHash !== hash || full.fullContentHash !== hash || full.contentHash !== hash)
    fail(`overview/full/requested kit hash mismatch: requested=${hash}, overview=${overview.fullContentHash}, full=${full.fullContentHash}, content=${full.contentHash}`);
  if (!text(full.schemaVersion) || overview.schemaVersion !== full.schemaVersion)
    fail('overview/full kit schema mismatch');
  if (full.complete !== true || full.view !== 'full') fail('cache is not a complete full export');
  if (overview.complete !== false || overview.view !== 'overview') fail('cache overview has wrong view/completeness');
  const index = uniqueMap(overview.index, 'overview index');
  const navigation = uniqueMap(full.navigation, 'full navigation');
  if (!isDeepStrictEqual(overview.index, full.navigation)) {
    const differing = [...new Set([...index.keys(), ...navigation.keys()])]
      .filter(id => !isDeepStrictEqual(index.get(id), navigation.get(id)));
    fail(`overview index differs from full navigation: ${differing.join(', ') || 'entry order differs'}`);
  }
  const canonicalIds = sections.map(key => `section:${key}`);
  for (const [key, [prefix, field]] of Object.entries(collections)) {
    const members = uniqueMap(full[key], key, field);
    canonicalIds.push(...[...members.keys()].map(id => `${prefix}:${id}`));
  }
  if (index.size !== canonicalIds.length || canonicalIds.some(id => !navigation.has(id))) {
    const missing = canonicalIds.filter(id => !navigation.has(id));
    const extra = [...index.keys()].filter(id => !canonicalIds.includes(id));
    fail(`index does not cover the canonical payload inventory: missing=[${missing.join(', ')}], unsupported=[${extra.join(', ')}]`);
  }
  for (const metadata of index.values()) {
    resolveKitEntry(overview, full, metadata.id);
    if (!Array.isArray(metadata.requires) || metadata.requires.some(id => !index.has(id)))
      fail(`missing prerequisite: ${metadata.id}`);
    // Cycles are valid. Verify each target exists; do not demand a DAG.
  }
  return { hash, schemaVersion: full.schemaVersion, entries: index.size, verified: true,
    verification: 'structure-and-declared-identity', contentHashRecomputed: false };
}
