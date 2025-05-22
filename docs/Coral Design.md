# 🪸 Coral Design

## 🌊 Structure

### The Great Reef

The `Great Reef` is a GitHub repository that serves as the shared registry of reusable clinical knowledge artifacts.

- The repository is organized into root-level directories called **colonies**.
- Each colony represents a publishable unit of related clinical shells.
- Colonies follow SNOMED hierarchy conventions.
- The repository is a multi-package **npm workspace**.

#### Great Reef Example (colony and shell detail excluded for clarity)

|-- finding/
|   |-- body-measurement/         # Colony
|
|-- observable/
|   |-- clinical-history/
|   |   |-- general-characteristic/
|   |   |   |-- body-measure/     # Another Colony
|
|-- package.json                  # Root workspace declaration
|-- README.md                     # Project overview

---

### 🧬 Colonies

**Colonies** are the unit of shareable clinical knowledge.

- Each colony consists of one or more **shells** (subdirectories).
- Each colony is a **SNOMED hierarchy node**, and its path defines its **npm package namespace**.
- Each colony is an **npm workspace**.
- Each colony is published and consumed as an **npm package**.
- Each colony includes an `index.json` — a machine-readable manifest listing all shells and their metadata for use in tooling, harvesting, and AI discovery.

#### Colony Layout Example: `finding.body-measurement`

|-- finding/
|   |-- body-measurement/      # Colony
|   |   |-- obesity/           # Shell
|   |   |-- index.json         # Colony Manifest
|   |   |-- package.json       # Colony npm Package
|   |   |-- README.md

#### Colony Layout Example: `observable.clinical-history.general-characteristic.body-measure`

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

---

### 🐚 Shells

**Shells** are the unit of executable clinical knowledge.  
Each shell is a self-contained folder containing all artifacts required to represent, transform, and reason over a clinical concept.

Each shell contains:

- `shell.yaml` — the manifest describing the shell
- `embedding.json` — the AI semantic representation
- `*.crl` — Clinical Reasoning Language file
- `*.json` — FHIR artifact (e.g. `PlanDefinition`, `ActivityDefinition`)
- `*.cql` — Clinical Quality Language representation

> Each shell folder contains all files necessary to define and execute a unit of clinical knowledge, including `shell.yaml`, `embedding.json`, and its associated `.crl`, `.cql`, and `.json` files.

#### Shell Example: Obesity

|-- finding/
|   |-- body-measurement/
|   |   |-- obesity/            # Shell
|   |   |   |-- shell.yaml      # Shell Manifest
|   |   |   |-- embedding.json  # Embedding Info
|   |   |   |-- obesity.crl
|   |   |   |-- obesity.json    # FHIR
|   |   |   |-- obesity.cql

#### Shell Examples: BMI, Height, and Weight

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

---

### 🧩 Combined Layout Example

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
|-- package.json  # Workspace root
|-- README.md

## Process

The user can start with migrate or harvest and then iterate between them as they develop their local project.  It's usually most advantageous to start with harvest, but that's up to the user.

### Harvest Process

- the user suspects concepts they need for their local project have already been authored and published to the Great Reef
- the user locates and concept packages of interest in the Great Reef and runs harvest to install the packages locally
- the user then references the FHIR and CQL in those concept packages in their local project

### Migrate Process

- the user develops .crl and uses the crl api to transform to initial fhir/cql
- the user then refines the fhir/cql until it's ready for release/publication
- once the fhir/cql is ready to release/publish, the user runs migrate

## Migrate

- 