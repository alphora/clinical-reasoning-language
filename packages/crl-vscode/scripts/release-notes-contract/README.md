# Spaces Release Notes provider contract

These JSON Schemas are copied byte-for-byte from Spaces' supplied contract candidate at
[alphora/mv-spaces-medical-policy 51222a74752d6700da271fea3055c7ddfa901f90](https://github.com/alphora/mv-spaces-medical-policy/tree/51222a74752d6700da271fea3055c7ddfa901f90/launcher).
Spaces owns this installed-package contract. They are build inputs, never fetched at runtime.

- provider.schema.json SHA256 ead05f45f65e4932807e21c75e6450e7673dc01ec317af5642419783b1f4227c
- catalog.schema.json SHA256 475cbe863dc86ebbee16e27dec085499f50ceab1d3a400bd77753c99c3429f48
- upstream CONTRACT.md SHA256 0bff99381b1dd0624d9b18857b3b9e4c941696eecf888198c526c8575131b530

Ordering, package-version identity, stable-base bounds, regular referenced files, safe names
without `..`, signatures, PNG dimensions and distinct-media byte limits additionally follow
CONTRACT.md. The producer's maintained-source/publication rules remain stricter where documented.
Spaces' separate launcher/validate and actual Codespaces consumer acceptance are additional owner
receipts; local schema validation alone does not establish either one.
