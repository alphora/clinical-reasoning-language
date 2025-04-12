// Base AST Node interface
export interface ASTNode {
  type: string;
  location: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
}

// File represents the root of the AST
export interface File extends ASTNode {
  type: 'File';
  statements: Statement[];
}

// Statement types
export type Statement = Decision | Action | CaseFeature;

// Decision node
export interface Decision extends ASTNode {
  type: 'Decision';
  name: string;
  whenClauses: WhenClause[];
  useClauses: UseClause[];
}

// When clause
export interface WhenClause extends ASTNode {
  type: 'WhenClause';
  condition: string;
  actions: DoClause[];
  nestedWhenClauses: WhenClause[];
  qualifier?: 'any' | 'all';
}

// Do clause
export interface DoClause extends ASTNode {
  type: 'DoClause';
  action: string;
}

// Use clause
export interface UseClause extends ASTNode {
  type: 'UseClause';
  decisionName: string;
}

// Action node
export interface Action extends ASTNode {
  type: 'Action';
  name: string;
  fhirType?: string;
}

// CaseFeature node
export interface CaseFeature extends ASTNode {
  type: 'CaseFeature';
  name: string;
  code?: string;
  fhirType?: string;
  url?: string;
  valueType?: string;
}
