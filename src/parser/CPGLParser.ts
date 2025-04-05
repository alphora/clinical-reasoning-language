import { CharStreams, CommonTokenStream } from 'antlr4ts';

import type { File } from '../ast/types';
import { ASTVisitor } from '../ast/visitor';
import { CPGLParser as GeneratedParser } from '../grammar/generated/CPGLParser';
import { CPGLLexer } from '../lexer';
import { ASTValidator, ValidationError } from '../validation/validator';

export class CPGLParser {
  private readonly lexer: CPGLLexer;
  private readonly parser: GeneratedParser;
  private readonly visitor: ASTVisitor;
  private readonly validator: ASTValidator;

  constructor(input: string) {
    // Trim leading and trailing whitespace and newlines
    const trimmedInput = input.trim();
    // Convert input string to CharStream
    const charStream = CharStreams.fromString(trimmedInput);
    // Use our custom lexer
    this.lexer = new CPGLLexer(charStream);
    const tokens = new CommonTokenStream(this.lexer);
    this.parser = new GeneratedParser(tokens);
    this.visitor = new ASTVisitor();
    this.validator = new ASTValidator();

    // Remove the default error listener to prevent error messages
    this.parser.removeErrorListeners();
  }

  public parse(): File {
    try {
      // Parse the input starting from the file rule
      const tree = this.parser.file();
      // Convert parse tree to AST
      const ast = this.visitor.visit(tree) as File;
      // Validate the AST
      this.validator.validate(ast);
      return ast;
    } catch (e) {
      if (e instanceof ValidationError) {
        console.error(
          `Validation error at line ${e.location.line}, column ${e.location.column}: ${e.message}`,
        );
      } else {
        console.error('Parsing error:', e);
      }
      throw e;
    }
  }
}
