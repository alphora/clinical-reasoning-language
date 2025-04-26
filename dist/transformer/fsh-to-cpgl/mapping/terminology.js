"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapTerminology = mapTerminology;
const fshPathFunctions_1 = require("../utils/fshPathFunctions");
function mapTerminology(identifiers) {
    return identifiers
        .map((id) => `terminology ${(0, fshPathFunctions_1.toIdentifier)(id)} system \`http://sdh.com/cqis/kalm\` code ${(0, fshPathFunctions_1.toCode)(id)}.`)
        .join("\n");
}
//# sourceMappingURL=terminology.js.map