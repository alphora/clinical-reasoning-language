"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Validator = void 0;
const actionUniquenessValidator_1 = require("./actionUniquenessValidator");
const nameUniquenessValidator_1 = require("./nameUniquenessValidator");
const unusedDeclarationsValidator_1 = require("./unusedDeclarationsValidator");
class Validator {
    constructor() {
        this.unusedDeclarationsValidator = new unusedDeclarationsValidator_1.UnusedDeclarationsValidator();
        this.nameUniquenessValidator = new nameUniquenessValidator_1.NameUniquenessValidator();
        this.actionUniquenessValidator = new actionUniquenessValidator_1.ActionUniquenessValidator();
    }
    validate(ast) {
        const errors = [];
        const warnings = [];
        const nameResult = this.nameUniquenessValidator.validate(ast);
        errors.push(...nameResult);
        return {
            isValid: errors.length === 0,
            errors,
            warnings,
        };
    }
}
exports.Validator = Validator;
//# sourceMappingURL=validator.js.map