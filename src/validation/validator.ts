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

    validate(ast: File): void {
        // Reset state
        this.decisionNames.clear();

        // Validate each statement
        for (const statement of ast.statements) {
            this.validateStatement(statement);
        }

        // Validate decision references
        this.validateDecisionReferences(ast);
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
        if (this.decisionNames.has(decision.name)) {
            throw new ValidationError(
                `Duplicate decision name: "${decision.name}"`,
                decision.location.start
            );
        }
        this.decisionNames.add(decision.name);

        // Check that decision has at least one when clause
        if (decision.whenClauses.length === 0) {
            throw new ValidationError(
                `Decision "${decision.name}" must have at least one when clause`,
                decision.location.start
            );
        }

        // Validate each when clause
        for (const whenClause of decision.whenClauses) {
            this.validateWhenClause(whenClause);
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