import { CharStreams, CommonTokenStream } from 'antlr4ts';

import type { File } from '../ast/types';
import { ASTVisitor } from '../ast/visitor';
import { CPGLParser as GeneratedParser } from '../grammar/generated/CPGLParser';
import { CPGLLexer } from '../lexer';
import { ASTValidator, ValidationError } from '../validation/validator';
import { ProxyErrorListener } from '../ProxyErrorListener';

export class CPGLParser {
  private readonly lexer: CPGLLexer;
  private readonly parser: GeneratedParser;
  private readonly visitor: ASTVisitor;
  private readonly validator: ASTValidator;
  private readonly errorListener: ProxyErrorListener;

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
    this.errorListener = new ProxyErrorListener();

    // Remove the default error listener and add our custom one
    this.parser.removeErrorListeners();
    this.parser.addErrorListener(this.errorListener);
  }

  public parse(): File {
    try {
      // Parse the input starting from the file rule
      const tree = this.parser.file();
      // Check for any parsing errors
      if (this.errorListener.hasErrors()) {
        const errors = this.errorListener.getErrors();
        throw new Error(`Parsing errors:\n${errors.join('\n')}`);
      }
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
