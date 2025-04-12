import { CharStreams, CommonTokenStream } from 'antlr4ts';
import { ParseTree } from 'antlr4ts/tree/ParseTree';

import { CPGLLexer } from '../../grammar/generated/CPGLLexer';
import { CPGLParser } from '../../grammar/generated/CPGLParser';
import { ASTBuilder } from '../builder';
import {
  Activity,
  BlockBody,
  CodedByDefinition,
  Concept,
  Decision,
  DoActivity,
  File,
  InferredByDefinition,
  SingleAction,
  Terminology,
  TerminologySystemCode,
  TerminologyValueset,
  UseDecision,
} from '../types';

describe('ASTBuilder', () => {
  let builder: ASTBuilder;

  beforeEach(() => {
    builder = new ASTBuilder();
  });

  const parseInput = (input: string): ParseTree => {
    const lexer = new CPGLLexer(CharStreams.fromString(input));
    const tokens = new CommonTokenStream(lexer);
    const parser = new CPGLParser(tokens);
    return parser.cpgl();
  };

  describe('Decision Statements', () => {
    it('should parse a simple decision with when clause', () => {
      const input = `
        decision "BMI":
          when "BMI > 30" then do "CPGProposeDiagnosis Obesity".
        done
      `;
      const tree = parseInput(input);
      const result = builder.visit(tree) as File;
      expect(result.type).toBe('File');
      expect(result.statements).toHaveLength(1);
      const decision = result.statements[0] as Decision;
      expect(decision.type).toBe('Decision');
      expect(decision.name).toBe('BMI');
      expect(decision.whenClauses).toHaveLength(1);
      expect(decision.whenClauses[0].condition).toBe('BMI > 30');
      const body = decision.whenClauses[0].body as SingleAction;
      expect(body.type).toBe('SingleAction');
      const action = body.action as DoActivity;
      expect(action.type).toBe('DoActivity');
      expect(action.activityName).toBe('CPGProposeDiagnosis Obesity');
    });

    it('should parse a decision with multiple when clauses', () => {
      const input = `
        decision "Check BMI":
          when "BMI" then do "Record BMI".
          when "Weight" then do "Record Weight".
        done
      `;

      const tree = parseInput(input);
      const ast = builder.visit(tree) as File;

      const decision = ast.statements[0] as Decision;
      expect(decision.whenClauses).toHaveLength(2);
      expect(decision.whenClauses[0].condition).toBe('BMI');
      expect(decision.whenClauses[1].condition).toBe('Weight');
    });

    it('should parse a decision with any/all qualifiers', () => {
      const input = `
        decision "Check Vitals":
          when "Temperature" then:
            any:
              when "High" then do "Record High Temp".
              when "Low" then do "Record Low Temp".
          done
          when "Blood Pressure" then:
            all:
              when "Systolic High" then do "Record Systolic".
              when "Diastolic High" then do "Record Diastolic".
          done
        done
      `;

      const tree = parseInput(input);
      const ast = builder.visit(tree) as File;

      const decision = ast.statements[0] as Decision;
      const tempBlock = decision.whenClauses[0].body as BlockBody;
      const bpBlock = decision.whenClauses[1].body as BlockBody;

      expect(tempBlock.qualifier).toBe('any');
      expect(bpBlock.qualifier).toBe('all');
      expect(tempBlock.statements).toHaveLength(2);
      expect(bpBlock.statements).toHaveLength(2);
    });
  });

  describe('Terminology Statements', () => {
    it('should parse a terminology valueset', () => {
      const input = 'terminology "BMI Valueset" valueset "bmi valueset".';

      const tree = parseInput(input);
      const ast = builder.visit(tree) as File;

      const terminology = ast.statements[0] as Terminology;
      expect(terminology.type).toBe('Terminology');
      expect(terminology.name).toBe('BMI Valueset');
      expect(terminology.definition.type).toBe('TerminologyValueset');
      expect((terminology.definition as TerminologyValueset).valuesetName).toBe('bmi valueset');
    });

    it('should parse a terminology system code', () => {
      const input = 'terminology "Colonoscopy" system "http://snomed.info/sct" code "73761001".';

      const tree = parseInput(input);
      const ast = builder.visit(tree) as File;

      const terminology = ast.statements[0] as Terminology;
      expect(terminology.definition.type).toBe('TerminologySystemCode');
      expect((terminology.definition as TerminologySystemCode).system).toBe(
        'http://snomed.info/sct',
      );
      expect((terminology.definition as TerminologySystemCode).code).toBe('73761001');
    });

    it('should parse a terminology unknown', () => {
      const input = 'terminology "Some Terminology" unknown.';

      const tree = parseInput(input);
      const ast = builder.visit(tree) as File;

      const terminology = ast.statements[0] as Terminology;
      expect(terminology.definition.type).toBe('TerminologyUnknown');
    });
  });

  describe('Activity Statements', () => {
    it('should parse a simple activity', () => {
      const input = 'activity "Vaccinate" perform CPGImmunization.';

      const tree = parseInput(input);
      const ast = builder.visit(tree) as File;

      const activity = ast.statements[0] as Activity;
      expect(activity.type).toBe('Activity');
      expect(activity.name).toBe('Vaccinate');
      expect(activity.activityType).toBe('CPGImmunization');
    });

    it('should parse an activity with of clause', () => {
      const input = 'activity "Indicate" perform CPGProposeDiagnosis of "Colonoscopy".';

      const tree = parseInput(input);
      const ast = builder.visit(tree) as File;

      const activity = ast.statements[0] as Activity;
      expect(activity.of).toBe('Colonoscopy');
    });
  });

  describe('Concept Statements', () => {
    it('should parse a simple concept with coded by', () => {
      const input = `
        concept "BMI Range as a Condition":
          has type Condition.
          has valuetype CodeableConcept.
          coded by "BMI Valueset".
        done
      `;

      const tree = parseInput(input);
      const ast = builder.visit(tree) as File;

      const concept = ast.statements[0] as Concept;
      expect(concept.type).toBe('Concept');
      expect(concept.name).toBe('BMI Range as a Condition');
      expect(concept.conceptType).toBe('Condition');
      expect(concept.valueType).toBe('CodeableConcept');
      expect(concept.definition.type).toBe('CodedByDefinition');
      expect((concept.definition as CodedByDefinition).terminologyName).toBe('BMI Valueset');
    });

    it('should parse a concept with inferred by pattern', () => {
      const input = `
        concept "Most Recent BMI":
          has type Observation.
          has valuetype boolean.
          has provenance "some provenance".
          inferred by "Most Recent(this, lookbackMonths)" "BMI".
        done
      `;

      const tree = parseInput(input);
      const ast = builder.visit(tree) as File;

      const concept = ast.statements[0] as Concept;
      expect(concept.definition.type).toBe('InferredByDefinition');
      expect((concept.definition as InferredByDefinition).pattern).toBe(
        'Most Recent(this, lookbackMonths)',
      );
      expect((concept.definition as InferredByDefinition).concept).toBe('BMI');
    });

    it('should parse a concept with inferred by expression', () => {
      const input = `
        concept "BMI":
          has type Observation.
          has valuetype Quantity.
          inferred by ("BMI Range as a Condition" or "BMI as an Observation" or "Calculated BMI").
        done
      `;

      const tree = parseInput(input);
      const ast = builder.visit(tree) as File;

      const concept = ast.statements[0] as Concept;
      expect(concept.definition.type).toBe('InferredByDefinition');
      expect((concept.definition as InferredByDefinition).expression).toBeDefined();
    });
  });

  describe('Multiple Statements', () => {
    it('should parse multiple statements of different types', () => {
      const input = `
        terminology "BMI Valueset" valueset "bmi valueset".
        activity "Vaccinate" perform CPGImmunization.
        concept "BMI":
          has type Observation.
          has valuetype Quantity.
          coded by "BMI Valueset".
        done
        decision "Check BMI":
          when "BMI" then do "Record BMI".
        done
      `;

      const tree = parseInput(input);
      const ast = builder.visit(tree) as File;

      expect(ast.statements).toHaveLength(4);
      expect(ast.statements[0].type).toBe('Terminology');
      expect(ast.statements[1].type).toBe('Activity');
      expect(ast.statements[2].type).toBe('Concept');
      expect(ast.statements[3].type).toBe('Decision');
    });
  });

  describe('Action Statements', () => {
    it('should parse a do activity', () => {
      const input = 'do CPGProposeDiagnosis';
      const tree = parseInput(input);
      const result = builder.visit(tree) as SingleAction;
      expect(result.type).toBe('SingleAction');
      const action = result.action as DoActivity;
      expect(action.type).toBe('DoActivity');
      expect(action.activityName).toBe('CPGProposeDiagnosis');
    });

    it('should parse a use decision', () => {
      const input = 'use SomeDecision';
      const tree = parseInput(input);
      const result = builder.visit(tree) as SingleAction;
      expect(result.type).toBe('SingleAction');
      const action = result.action as UseDecision;
      expect(action.type).toBe('UseDecision');
      expect(action.decisionName).toBe('SomeDecision');
    });
  });
});
