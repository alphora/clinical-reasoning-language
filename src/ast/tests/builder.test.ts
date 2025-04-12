import { CharStreams, CommonTokenStream } from 'antlr4ts';
import { ParseTree } from 'antlr4ts/tree/ParseTree';

import { CPGLLexer } from '../../grammar/generated/CPGLLexer';
import { CPGLParser } from '../../grammar/generated/CPGLParser';
import { createLexer } from '../../lexer/createLexer';
import { ASTBuilder } from '../builder';
import {
  Activity,
  ActivityType,
  BlockBody,
  CodedByDefinition,
  CodedByDefinitionType,
  Concept,
  ConceptType,
  Decision,
  DecisionType,
  DoActivity,
  DoActivityType,
  File,
  FileType,
  InferredByDefinition,
  InferredByDefinitionType,
  SingleAction,
  SingleActionType,
  Terminology,
  TerminologyType,
  TerminologySystemCode,
  TerminologySystemCodeType,
  TerminologyValueset,
  TerminologyValuesetType,
  TerminologyUnknownType,
  UseDecision,
  UseDecisionType,
  WhenBlock,
} from '../types';

describe('ASTBuilder', () => {
  let builder: ASTBuilder;

  beforeEach(() => {
    builder = new ASTBuilder();
  });

  const parseInput = (input: string): ParseTree => {
    const lexer = createLexer(CharStreams.fromString(input));
    const tokens = new CommonTokenStream(lexer);
    const parser = new CPGLParser(tokens);
    return parser.cpgl();
  };

  describe('Decision Statements', () => {
    it('should parse a simple decision with when block', () => {
      const input = `
        decision "BMI":
          when "BMI > 30" then do "CPGProposeDiagnosis Obesity".
        done
      `;
      const tree = parseInput(input);
      const result = builder.visit(tree) as File;
      expect(result.type).toBe(FileType.type);
      expect(result.statements).toHaveLength(1);
      const decision = result.statements[0] as Decision;
      expect(decision.type).toBe(DecisionType.type);
      expect(decision.name).toBe('BMI');
      expect(decision.body.statements).toHaveLength(1);
      expect(decision.body.statements[0].conceptName).toBe('BMI > 30');
      const whenBlock = decision.body.statements[0] as WhenBlock;
      const body = whenBlock.body as SingleAction;
      expect(body.type).toBe(SingleActionType.type);
      const action = body.action as DoActivity;
      expect(action.type).toBe(DoActivityType.type);
      expect(action.activityName).toBe('CPGProposeDiagnosis Obesity');
    });

    it('should parse a decision with multiple when blocks', () => {
      const input = `
        decision "Check BMI":
          when "BMI" then do "Record BMI".
          when "Weight" then do "Record Weight".
        done
      `;

      const tree = parseInput(input);
      const ast = builder.visit(tree) as File;

      const decision = ast.statements[0] as Decision;
      expect(decision.body.statements).toHaveLength(2);
      expect(decision.body.statements[0].conceptName).toBe('BMI');
      expect(decision.body.statements[1].conceptName).toBe('Weight');
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
      const tempWhenBlock = decision.body.statements[0] as WhenBlock;
      const bpWhenBlock = decision.body.statements[1] as WhenBlock;
      const tempBlock = tempWhenBlock.body as BlockBody;
      const bpBlock = bpWhenBlock.body as BlockBody;

      expect(tempBlock.qualifier).toBe(CPGLLexer.ANY.toString());
      expect(bpBlock.qualifier).toBe(CPGLLexer.ALL.toString());
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
      expect(terminology.type).toBe(TerminologyType.type);
      expect(terminology.name).toBe('BMI Valueset');
      expect(terminology.definition.type).toBe(TerminologyValuesetType.type);
      expect((terminology.definition as TerminologyValueset).valuesetName).toBe('bmi valueset');
    });

    it('should parse a terminology system code', () => {
      const input = 'terminology "Colonoscopy" system "http://snomed.info/sct" code "73761001".';

      const tree = parseInput(input);
      const ast = builder.visit(tree) as File;

      const terminology = ast.statements[0] as Terminology;
      expect(terminology.definition.type).toBe(TerminologySystemCodeType.type);
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
      expect(terminology.definition.type).toBe(TerminologyUnknownType.type);
    });
  });

  describe('Activity Statements', () => {
    it('should parse a simple activity', () => {
      const input = 'activity "Vaccinate" perform CPGImmunization.';

      const tree = parseInput(input);
      const ast = builder.visit(tree) as File;

      const activity = ast.statements[0] as Activity;
      expect(activity.type).toBe(ActivityType.type);
      expect(activity.name).toBe('Vaccinate');
      expect(activity.activityType).toBe('CPGImmunization');
      expect(activity.terminologyReference).toBeUndefined();
    });

    it('should parse an activity with of clause', () => {
      const input = 'activity "Indicate" perform CPGProposeDiagnosis of "Colonoscopy".';

      const tree = parseInput(input);
      const ast = builder.visit(tree) as File;

      const activity = ast.statements[0] as Activity;
      expect(activity.type).toBe(ActivityType.type);
      expect(activity.name).toBe('Indicate');
      expect(activity.activityType).toBe('CPGProposeDiagnosis');
      expect(activity.terminologyReference).toBe('Colonoscopy');
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
      expect(concept.type).toBe(ConceptType.type);
      expect(concept.name).toBe('BMI Range as a Condition');
      expect(concept.conceptType).toBe('Condition');
      expect(concept.valueType).toBe('CodeableConcept');
      expect(concept.definition.type).toBe(CodedByDefinitionType.type);
      expect((concept.definition as CodedByDefinition).terminologyName).toBe('BMI Valueset');
    });

    it('should parse a concept with inferred by pattern and concept reference', () => {
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
      expect(concept.type).toBe(ConceptType.type);
      expect(concept.name).toBe('Most Recent BMI');
      expect(concept.conceptType).toBe('Observation');
      expect(concept.valueType).toBe('boolean');
      expect(concept.provenance).toBe('some provenance');
      expect(concept.definition.type).toBe(InferredByDefinitionType.type);
      const inferredBy = concept.definition as InferredByDefinition;
      expect(inferredBy.pattern).toBe('Most Recent(this, lookbackMonths)');
      expect(inferredBy.concept).toBe('BMI');
      expect(inferredBy.descriptiveLogic).toBeUndefined();
    });

    it('should parse a concept with inferred by descriptive logic', () => {
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
      expect(concept.type).toBe(ConceptType.type);
      expect(concept.name).toBe('BMI');
      expect(concept.conceptType).toBe('Observation');
      expect(concept.valueType).toBe('Quantity');
      expect(concept.definition.type).toBe(InferredByDefinitionType.type);
      const inferredBy = concept.definition as InferredByDefinition;
      expect(inferredBy.descriptiveLogic).toBe(
        'BMI Range as a Condition or BMI as an Observation or Calculated BMI',
      );
      expect(inferredBy.pattern).toBeUndefined();
      expect(inferredBy.concept).toBeUndefined();
    });

    it('should parse a concept with inferred by descriptive logic using and/or combinations', () => {
      const input = `
        concept "Complex BMI":
          has type Observation.
          has valuetype Quantity.
          inferred by (("BMI Range as a Condition" and "Recent") or ("BMI as an Observation" and "Valid") or "Calculated BMI").
        done
      `;

      const tree = parseInput(input);
      const ast = builder.visit(tree) as File;

      const concept = ast.statements[0] as Concept;
      expect(concept.definition.type).toBe(InferredByDefinitionType.type);
      const inferredBy = concept.definition as InferredByDefinition;
      expect(inferredBy.pattern).toBeUndefined();
      expect(inferredBy.concept).toBeUndefined();
      expect(inferredBy.descriptiveLogic).toBe(
        '(BMI Range as a Condition and Recent) or (BMI as an Observation and Valid) or Calculated BMI',
      );
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
      expect(ast.statements[0].type).toBe(TerminologyType.type);
      expect(ast.statements[1].type).toBe(ActivityType.type);
      expect(ast.statements[2].type).toBe(ConceptType.type);
      expect(ast.statements[3].type).toBe(DecisionType.type);
    });
  });

  describe('Action Statements', () => {
    it('should parse a do activity', () => {
      const input = `
decision "Test":
  when "BMI > 30" then do "CPGProposeDiagnosis".
done
`;
      const tree = parseInput(input);
      const result = builder.visit(tree) as File;
      const decision = result.statements[0] as Decision;
      const whenBlock = decision.body.statements[0] as WhenBlock;
      const body = whenBlock.body as SingleAction;
      expect(body.type).toBe(SingleActionType.type);
      const action = body.action as DoActivity;
      expect(action.type).toBe(DoActivityType.type);
      expect(action.activityName).toBe('CPGProposeDiagnosis');
    });

    it('should parse a use decision', () => {
      const input = `
decision "Test":
  when "BMI > 30" then use "SomeDecision".
done
`;
      const tree = parseInput(input);
      const result = builder.visit(tree) as File;
      const decision = result.statements[0] as Decision;
      const whenBlock = decision.body.statements[0] as WhenBlock;
      const body = whenBlock.body as SingleAction;
      expect(body.type).toBe(SingleActionType.type);
      const action = body.action as UseDecision;
      expect(action.type).toBe(UseDecisionType.type);
      expect(action.decisionName).toBe('SomeDecision');
    });
  });

  describe('Decision Structure', () => {
    it('should properly nest WhenBlocks under DecisionBody', () => {
      const input = `
        decision "IMMZ.D2.D5.Measles":
          when "Measles Routine Immunization Schedule Incomplete" then:
            any:
            when "No Primary Series Doses Administered" then:
              when "Client Age Less Than 12 Months" then do "Indicate".
              when "Last Live Vaccine Administered has had in 4 Weeks" then use "Elderly Based".
            done 
            when "Client Is Due For MCV12" then do "Vaccinate".
          done
        done
      `;

      const tree = parseInput(input);
      const result = builder.visit(tree) as File;

      const decision = result.statements[0] as Decision;

      // Verify Decision has a DecisionBody
      expect(decision.body).toBeDefined();
      expect(decision.body.type).toBe('DecisionBody');

      // Verify WhenBlocks are under DecisionBody, not directly under Decision
      const decisionKeys = Object.keys(decision);
      expect(decisionKeys).not.toContain('WhenBlock');

      // Verify WhenBlocks are properly nested under DecisionBody
      expect(decision.body.statements).toBeDefined();
      expect(decision.body.statements.length).toBeGreaterThan(0);
      expect(decision.body.statements[0].type).toBe('WhenBlock');
    });
  });
});
