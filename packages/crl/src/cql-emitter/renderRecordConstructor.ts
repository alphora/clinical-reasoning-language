// #189 P1 build step 3 — render ONE record constructor as CQL text.
//
// REFACTOR:grounded (#189 P1) — re-derived from the P1 design of record
// (`tmp/DESIGN-P1-case-feature-construction.md`) and MEASURED against the CQL engine, never from the
// prototype's hand-written `CaseFeatureCommon.cql`, which is explicitly not a golden (operator).
//
// SHAPE vs TEXT. `emit/recordConstructor.ts` decides the shape (which resources can be constructed, what
// the signature is, which elements must be filled); this module turns one such signature into CQL. The
// split is what lets the shape be tested without string-matching emitted text — and it is why this module
// takes a `ConstructorSignature` and never re-queries the registry: the renderer must fill exactly the set
// that was VALIDATED, or the `authored` refusal upstream means nothing.
//
// ⚠ BOUND CODE ELEMENTS NEED A PER-ELEMENT CQL TYPE, AND IT CANNOT BE GUESSED FROM FHIR. Measured:
//   · `status: FHIR.code { value: 'final' }` on Observation is REJECTED —
//     "Expected an expression of type 'FHIR.ObservationStatus', but found an expression of type 'code'".
//   · `FHIR.RequestStatus` — the real FHIR spec binding name for `ServiceRequest.status` — is ALSO
//     REJECTED: the model info wants `FHIR.ServiceRequestStatus`.
// So the spelling is the model-info convention `FHIR.<ResourceType><Element>`, VERIFIED by execution for
// all six `kind: "code"` defaults the registry carries today (Observation.status, Procedure.status,
// ServiceRequest.status/intent, MedicationRequest.status/intent). A NEW bound-code default must be probed,
// not assumed — this convention was inferred from two points and one FHIR-derived guess was already wrong.

// ⚠ Types come from `recordConstructor`, NOT from `resourceEmitRegistry`. The registry has a
// sanctioned-importer boundary, and more importantly the renderer must be UNABLE to re-query it: it fills
// exactly the element set `resolveConstructor` validated, or the `authored` refusal upstream means nothing.
import type {
  ConstructorSignature,
  DefaultValue,
  StructuralRequiredElement,
} from "../emit/recordConstructor";

/** Escape a CQL single-quoted string literal. */
function q(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

/** `status` → `Status`. Element names in the registry are lowerCamel FHIR element names. */
function upperFirst(name: string): string {
  return name.length === 0 ? name : name[0].toUpperCase() + name.slice(1);
}

/** ⚠ The bound code type for `<resourceType>.<element>` — see the header. NOT `FHIR.code`, and NOT the
 *  FHIR spec's value-set binding name. */
export function boundCodeCqlType(resourceType: string, element: string): string {
  return `FHIR.${resourceType}${upperFirst(element)}`;
}

/**
 * Assign `valueExpr` at `path`, constructing any intermediate nesting.
 *
 * A flat path is `element: <value>`. A dotted one cannot be — CQL has no element literally named
 * `period.start` — so the wrappers are built innermost-out, capitalizing each intermediate segment to name
 * its type (`period` → `FHIR.Period`), which is the FHIR convention for a datatype-valued element.
 */
function nestedAssignment(path: string, valueExpr: string): string {
  const segments = path.split(".");
  let acc = valueExpr;
  for (let i = segments.length - 1; i > 0; i -= 1) {
    const parent = segments[i - 1];
    acc = `FHIR.${upperFirst(parent)} { ${segments[i]}: ${acc} }`;
  }
  return `${segments[0]}: ${acc}`;
}

/** A `FHIR.Coding { … }` literal. `display` is omitted when absent rather than emitted null. */
function coding(system: string, code: string, display?: string): string {
  const parts = [`system: FHIR.uri { value: ${q(system)} }`, `code: FHIR.code { value: ${q(code)} }`];
  if (display !== undefined) parts.push(`display: FHIR.string { value: ${q(display)} }`);
  return `FHIR.Coding { ${parts.join(", ")} }`;
}

/** Render one registry `DefaultValue` as a CQL expression for `resourceType.element`. */
function defaultValueCql(resourceType: string, element: string, value: DefaultValue): string {
  switch (value.kind) {
    case "code":
      return `${boundCodeCqlType(resourceType, element)} { value: ${q(value.code)} }`;
    case "coding":
      return coding(value.system, value.code, value.display);
    case "codeable-concept":
      return `FHIR.CodeableConcept { coding: { ${coding(value.system, value.code, value.display)} } }`;
    case "codeable-concept-array":
      return `{ ${value.concepts
        .map((c) => `FHIR.CodeableConcept { coding: { ${coding(c.system, c.code, c.display)} } }`)
        .join(", ")} }`;
  }
}

/** Render one required structural element as an `element: expression` pair.
 *
 *  ⚠ A `wired` element renders as the PARAMETER, not as a context expression. The constructor stays
 *  context-free and the CALLER supplies the binding — so one constructor is reusable, and the patient
 *  reference is resolved once at the call site rather than re-derived inside every constructor. */
function requiredElementCql(
  resourceType: string,
  required: StructuralRequiredElement,
  bindingParam: Record<string, string>,
): string | undefined {
  const { element, fulfillment } = required;
  switch (fulfillment.via) {
    case "default":
      return `${element}: ${defaultValueCql(resourceType, element, fulfillment.value)}`;
    case "wired": {
      const param = bindingParam[fulfillment.binding];
      // Unreachable for a resolved signature (a `wired` requirement puts its parameter in the signature),
      // but the emit boundary does not assume its own preconditions.
      return param === undefined ? undefined : `${element}: ${param}`;
    }
    case "authored":
      // `resolveConstructor` refuses these, so a resolved signature can never carry one.
      return undefined;
  }
}

/**
 * Render `sig` as a complete `define function …` block.
 *
 * The guard is the semantic heart (design D3/D0b): a null value — or, for an existence record, anything
 * but `true` — yields NO candidate. There is deliberately no `Now()` fallback and no evaluation-time
 * parameter, so an absent component can never become a candidate stamped with the current time.
 */
export function renderRecordConstructor(sig: ConstructorSignature): string {
  const params = sig.params.map((p) => `  ${p.name} ${p.cqlType}`).join(",\n");

  // `wired` bindings resolve to the parameter of the same name (D3a puts one in the signature per binding).
  const bindingParam: Record<string, string> = { "case-subject": "subject" };
  // Whether or not the resource's FHIR cardinality makes `subject` structurally required, the case-feature
  // contract does — so it is written even when the registry's required-element list does not mention it.
  const subjectIsStructural = sig.requiredElements.some((r) => r.element === "subject");

  const body: string[] = [];

  // `meta.profile` — the case-feature SD canonical (design D6a). `System.String` → `FHIR.canonical`.
  body.push(`meta: FHIR.Meta { profile: { FHIR.canonical { value: profile } } }`);

  for (const required of sig.requiredElements) {
    const rendered = requiredElementCql(sig.resourceType, required, bindingParam);
    if (rendered !== undefined) body.push(rendered);
  }

  if (!subjectIsStructural) body.push(`subject: subject`);

  // The concept's coding, at the resource's own element — NOT a universal `.code` (design D3b).
  body.push(
    sig.codingElement.array
      ? `${sig.codingElement.element}: { code }`
      : `${sig.codingElement.element}: code`,
  );

  // The PROPAGATED recency stamp. A choice element (`effective`) and a plain one (`recordedDate`) both take
  // a `FHIR.dateTime` literal in a CQL construction; the `cast` on the registry row governs the READ side.
  //
  // ⚠ A DOTTED path (`Encounter.period.start`) is NOT a flat element name — emitting `period.start: …`
  // would declare an element literally called "period.start". CQL has no such element, so the nesting is
  // CONSTRUCTED instead, innermost-out: `period: FHIR.Period { start: FHIR.dateTime { … } }`.
  //
  // The intermediate type is derived by capitalizing the segment, which is the FHIR convention for a
  // BackboneElement/datatype-valued element (`period` → `Period`). MEASURED for Encounter — it builds,
  // reads back, and sorts on `period.start.value` (design §12). A deeper or irregular path would need the
  // model to name its types; there is exactly one dotted recency path in the registry today.
  body.push(nestedAssignment(sig.recency.sortExpr, `FHIR.dateTime { value: recorded }`));

  if (sig.valueElement !== undefined) body.push(`${sig.valueElement}: value`);

  // Evidence linkage, where the resource has an element for it (design D5). `undefined` means the
  // resource has none — the parameter is still received, because identity is content-derived from it.
  if (sig.evidenceElement !== undefined) {
    // The caller supplies fully-qualified references (`ResourceType/id`), so there is nothing to build
    // here and no runtime type dispatch — see the `evidence` parameter's note in `recordConstructor.ts`.
    body.push(`${sig.evidenceElement}: evidence`);
  }

  // ⭐⭐ #189 — THE GUARD COVERS THE RECENCY STAMP TOO, and that is not defensive tidiness: without it the
  // ENGINE THROWS. MEASURED against the cqf CQL engine (`tmp/nullprobe/nulldrop/`): a constructor called with a
  // non-null value and a NULL `recorded` dies with
  //
  //     null cannot be cast to non-null type org.opencds.cqf.cql.engine.runtime.DateTime
  //
  // because the body builds `FHIR.dateTime { value: recorded }` unconditionally. A null timestamp does not
  // degrade to a null candidate — it kills the whole evaluation, taking every other define with it.
  //
  // It is REACHABLE: a derived candidate's stamp is the NEWEST OF ITS COMPONENTS (design §5b), so a component
  // whose recency element is absent (dirty source data) propagates null into `recorded`. Evaluation time is
  // FORBIDDEN as a fallback (§5b — an invented timestamp lets a stale calculation outrank a fresh assertion),
  // so the only honest outcome is the one the value already gets: NO CANDIDATE. A candidate that cannot say
  // when it was claimed cannot be recency-ordered against the other arms, and guessing its place is exactly
  // the manufactured answer this design bans.
  //
  // ⚠ This is a guard on ABSENCE, never on a value: it drops a candidate whose stamp is unknown, and it must
  // never drop one whose stamp is merely old.
  const valueGuard =
    sig.valueMode === "value"
      ? `${sig.guardParam} is null`
      : `${sig.guardParam} is not true`;
  const guard = `if ${valueGuard} or recorded is null then`;

  return [
    `define function ${sig.functionName}(`,
    params,
    `):`,
    `  ${guard}`,
    `    null as FHIR.${sig.resourceType}`,
    `  else`,
    `    FHIR.${sig.resourceType} {`,
    body.map((line) => `      ${line}`).join(",\n"),
    `    }`,
  ].join("\n");
}
