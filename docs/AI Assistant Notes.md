# Rob's AI Assistant Notes

## Notes

### Duplication

The AI Assistant is really good at writing code.  Maybe too good.  One of the biggest issues is it duplicates stuff.  If you are seeing behavior where changes are being made but not fixing things it's probably working in one piece of code and running another.

#### Dup Strategies

- Commit often
- Check git diffs often
- Have AI check for dups regurarly (and refactor)
- Add comments to places where dups keep popping up

### Repeating Mistakes

The AI Assistant gets into a mindset.  This is great for some things and not so great for others.  Once it's in a mindset it is very difficult to get it to stop thinking certain ways.  This applies especially to mistakes.  

#### RM Strategies

- Commit often
- Check git diffs often
- Start a new session if it gets into a bad mindset
- Add comments to places where its repeating unwanted behavior
- Ask another AI
- Don't be afraid to HARD reset

### Stuck

The AI Assistant gets into a mindset.  This is great for some things and not so great for others.  Once it's in a mindset it is very difficult to get it to stop thinking certain ways.  This applies especially to when things it's trying aren't working.  It will keep trying the same losing strategy despite anything you try to do or say otherwise.  

#### Stuck Strategies

- Start a new session if it gets into a bad mindset
- Stop the Assistant and ask them what's going on. Tell them to not make any changs, just assess and report back.

    Example:

    ```chat
    The linter warnings are still present because the // eslint-disable-next-line typescript:S2004 comments we added are for ESLint, but these warnings are coming from SonarLint (as indicated by the "owner": "sonarlint" in the error messages)
    ```

- Ask another AI
- Go fix the issue yourself (get it over the hump)
- Don't be afraid to HARD reset

### Code Loss

The AI Assistant will often completely rewrite perfectly good code.  As it does this it will often omit chunks of code.  Often really good code.

#### Loss Strategies

- Commit often
- Check git diffs often (and just put the code back yourself)
- Don't be afraid to HARD reset

### Smart But No Backbone

The AI Assistant is super smart but it thinks you are smarter.  It will blindly override it's knowledge and skill to follow the most obvious mistakes you make.  A single poorly chosen word can cause it to make hundreds of thousand line count update to turn a beautiful design into a garbage dump.

#### Jellyfish Strategies

- Use another AI to validate and format things before you communicate to your AI Assistant
- Don't be afraid to HARD reset

### Smart But No Elephant

The AI Assistant is super smart but forgets things easily.  This is especially compounded by how much information you give it.  Which means many of the Stratgies here are at odds with this issue.

#### Elephant Strategies

- Start new sessions regularly

  - Keep resources available so you can provide them to the new session

- Don't be afraid to repeat yourself

  - Keep resources available so you can provide them to the new request (sometimes every request)

    Example

    ```txt
    Remember, we are only working on the lexer tests.  And we use the grammar and example (attached for reference), not the existing lexer implemeentation (custom or generated).
    ```

- Use MCPs
- Don't be afraid to HARD reset

#### Tooling Oppositional

For some unexplainable reason, your AI Assistant will choose the most outdated/difficult/obscure tooling.

### Oppositional Strategies

- Check tooling/libraries it adds
- Tell it to use newer/better versions

don't be afraid to repeat yourself
unit tests!
explosion of universe

 see the issue now. In the lexer grammar, we have separate tokens for INFERRED and BY:
Apply to CPGLLexer.g4
But in the test input, we're using inferred-by with a hyphen. The lexer is correctly identifying this as an error because there's no rule to handle the hyphen character between these keywords.
This suggests that my initial assessment about lexer mode transitions was incorrect. The actual issue is with the grammar not properly handling compound keywords with hyphens. The lexer modes are working as expected for handling concept types, value types, and activity types.
Would you like me to propose a fix for handling the hyphenated keywords in the grammar?


make it think, don't tell. for example instead of saying: Yes, but it needs to be applied across the board, not just with identifiers that have the suffix so we address these too. 

ask: Yes, but it needs to be applied across the board, not just with identifiers that have the suffix so we address these too, right? 

What not how: example the rules definition!!!

Suggest simpler solutions.  For example, the dedup... do at end.

Key is to distinguish between when things are going well and when they are going poorly; and then to reset and suggest a different approach that gets it back to going well (CORRECT REQUIREMENTS and/or SIMPLER APPROACH!!!).

Make it see the results, don't tell it about them.


It messes up tests so give it expected results, not tests.  then have it build the code and the tests to match that.