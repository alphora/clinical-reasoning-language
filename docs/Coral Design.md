# Coral Design

## Structure

### The Great Reef

The `Great Reef` is a github repository.
The repository is organized as root level directories called `colonies`.

#### Great Reef Example (colony and shell detail excluded for clarity)

|-- finding/
|   |-- body-measurement/         # Colony
|
|-- observable/
|   |-- clinical-history/
|   |   |-- general-characteristic/
|   |   |   |-- body-measure/     # Another Colony
|
|-- package.json
|-- README.md

### Colonies

Colonies are the unit of shareable clinical knowledge.
Each `colony` has one or more subdirectories called `shells`.
Each `colony` is an npm Workspace within the Great Reef.
Each `colony` is a SNOMED hierarchy, representing the package namespace.
Each `colony` is published and consumed as an npm package.

#### Colony Examples

##### `finding.body-measurement` Colony (shell detail excluded for clarity)

|-- finding/
|   |-- body-measurement/      # Colony
|   |   |-- obesity/           # Shell
|   |   |-- index.json         # Colony Manifest
|   |   |-- package.json       # Colony npm Package
|   |   |-- README.md

##### `observable.clinical-history.general-characteristic.body-measure` Colony

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

### Shells

Shells are the unit of executable clinical knowledge.
A `shell` is a unit of files:

- shell.yaml (shell manifest)
- embedding.json (LLM embedding info for the shell)
- CRL file
- FHIR file
- CQL file

#### Shell Examples

##### Obesity Shell

|-- finding/
|   |-- body-measurement/
|   |   |-- obesity/            # Shell
|   |   |   |-- shell.yaml      # Shell Manifest
|   |   |   |-- embedding.json  # Embedding Info
|   |   |   |-- obesity.crl
|   |   |   |-- obesity.json    # FHIR
|   |   |   |-- obesity.cql

##### BMI, Height, and Weight Shells

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

### Full Example

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