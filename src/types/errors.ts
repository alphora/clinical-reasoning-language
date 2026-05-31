export interface CRLError {
  type: "LexicalError" | "ParserError" | "Exception" | "Validation";
  line?: number;
  column?: number;
  message: string;
  details?: unknown;
}

export type CRLErrorResult = string | CRLError;
