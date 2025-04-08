Remember, we are only working on a custom lexer. (because the generated one doesn't handle python like whitespace control) and we use the grammar and example, not the existing lexer (custom or generated) as our source of truth.
we have implemented unit tests that we should leverage as test driven development to build the new custom lexer.  However, keep in mind that a test could be wrong too.  if there's a discrpancy between the tests and new code we've written for the lexer stop and notify me.  for existing lexer code, the new lexer tests take precedence. use the requirements as the guiding directive, but prefer the lexer doing what the grammar defines over anything else.

run every test run in a new terminal

First, fix the FHIR type validation issues since they're causing actual errors rather than just mismatches
Then address the indentation issues since they're also causing errors
Finally, fix the token count mismatches and type mismatches

"should tokenize keywords"
focus on on only this.  Don't do anything else for now.
add just enough debugging to figure it out.
laser focus on getting to the root of this.
don't run all the damn tests only run this one
open tests in a new terminal every time.

let's work on whitespace.tests.ts

but after each run of whitespace.tests.ts we need to run basic-tokens.test.ts as well to ensure we haven't broken it.
