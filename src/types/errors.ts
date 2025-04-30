export interface CRLError {
  type: "LexicalError" | "ParserError" | "Exception";
  line?: number;
  column?: number;
  message: string;
  details?: unknown;
}

export type CRLErrorResult = string | CRLError;