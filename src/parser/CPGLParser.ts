import { CharStreams, CommonTokenStream } from 'antlr4ts';
import { Parser } from 'antlr4ts/Parser';
import { TokenStream } from 'antlr4ts/TokenStream';

import type { File } from '../ast/types';
import { ASTVisitor } from '../ast/visitor';
import { ASTValidator, ValidationError } from '../validation/validator';
import { ProxyErrorListener } from '../ProxyErrorListener';
import { BlockContext } from '../grammar/generated/CPGLParser';
import { WhenClauseContext } from '../grammar/generated/CPGLParser';
import { CPGLLexer } from '../lexer/CPGLLexer';
import { CPGLParser as GeneratedParser } from '../grammar/generated/CPGLParser';

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
    // Create lexer
    this.lexer = new CPGLLexer(charStream);
    // Create token stream
    const tokenStream = new CommonTokenStream(this.lexer);
    // Create parser
    this.parser = new GeneratedParser(tokenStream);
    // Create visitor and validator
    this.visitor = new ASTVisitor();
    this.validator = new ASTValidator();
    // Create error listener
    this.errorListener = new ProxyErrorListener();
    // Add error listener to parser
    this.parser.removeErrorListeners();
    this.parser.addErrorListener(this.errorListener);
  }

  public parse(): File {
    try {
      // Parse the input
      const tree = this.parser.file();
      // Check for any parsing errors
      if (this.errorListener.hasErrors()) {
        const errors = this.errorListener.getErrors();
        throw new Error(`Parsing errors:\n${errors.join('\n')}`);
      }
      // Enhance the parse tree with additional properties
      this.enhanceParseTree(tree);
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

  private enhanceParseTree(tree: any): void {
    if (tree instanceof BlockContext) {
      this.enhanceBlockContext(tree);
    }
    // Recursively enhance all children
    for (let i = 0; i < tree.childCount; i++) {
      const child = tree.getChild(i);
      if (child) {
        this.enhanceParseTree(child);
      }
    }
  }

  public getErrors(): ValidationError[] {
    return this.errorListener.getErrors().map(error => new ValidationError(error, { line: 0, column: 0 }));
  }

  // Add missing properties to BlockContext
  private enhanceBlockContext(ctx: BlockContext): BlockContext {
    (ctx as any).qualifier = () => {
      const qualifierToken = ctx.getToken(GeneratedParser.ANY, 0) || ctx.getToken(GeneratedParser.ALL, 0);
      return qualifierToken ? qualifierToken.text : null;
    };
    (ctx as any).whenClause = () => {
      const whenClause = ctx.getChild(0);
      return whenClause instanceof WhenClauseContext ? whenClause : null;
    };
    return ctx;
  }
}
