import { File, Decision, WhenClause, Statement } from '../ast/types';

export class ValidationError extends Error {
    constructor(
        message: string,
        public readonly location: {
            line: number;
            column: number;
        }
    ) {
        super(message);
        this.name = 'ValidationError';
    }
}

export class ASTValidator {
    private decisionNames: Set<string> = new Set();
    private decisionGraph: Map<string, Set<string>> = new Map();
    private maxDecisionDepth = 10; // Maximum allowed depth for decision nesting

    validate(ast: File): void {
        // Reset state
        this.decisionNames.clear();
        this.decisionGraph.clear();

        // First pass: collect all decision names and build dependency graph
        this.collectDecisionInfo(ast);

        // Validate each statement
        for (const statement of ast.statements) {
            this.validateStatement(statement);
        }

        // Validate decision references and check for cycles
        this.validateDecisionReferences(ast);
        this.detectCycles(ast);
    }

    private collectDecisionInfo(ast: File): void {
        for (const statement of ast.statements) {
            if (statement.type === 'Decision') {
                // Add to decision names set
                this.decisionNames.add(statement.name);
                
                // Initialize dependency graph entry
                const dependencies = new Set<string>();
                for (const useClause of statement.useClauses) {
                    dependencies.add(useClause.decisionName);
                }
                this.decisionGraph.set(statement.name, dependencies);
            }
        }
    }

    private validateStatement(statement: Statement): void {
        switch (statement.type) {
            case 'Decision':
                this.validateDecision(statement);
                break;
            case 'Action':
                this.validateAction(statement);
                break;
            case 'CaseFeature':
                this.validateCaseFeature(statement);
                break;
        }
    }

    private validateDecision(decision: Decision): void {
        // Check decision name format
        if (!this.isValidName(decision.name)) {
            throw new ValidationError(
                `Invalid decision name: "${decision.name}". Names must start with a letter and contain only letters, numbers, and underscores.`,
                decision.location.start
            );
        }

        // Check for duplicate decision names
        const duplicateCount = [...this.decisionGraph.keys()].filter(name => name === decision.name).length;
        if (duplicateCount > 1) {
            throw new ValidationError(
                `Duplicate decision name: "${decision.name}"`,
                decision.location.start
            );
        }

        // Check that decision has at least one when clause
        if (decision.whenClauses.length === 0) {
            throw new ValidationError(
                `Decision "${decision.name}" must have at least one when clause`,
                decision.location.start
            );
        }

        // Check for mutually exclusive conditions
        this.validateConditions(decision);

        // Validate each when clause
        for (const whenClause of decision.whenClauses) {
            this.validateWhenClause(whenClause);
        }

        // Check for duplicate actions within the same decision
        this.validateUniqueActions(decision);
    }

    private validateConditions(decision: Decision): void {
        const conditions = new Set<string>();
        for (const whenClause of decision.whenClauses) {
            const normalizedCondition = whenClause.condition.toLowerCase().trim();
            if (conditions.has(normalizedCondition)) {
                throw new ValidationError(
                    `Duplicate condition in decision "${decision.name}": "${whenClause.condition}"`,
                    whenClause.location.start
                );
            }
            conditions.add(normalizedCondition);

            // Check for mutually exclusive conditions
            if (conditions.has(`not ${normalizedCondition}`) || 
                (normalizedCondition.startsWith('not ') && 
                conditions.has(normalizedCondition.substring(4)))) {
                throw new ValidationError(
                    `Mutually exclusive conditions found in decision "${decision.name}": "${whenClause.condition}"`,
                    whenClause.location.start
                );
            }
        }
    }

    private validateUniqueActions(decision: Decision): void {
        const actions = new Set<string>();
        for (const whenClause of decision.whenClauses) {
            for (const action of whenClause.actions) {
                const normalizedAction = action.action.toLowerCase().trim();
                if (actions.has(normalizedAction)) {
                    throw new ValidationError(
                        `Duplicate action in decision "${decision.name}": "${action.action}"`,
                        action.location.start
                    );
                }
                actions.add(normalizedAction);
            }
        }
    }

    private validateWhenClause(whenClause: WhenClause): void {
        // Check that condition is not empty
        if (!whenClause.condition.trim()) {
            throw new ValidationError(
                'When clause condition cannot be empty',
                whenClause.location.start
            );
        }

        // Check condition format
        if (!this.isValidCondition(whenClause.condition)) {
            throw new ValidationError(
                `Invalid condition format: "${whenClause.condition}". Conditions must be in a valid format.`,
                whenClause.location.start
            );
        }

        // Check that when clause has at least one action
        if (whenClause.actions.length === 0) {
            throw new ValidationError(
                'When clause must have at least one action',
                whenClause.location.start
            );
        }

        // Validate each action
        for (const action of whenClause.actions) {
            if (!action.action.trim()) {
                throw new ValidationError(
                    'Action cannot be empty',
                    action.location.start
                );
            }
        }
    }

    private detectCycles(ast: File): void {
        const visited = new Set<string>();
        const recursionStack = new Set<string>();

        const detectCyclesDFS = (decisionName: string, depth: number = 0): void => {
            // Check for maximum depth
            if (depth > this.maxDecisionDepth) {
                throw new ValidationError(
                    `Decision tree exceeds maximum depth of ${this.maxDecisionDepth}`,
                    this.findDecisionLocation(ast, decisionName)
                );
            }

            // Check for cycles
            if (recursionStack.has(decisionName)) {
                throw new ValidationError(
                    `Cyclic reference detected involving decision "${decisionName}"`,
                    this.findDecisionLocation(ast, decisionName)
                );
            }

            if (visited.has(decisionName)) {
                return;
            }

            visited.add(decisionName);
            recursionStack.add(decisionName);

            const dependencies = this.decisionGraph.get(decisionName) || new Set();
            for (const dep of dependencies) {
                detectCyclesDFS(dep, depth + 1);
            }

            recursionStack.delete(decisionName);
        };

        // Start DFS from each decision that hasn't been visited
        for (const decisionName of this.decisionNames) {
            if (!visited.has(decisionName)) {
                detectCyclesDFS(decisionName);
            }
        }
    }

    private findDecisionLocation(ast: File, decisionName: string) {
        for (const statement of ast.statements) {
            if (statement.type === 'Decision' && statement.name === decisionName) {
                return statement.location.start;
            }
        }
        return { line: 0, column: 0 }; // Fallback
    }

    private isValidCondition(condition: string): boolean {
        // Add condition format validation rules
        // For now, just check it's not too long and doesn't contain invalid characters
        const maxConditionLength = 100;
        const invalidChars = /[<>{}[\]\\]/;
        return condition.length <= maxConditionLength && !invalidChars.test(condition);
    }

    private validateAction(action: Statement & { type: 'Action' }): void {
        // Check action name format
        if (!this.isValidName(action.name)) {
            throw new ValidationError(
                `Invalid action name: "${action.name}". Names must start with a letter and contain only letters, numbers, and underscores.`,
                action.location.start
            );
        }

        // If FHIR type is specified, validate it
        if (action.fhirType && !this.isValidFHIRType(action.fhirType)) {
            throw new ValidationError(
                `Invalid FHIR type: "${action.fhirType}"`,
                action.location.start
            );
        }
    }

    private validateCaseFeature(caseFeature: Statement & { type: 'CaseFeature' }): void {
        // Check case feature name format
        if (!this.isValidName(caseFeature.name)) {
            throw new ValidationError(
                `Invalid case feature name: "${caseFeature.name}". Names must start with a letter and contain only letters, numbers, and underscores.`,
                caseFeature.location.start
            );
        }

        // If FHIR type is specified, validate it
        if (caseFeature.fhirType && !this.isValidFHIRType(caseFeature.fhirType)) {
            throw new ValidationError(
                `Invalid FHIR type: "${caseFeature.fhirType}"`,
                caseFeature.location.start
            );
        }

        // Validate URL if present
        if (caseFeature.url && !this.isValidUrl(caseFeature.url)) {
            throw new ValidationError(
                `Invalid URL: "${caseFeature.url}"`,
                caseFeature.location.start
            );
        }
    }

    private validateDecisionReferences(ast: File): void {
        // Check that all referenced decisions exist
        for (const statement of ast.statements) {
            if (statement.type === 'Decision') {
                for (const useClause of statement.useClauses) {
                    if (!this.decisionNames.has(useClause.decisionName)) {
                        throw new ValidationError(
                            `Referenced decision "${useClause.decisionName}" does not exist`,
                            useClause.location.start
                        );
                    }
                }
            }
        }
    }

    private isValidName(name: string): boolean {
        return /^[a-zA-Z][a-zA-Z0-9_]*$/.test(name);
    }

    private isValidFHIRType(type: string): boolean {
        // Add common FHIR resource types
        const validTypes = new Set([
            'Patient',
            'Observation',
            'Condition',
            'Procedure',
            'MedicationRequest',
            'ServiceRequest',
            'CarePlan',
            'Goal'
        ]);
        return validTypes.has(type);
    }

    private isValidUrl(url: string): boolean {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }
} 