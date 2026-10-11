#!/usr/bin/env node
// question-inventory.mjs — inventory the delivered native question surface for the source-only questionnaire reviewer.
//   node question-inventory.mjs <artifact root> <out.json> [--include-flags]
// Reads every Questionnaire under tests/results/fhir/patient/*/questionnaire/ (and any QuestionnaireResponse beside it),
// and writes: per case the questions (linkId, definition, text, type, required, answerOptions, description extension),
// plus a de-duplicated question profile list keyed by definition+text. No CRL/CEL is read. Also inventories
// flag counts only by default. --include-flags is for the lead, not source-only review.
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
const [root, out, flagMode] = process.argv.slice(2);
if (!root || !out || (flagMode && flagMode !== '--include-flags')) { console.error('usage: question-inventory.mjs <artifact root> <out.json> [--include-flags]'); process.exit(2); }
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const walk = d => { const r = []; if (!fs.existsSync(d)) return r; for (const f of fs.readdirSync(d)) { const p = path.join(d, f); r.push(...(fs.statSync(p).isDirectory() ? walk(p) : [p])); } return r; };
const files = walk(path.join(root, 'tests/results')).filter(f => f.endsWith('.json'));
const qs = files.filter(f => /questionnaire[\\/]/i.test(f) && !/questionnaireresponse/i.test(f));
const qrs = files.filter(f => /questionnaireresponse/i.test(f));
const DESC = 'http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-input-description';
function items(list, acc = [], depth = 0) { for (const it of list || []) { const desc = (it.extension || []).find(e => (e.url || '').endsWith('cpg-input-description') || e.url === DESC); acc.push({ depth, linkId: it.linkId, definition: it.definition, type: it.type, text: it.text, required: it.required, repeats: it.repeats, options: (it.answerOption || []).map(o => o.valueCoding ? `${o.valueCoding.code}|${o.valueCoding.display || ''}` : JSON.stringify(o.valueString ?? o.valueInteger ?? o)), description: desc ? (desc.valueMarkdown || desc.valueString) : undefined, hasChildren: !!(it.item && it.item.length) }); items(it.item, acc, depth + 1); } return acc; }
const cases = [];
for (const q of qs) {
  const j = JSON.parse(fs.readFileSync(q, 'utf8')); if (j.resourceType !== 'Questionnaire') continue;
  const compartment = path.basename(path.dirname(path.dirname(q)));
  const qr = qrs.find(r => path.basename(path.dirname(path.dirname(r))) === compartment);
  let answers = [];
  if (qr) { const rj = JSON.parse(fs.readFileSync(qr, 'utf8')); (function w(l) { for (const it of l || []) { if (it.answer) answers.push({ linkId: it.linkId, definition: it.definition, answer: it.answer.map(a => JSON.stringify(a)).join(';') }); w(it.item); } })(rj.item); }
  cases.push({ compartment, questionnaire: path.relative(root, q).replace(/\\/g, '/'), sha256: sha(q), url: j.url, version: j.version, items: items(j.item), questionnaireResponse: qr ? path.relative(root, qr).replace(/\\/g, '/') : null, answers });
}
const profiles = {};
for (const c of cases) for (const it of c.items) { if (it.type === 'group' || it.type === 'display') continue; const k = `${it.definition || ''}||${it.text || ''}`; const p = profiles[k] || (profiles[k] = { definition: it.definition, text: it.text, type: it.type, options: it.options, description: it.description, occurrences: 0, cases: [] }); p.occurrences++; p.cases.push(c.compartment); }
const flagsDir = path.join(root, 'src/medical-validation/flags');
const flagFiles = fs.existsSync(flagsDir) ? fs.readdirSync(flagsDir).filter(f => f.endsWith('.json')) : [];
const legacyFlagsDir = path.join(root, '.crl/flags');
const legacyFlagCount = fs.existsSync(legacyFlagsDir) ? fs.readdirSync(legacyFlagsDir).filter(f => f.endsWith('.json')).length : 0;
const flags = flagMode === '--include-flags' ? flagFiles.map(f => ({ file: f, sha256: sha(path.join(flagsDir, f)), ...(() => { try { const j = JSON.parse(fs.readFileSync(path.join(flagsDir, f), 'utf8')); const gist = typeof j.gist === 'string' && j.gist.trim(); return { id: j.id, kind: j.anchor?.scope ?? j.kind, name: j.anchor?.name ?? j.name, status: j.status, title: gist || j.title || null, titleSource: gist ? 'gist' : j.title ? 'title' : null, description: j.description ?? null }; } catch { return { parseError: true }; } })() })) : [];
const result = { root, at: new Date().toISOString(), questionnaireFiles: qs.length, responseFiles: qrs.length, cases, uniqueQuestionProfiles: Object.values(profiles), flagCount: flagFiles.length, legacyFlagCount, flagsIncluded: flagMode === '--include-flags', flags, note: flagMode === '--include-flags' ? 'Lead inventory: flag descriptions may quote the candidate; do not give this file to a source-only reviewer.' : 'Source-only native question surface; flag contents withheld. Descriptions are emitted cpg-input-description extension values when present.' };
fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ questionnaires: qs.length, responses: qrs.length, cases: cases.length, uniqueQuestions: Object.keys(profiles).length, withDescription: Object.values(profiles).filter(p => p.description).length, flags: flagFiles.length, legacyFlags: legacyFlagCount, flagsIncluded: result.flagsIncluded, ...(result.flagsIncluded && !legacyFlagCount ? { flagsMissingTitle: flags.filter(f => !f.title).length, flagsMissingDescription: flags.filter(f => !f.description).length } : {}), out }));
