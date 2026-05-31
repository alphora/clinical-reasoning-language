"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Validator = void 0;
const actionUniquenessValidator_1 = require("./actionUniquenessValidator");
const cycleDetector_1 = require("./cycleDetector");
const nameUniquenessValidator_1 = require("./nameUniquenessValidator");
const referenceResolver_1 = require("./referenceResolver");
const unusedDeclarationsValidator_1 = require("./unusedDeclarationsValidator");
class Validator {
    constructor() {
        this.unusedDeclarationsValidator = new unusedDeclarationsValidator_1.UnusedDeclarationsValidator();
        this.nameUniquenessValidator = new nameUniquenessValidator_1.NameUniquenessValidator();
        this.actionUniquenessValidator = new actionUniquenessValidator_1.ActionUniquenessValidator();
        this.referenceResolver = new referenceResolver_1.ReferenceResolver();
        this.cycleDetector = new cycleDetector_1.CycleDetector();
    }
    validate(ast, options = {}) {
        const errors = [];
        const warnings = [];
        const nameResult = this.nameUniquenessValidator.validate(ast);
        errors.push(...nameResult);
        const refResult = this.referenceResolver.validate(ast);
        if (options.soft) {
            warnings.push(...refResult.map((e) => ({ ...e, severity: "warning" })));
        }
        else {
            errors.push(...refResult);
        }
        const cycleResult = this.cycleDetector.validate(ast);
        errors.push(...cycleResult);
        return {
            isValid: errors.length === 0,
            errors,
            warnings,
        };
    }
}
exports.Validator = Validator;
//# sourceMappingURL=validator.js.map