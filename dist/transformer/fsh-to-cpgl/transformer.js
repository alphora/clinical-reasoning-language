"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.transformFSHToCPGL = transformFSHToCPGL;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const FSHTank_1 = require("fsh-sushi/dist/import/FSHTank");
const importConfiguration_1 = require("fsh-sushi/dist/import/importConfiguration");
const importText_1 = require("fsh-sushi/dist/import/importText");
const RawFSH_1 = require("fsh-sushi/dist/import/RawFSH");
const concept_1 = require("./mapping/concept");
const planDefinition_1 = require("./mapping/planDefinition");
const terminology_1 = require("./mapping/terminology");
const activityDeduplication_1 = require("./utils/activityDeduplication");
const fshPathFunctions_1 = require("./utils/fshPathFunctions");
function transformFSHToCPGL(fshProjectDir) {
    const configPath = path.join(fshProjectDir, "sushi-config.yaml");
    if (!fs.existsSync(configPath)) {
        throw new Error(`sushi-config.yaml not found in ${fshProjectDir}`);
    }
    const configYaml = fs.readFileSync(configPath, "utf8");
    const config = (0, importConfiguration_1.importConfiguration)(configYaml, configPath);
    const fshDir = path.join(fshProjectDir, "input", "fsh");
    function getAllFSHFiles(dir) {
        let results = [];
        if (!fs.existsSync(dir))
            return results;
        const list = fs.readdirSync(dir);
        for (const file of list) {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            if (stat && stat.isDirectory()) {
                results = results.concat(getAllFSHFiles(filePath));
            }
            else if (filePath.endsWith(".fsh")) {
                results.push(filePath);
            }
        }
        return results;
    }
    const fshFiles = getAllFSHFiles(fshDir);
    const rawFSHes = fshFiles.map((f) => new RawFSH_1.RawFSH(fs.readFileSync(f, "utf8"), f));
    const fshDocs = (0, importText_1.importText)(rawFSHes);
    const tank = new FSHTank_1.FSHTank(fshDocs, config);
    const instances = tank.getAllInstances();
    const activityDeduplicator = new activityDeduplication_1.ActivityDeduplicator();
    const decisions = [];
    const allActivities = [];
    const allDoReferences = [];
    const allConceptIdentifiers = new Set();
    for (const inst of instances) {
        const planDefResult = (0, planDefinition_1.mapPlanDefinitionToDecision)(inst, instances);
        decisions.push(planDefResult.decision);
        for (const act of planDefResult.activities) {
            activityDeduplicator.add({ name: act.name, value: act.value, original: act.original });
            allActivities.push(act);
        }
        for (const ref of planDefResult.doReferences) {
            allDoReferences.push(ref);
        }
        if (inst.instanceOf &&
            (inst.instanceOf.includes("strategydefinition") ||
                inst.instanceOf.includes("recommendationdefinition"))) {
            for (const rule of inst.rules || []) {
                if (rule.path &&
                    rule.path.endsWith(".condition[=].expression.expression") &&
                    "value" in rule &&
                    typeof rule.value === "string" &&
                    rule.value) {
                    allConceptIdentifiers.add(rule.value);
                }
            }
        }
    }
    const activityTerminologies = [];
    for (const act of allActivities) {
        const terminology = act.terminology;
        if (terminology && typeof terminology.code === "string") {
            activityTerminologies.push(terminology);
        }
    }
    let finalOutput = "";
    for (const dec of decisions) {
        finalOutput += dec;
    }
    const dedupedMap = new Map();
    const nameValueCount = new Map();
    const idToFinalName = {};
    for (const act of allActivities) {
        const key = `${act.name}::${act.value ?? ""}`;
        let count = nameValueCount.get(act.name) || 0;
        if (!dedupedMap.has(key)) {
            count += 1;
            nameValueCount.set(act.name, count);
            const uniqueName = act.name + (count > 1 ? `_${count}` : "");
            dedupedMap.set(key, { uniqueName, activity: act });
            idToFinalName[act.id] = uniqueName;
        }
        else {
            const { uniqueName } = dedupedMap.get(key);
            idToFinalName[act.id] = uniqueName;
        }
    }
    finalOutput = finalOutput.replace(/<<ACTIVITY_REF:(activity_\d+)>>/g, (_, id) => (0, fshPathFunctions_1.toIdentifier)(idToFinalName[id]));
    for (const { uniqueName, activity } of dedupedMap.values()) {
        const activityRegex = /activity\s+"([^"]+)"/;
        const match = activity.original.match(activityRegex);
        let replaced = activity.original;
        if (match) {
            replaced = activity.original.replace(activityRegex, `activity ${(0, fshPathFunctions_1.toIdentifier)(uniqueName)}`);
        }
        else {
            console.warn(`Could not match activity identifier in: ${activity.original}`);
        }
        finalOutput += replaced;
    }
    if (allConceptIdentifiers.size > 0) {
        finalOutput += "\n" + (0, concept_1.mapConcept)(Array.from(allConceptIdentifiers));
        finalOutput += "\n" + (0, terminology_1.mapTerminology)(Array.from(allConceptIdentifiers));
    }
    if (activityTerminologies.length > 0) {
        const termMap = new Map();
        for (const term of activityTerminologies) {
            const baseId = term.identifier;
            const body = `system \`${term.system}\` code \`${term.code}\``;
            let id = baseId;
            let count = 1;
            while (termMap.has(id) && termMap.get(id).body !== body) {
                count++;
                id = `${baseId}_${count}`;
            }
            if (!termMap.has(id)) {
                termMap.set(id, { body, count });
                finalOutput += `\nterminology "${id}" ${body}.`;
            }
        }
    }
    return finalOutput;
}
//# sourceMappingURL=transformer.js.map