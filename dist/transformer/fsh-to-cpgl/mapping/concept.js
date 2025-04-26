"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapConcept = mapConcept;
const fshPathFunctions_1 = require("../utils/fshPathFunctions");
function mapConcept(identifiers) {
    return identifiers
        .map((id) => `concept ${(0, fshPathFunctions_1.toIdentifier)(id)}:
    has type Observation.
    has valuetype boolean.
    coded by ${(0, fshPathFunctions_1.toIdentifier)(id)}.
done\n`)
        .join("\n");
}
//# sourceMappingURL=concept.js.map