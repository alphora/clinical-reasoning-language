# 🪸 Coral Design

## 🌊 Structure

### The Great Reef

The `Great Reef` is a GitHub repository that serves as the shared registry of reusable clinical knowledge artifacts.

- The repository is organized into root-level directories called **`colonies`**.
- Each `colony` represents a publishable unit of related clinical knowledge called `shells`.
- Colonies follow SNOMED hierarchy conventions.
- The repository is a multi-package **npm workspace**.

#### The Great Reef Example (`colony` and `shell` detail excluded for clarity)

```bash
|-- finding/
|   |-- body-measurement/         # Colony
|
|-- observable/
|   |-- clinical-history/
|   |   |-- general-characteristic/
|   |   |   |-- body-measure/     # Another Colony
|
|-- package.json                  # Root npm workspace declaration
|-- README.md                     # Project overview
```

---

### 🧬 Colonies

**`Colonies`** are the unit of shareable clinical knowledge.

- Each `colony` consists of one or more **`shells`** (subdirectories).
- Each `colony` is a **SNOMED hierarchy node**, and its path defines its **npm package namespace**.
- Each `colony` is an **npm workspace**.
- Each `colony` is published and consumed as an **npm package**.
- Each `colony` includes an `index.json` — a machine-readable manifest listing all `shells` and their metadata for use in tooling, `harvesting`, and AI discovery.

#### Colony Layout Example: `finding.body-measurement`

```bash
|-- finding/
|   |-- body-measurement/      # Colony
|   |   |-- obesity/           # Shell
|   |   |-- index.json         # Colony manifest
|   |   |-- package.json       # Colony npm Package
|   |   |-- README.md          # Colony purpose and use
```

#### Colony Layout Example: `observable.clinical-history.general-characteristic.body-measure`

```bash
|-- observable/
|   |-- clinical-history/
|   |   |-- general-characteristic/
|   |   |   |-- body-measure/  # Another Colony
|   |   |   |   |-- bmi/       # Shell
|   |   |   |   |-- height/    # Shell
|   |   |   |   |-- weight/    # Shell
|   |   |   |   |-- index.json
|   |   |   |   |-- package.json
|   |   |   |   |-- README.md
```

---

### 🐚 Shells

**`Shells`** are the unit of executable clinical knowledge.  
Each `shell` is a self-contained folder containing all artifacts required to represent, transform, and reason over a clinical `concept`.

Each `shell` contains:

- `shell.yaml` — the manifest describing the `shell`
- `embedding.json` — the AI semantic representation
- `*.crl` — Clinical Reasoning Language file
- `*.json` — FHIR artifact (e.g. `PlanDefinition`, `ActivityDefinition`)
- `*.cql` — Clinical Quality Language representation

> Each `shell` folder contains all files necessary to define and execute a unit of clinical knowledge, including `shell.yaml`, `embedding.json`, and its associated `.crl`, `.cql`, and `.json` files.

#### Shell Example: Obesity

```bash
|-- finding/
|   |-- body-measurement/
|   |   |-- obesity/            # Shell
|   |   |   |-- shell.yaml      # Shell manifest
|   |   |   |-- embedding.json  # Embedding info
|   |   |   |-- obesity.crl
|   |   |   |-- obesity.json    # FHIR
|   |   |   |-- obesity.cql
```

#### Shell Examples: BMI, Height, and Weight

```bash
|-- observable/
|   |-- clinical-history/
|   |   |-- general-characteristic/
|   |   |   |-- body-measure/
|   |   |   |   |-- bmi/                # Shell
|   |   |   |   |   |-- shell.yaml
|   |   |   |   |   |-- embedding.json
|   |   |   |   |   |-- bmi.crl
|   |   |   |   |   |-- bmi.json
|   |   |   |   |   |-- bmi.cql
|   |   |   |   |-- height/             # Shell
|   |   |   |   |   |-- shell.yaml
|   |   |   |   |   |-- embedding.json
|   |   |   |   |   |-- height.crl
|   |   |   |   |   |-- height.json
|   |   |   |   |   |-- height.cql
|   |   |   |   |-- weight/             # Shell
|   |   |   |   |   |-- shell.yaml
|   |   |   |   |   |-- embedding.json
|   |   |   |   |   |-- weight.crl
|   |   |   |   |   |-- weight.json
|   |   |   |   |   |-- weight.cql
```

---

### 🧩 Combined Layout Example

```bash
|-- finding/
|   |-- body-measurement/
|   |   |-- obesity/
|   |   |   |-- shell.yaml
|   |   |   |-- embedding.json
|   |   |   |-- obesity.crl
|   |   |   |-- obesity.json
|   |   |   |-- obesity.cql
|   |   |-- index.json
|   |   |-- package.json
|   |   |-- README.md
|
|-- observable/
|   |-- clinical-history/
|   |   |-- general-characteristic/
|   |   |   |-- body-measure/
|   |   |   |   |-- bmi/
|   |   |   |   |   |-- shell.yaml
|   |   |   |   |   |-- embedding.json
|   |   |   |   |   |-- bmi.crl
|   |   |   |   |   |-- bmi.json
|   |   |   |   |   |-- bmi.cql
|   |   |   |   |-- height/
|   |   |   |   |   |-- shell.yaml
|   |   |   |   |   |-- embedding.json
|   |   |   |   |   |-- height.crl
|   |   |   |   |   |-- height.json
|   |   |   |   |   |-- height.cql
|   |   |   |   |-- weight/
|   |   |   |   |   |-- shell.yaml
|   |   |   |   |   |-- embedding.json
|   |   |   |   |   |-- weight.crl
|   |   |   |   |   |-- weight.json
|   |   |   |   |   |-- weight.cql
|   |   |   |   |-- index.json
|   |   |   |   |-- package.json
|   |   |   |   |-- README.md
|
|-- package.json
|-- README.md
```

---

## 🔁 Processes

Users — whether human, AI agent, or process — can begin with either `harvest` or `migrate`, and often alternate between the two as they develop their local reef.

It is typically advantageous to begin with `harvest`, but the entry point is flexible.

---

### 🌾 Harvest Process

- The user identifies a clinical concept needed in their local project and believes relevant `shells` may already exist in the **Great Reef**.
- The user locates and selects relevant `shells` from the **Great Reef**, then runs `harvest` to install them into their local reef.
- The user references the Coral concepts, FHIR, and CQL from the harvested `shells` within their local project.

---

### 🚚 Migrate Process

- The user authors a new `shell` by defining Coral concepts and using the CRL API to generate initial FHIR and CQL artifacts.
- The user iteratively refines these artifacts until they are ready for publication.
- The user runs `migrate`, which performs the following steps:
  1. Queries a `hierarchy-service` to determine the SNOMED-aligned path for each concept.
  2. Clones the **Great Reef** repository locally.
  3. Creates a new Git branch for the contribution.
  4. Copies the `shell’s` `.crl`, `.json`, and `.cql` files into the appropriate path.
  5. Generates `shell.yaml` and `embedding.json` for each `shell`.
  6. Commits and pushes the changes, and opens a pull request against the `Great Reef`.
- A human maintainer reviews and merges the PR.
- Once merged, the **CI/CD pipeline**:
  - Regenerates the `index.json` for the affected `colony`.
  - Appends an entry to `meta/merged-shells.json` with metadata for the newly published `shell`.
  - Builds and publishes a new version of the updated `colony` as an npm package.
- On future runs of `migrate`, the CLI:
  - Checks `meta/merged-shells.json` for any previously contributed `shells` that have since been merged and published.
  - Installs the corresponding npm package.
  - Automatically removes the user’s local copy of the `shell` from their project to avoid duplication or drift.

---

### 🔔 Merge Notification File: `meta/merged-shells.json`

This file provides a durable, GitHub-independent way for CLI tools to detect which contributed `shells` have been accepted into the `Great Reef`.

#### Example format

// this isn't sufficient.  It needs the local id of the shell <library>.<define>
// and you need to call the cli periodically to see if it's merged
// don't really need everything else  just the local and GR ids
// the cli response would be to return "not yet" if it hasn't
// or get the id package and replace locally if it had
```json
[
  {
    "id": "finding.bodyMeasurement.bmi",
    "colony": "finding/body-measurement",
    "merged_at": "2025-05-21T14:22:00Z",
    "package": "@coral/finding.body-measurement",
    "version": "0.1.1"
  },
  {
    "id": "observable.clinicalHistory.generalCharacteristic.bodyMeasure.weight",
    "colony": "observable/clinical-history/general-characteristic/body-measure",
    "merged_at": "2025-05-22T09:08:00Z",
    "package": "@coral/observable.clinical-history.general-characteristic.body-measure",
    "version": "0.3.0"
  }
]
```

The CLI checks this file to determine whether it should remove a local `shell` and replace it with the corresponding published package version.

---
