export interface CRLError {
  type: "LexicalError" | "ParserError" | "Exception" | "Validation";
  // For `type: "Validation"`: a stable discriminator from `ValidationErrorKind`
  // identifying which validator pass fired. Consumers that want to filter or
  // specialize on the diagnostic kind should switch on this instead of
  // parsing `message`.
  kind?: string;
  line?: number;
  column?: number;
  message: string;
  details?: unknown;
}

export type CRLErrorResult = string | CRLError;
