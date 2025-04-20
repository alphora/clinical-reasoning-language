import { CharStreams, CommonTokenStream } from 'antlr4ts';

import { createLexer } from '../../lexer/createLexer';
import { CPGLAstBuilder } from '../builder';
import { CPGL } from '../types';

// Test suite imports
import './builder.test';
import './decision-structure.test';
import './concept-structure.test';
import './terminology-structure.test';
import './activity-structure.test';
import { createParser } from '../../parser/createParser';

// parseInput has been moved to parseInput.ts
