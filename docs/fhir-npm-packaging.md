# FHIR NPM packages

`crl-package-fhir` packages existing emitted definitions according to [CRMI STU2 publishing requirements](https://hl7.org/fhir/uv/crmi/STU2/en/publishing-fhir-package.html) and the [FHIR NPM package format](https://hl7.org/fhir/packages.html). Generate the CRL definitions first; packaging does not re-emit them or publish to a registry.

```sh
crl-package-fhir --project /absolute/path/to/project
```

The MCP equivalent is `package_fhir({projectRoot: "/absolute/path/to/project"})`. The core API exports `packageFhir`. Optional `outputFile` (`--out`) selects an absolute `.tgz` destination; optional `packageId` (`--package-id`) overrides `crl.packageId`. The CLI also accepts relative paths and resolves them from the working directory.

Project metadata example (use your own identity, author and applicable license):

```json
{
  "name": "example-policy",
  "version": "1.0.0",
  "description": "Example decision support definitions",
  "author": "Example Organization",
  "crl": {
    "canonicalBase": "https://example.org/fhir",
    "packageId": "org.example.policy",
    "fhirDependencies": {
      "hl7.fhir.uv.cpg": "2.0.0",
      "hl7.fhir.uv.crmi": "2.0.0"
    }
  }
}
```

`name` remains the policy identifier used in existing canonical URLs. The separate dotted FHIR package ID must be at most 64 characters. Version and dependency versions must be exact SemVer versions. Author and description are required. An optional `license` must be one code from the [FHIR R4 SPDX binding](https://hl7.org/fhir/R4/valueset-spdx-license.html), including `not-open-source` when appropriate; npm license expressions cannot be represented in `ImplementationGuide.license` and are refused. No license is invented. Optional root `copyright` is copied to the guide.

The default output is `output/package.tgz`. It contains:

- `package/package.json`, including declared FHIR dependencies and `hl7.fhir.r4.core: 4.0.1`.
- `package/ImplementationGuide-<policy-id>.json`, with matching package ID/version and a resource inventory.
- `package/.index.json`, the version-2 resource index.
- `package/<ResourceType>-<id>.json` for each canonical definition under `src/fhir`.

Existing resource IDs, canonical URLs, versions and content are preserved. Relative Library attachments are read from within project `src`, embedded as base64 in the archive copy, and their local URLs removed. Absolute machine paths, missing files, paths escaping `src`, conflicting inline/file bytes, duplicate identities and filename collisions are errors. Inline attachments and HTTP(S) attachment URLs are retained. The source tree is unchanged. Only the selected archive is replaced, after input checks; other output files are untouched. Identical inputs produce identical archive bytes.

Declare the versions of external FHIR packages used by the definitions in `crl.fhirDependencies`. Known CPG, CRMI, SDC, CQL and HL7 terminology references are checked for a corresponding declaration. This is a bounded dependency check: the tool does not download packages, resolve the transitive dependency closure, or perform full FHIR/profile/CQL executable validation. Choose versions appropriate to the content rather than copying the example mechanically. Patient examples, MV cases and regression data are not package definitions and are refused under `src/fhir`.

The ImplementationGuide is the package's FHIR description. A separate CRMI asset-collection manifest Library is not required merely to produce an NPM package and is not generated. Packaging does not implement a server `$package` operation.
