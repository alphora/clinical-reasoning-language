"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.conceptValueTypes = exports.conceptTypes = exports.activityTypes = exports.InferredFromDefinitionType = exports.InferredFromConceptType = exports.GroupExpressionType = exports.NotExpressionType = exports.InformalOrType = exports.InformalAndType = exports.ConceptReferenceType = exports.CodedFromDefinitionType = exports.TerminologySystemCodeType = exports.TerminologyFreeTextType = exports.TerminologyValuesetType = exports.TerminologyType = exports.UseDecisionType = exports.DoActivityType = exports.ActionStatementType = exports.SingleActionType = exports.BlockBodyType = exports.WhenBlockType = exports.DecisionBodyType = exports.DecisionType = exports.FileType = void 0;
exports.FileType = {
    type: "CPGL",
};
exports.DecisionType = {
    type: "Decision",
};
exports.DecisionBodyType = {
    type: "DecisionBody",
};
exports.WhenBlockType = {
    type: "WhenBlock",
};
exports.BlockBodyType = {
    type: "BlockBody",
};
exports.SingleActionType = {
    type: "SingleAction",
};
exports.ActionStatementType = {
    type: "ActionStatement",
};
exports.DoActivityType = {
    type: "DoActivity",
};
exports.UseDecisionType = {
    type: "UseDecision",
};
exports.TerminologyType = {
    type: "Terminology",
};
exports.TerminologyValuesetType = {
    type: "TerminologyValueset",
};
exports.TerminologyFreeTextType = {
    type: "TerminologyFreeText",
};
exports.TerminologySystemCodeType = {
    type: "TerminologySystemCode",
};
exports.CodedFromDefinitionType = {
    type: "CodedFromDefinition",
};
exports.ConceptReferenceType = {
    type: "ConceptReference",
};
exports.InformalAndType = {
    type: "AndExpression",
};
exports.InformalOrType = {
    type: "OrExpression",
};
exports.NotExpressionType = {
    type: "NotExpression",
};
exports.GroupExpressionType = {
    type: "GroupExpression",
};
exports.InferredFromConceptType = {
    type: "InferredFromDefinitionConcept",
};
exports.InferredFromDefinitionType = {
    type: "InferredFromDefinition",
};
var activityTypes_1 = require("../grammar/activityTypes");
Object.defineProperty(exports, "activityTypes", { enumerable: true, get: function () { return activityTypes_1.activityTypes; } });
var conceptTypes_1 = require("../grammar/conceptTypes");
Object.defineProperty(exports, "conceptTypes", { enumerable: true, get: function () { return conceptTypes_1.conceptTypes; } });
var conceptValueTypes_1 = require("../grammar/conceptValueTypes");
Object.defineProperty(exports, "conceptValueTypes", { enumerable: true, get: function () { return conceptValueTypes_1.conceptValueTypes; } });
//# sourceMappingURL=types.js.map