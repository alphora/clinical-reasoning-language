"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NameUniquenessValidator = void 0;
class NameUniquenessValidator {
    validate(ast) {
        const errors = [];
        const decisionNames = new Set();
        const conceptNames = new Set();
        const activityNames = new Set();
        const terminologyNames = new Set();
        for (const statement of ast.statements) {
            switch (statement.type) {
                case "Decision":
                    if (!statement.name?.trim()) {
                        errors.push({
                            message: "Decision name cannot be empty",
                            location: statement.location,
                            severity: "error",
                        });
                    }
                    else if (decisionNames.has(statement.name)) {
                        errors.push({
                            message: `Duplicate decision name: ${statement.name}`,
                            location: statement.location,
                            severity: "error",
                        });
                    }
                    decisionNames.add(statement.name);
                    break;
                case "Concept":
                    if (!statement.name?.trim()) {
                        errors.push({
                            message: "Concept name cannot be empty",
                            location: statement.location,
                            severity: "error",
                        });
                    }
                    else if (conceptNames.has(statement.name)) {
                        errors.push({
                            message: `Duplicate concept name: ${statement.name}`,
                            location: statement.location,
                            severity: "error",
                        });
                    }
                    conceptNames.add(statement.name);
                    break;
                case "Activity":
                    if (!statement.name?.trim()) {
                        errors.push({
                            message: "Activity name cannot be empty",
                            location: statement.location,
                            severity: "error",
                        });
                    }
                    else if (activityNames.has(statement.name)) {
                        errors.push({
                            message: `Duplicate activity name: ${statement.name}`,
                            location: statement.location,
                            severity: "error",
                        });
                    }
                    activityNames.add(statement.name);
                    break;
                case "Terminology":
                    if (!statement.name?.trim()) {
                        errors.push({
                            message: "Terminology name cannot be empty",
                            location: statement.location,
                            severity: "error",
                        });
                    }
                    else if (terminologyNames.has(statement.name)) {
                        errors.push({
                            message: `Duplicate terminology name: ${statement.name}`,
                            location: statement.location,
                            severity: "error",
                        });
                    }
                    terminologyNames.add(statement.name);
                    break;
            }
        }
        return errors;
    }
}
exports.NameUniquenessValidator = NameUniquenessValidator;
//# sourceMappingURL=nameUniquenessValidator.js.map