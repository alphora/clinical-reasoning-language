When you run SUSHI on a set of `.fsh` files, it parses them into structured JS/TS classes like:

- `InstanceDefinition` (for `Instance:` blocks)
- `StructureDefinition`, `Profile`, `Extension`, etc.
- `Exportable*` model classes

These objects have well-formed properties like `.name`, `.instanceOf`, `.rules[]`, and so on.  
You can walk them just like an AST or IR.

---

💡 **How to Use SUSHI Programmatically**  
You can write a Node.js/TypeScript script that uses SUSHI as a library:


```ts

import { loadConfiguration } from 'fsh-sushi';
import { FSHTank } from 'fsh-sushi';
import { FHIRDefinitions, loadFromPath } from 'fsh-sushi';

async function parseFSHFiles(pathToFSH: string) {
  const defs = new FHIRDefinitions();
  await loadFromPath(defs, './path-to-fhir-definitions');

  const config = loadConfiguration(pathToFSH);
  const tank = new FSHTank(config, pathToFSH);
  const docs = tank.getAllDocuments();

  const allInstances = tank.getAllInstances(); // ← Here!
  for (const inst of allInstances) {
    console.log(inst.name, inst.instanceOf, inst.rules);
  }
}
```

🔁 **So Instead of a Visitor...**  
You iterate over `tank.getAllInstances()` and inspect:

- `instance.name`
- `instance.instanceOf`
- `instance.rules` (which contain paths like `action.title`, `action.definitionCanonical`, etc.)

You can write helper functions that behave like visitor pattern methods, but operate over SUSHI's model.
