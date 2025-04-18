import {
  Activity,
  BlockBody,
  SingleAction,
  SingleActionType,
  Concept,
  ConceptType,
  CodedByDefinition,
  CodedByDefinitionType,
  InferredByDefinition,
  InferredByDefinitionType,
  Decision,
  DecisionType,
  DoActivity,
  DoActivityType,
  FileType,
  Terminology,
  TerminologyType,
  TerminologySystemCode,
  TerminologySystemCodeType,
  TerminologyUnknownType,
  TerminologyValueset,
  TerminologyValuesetType,
  WhenBlock,
  UseDecision,
  UseDecisionType,
  ActionStatement,
} from '../types';

import { parseInput } from './index.test';

describe('CPGLAstBuilder', () => {
  describe('Decision Statements', () => {
    it('should parse a simple decision with when block', () => {
      const input = `
        decision "BMI":
          when "BMI > 30" then do "CPGProposeDiagnosis Obesity".
        done
      `;
      const result = parseInput(input);
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

      const result = parseInput(input);
      const decision = result.statements[0] as Decision;
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

      const result = parseInput(input);
      const ast = result.statements[0] as Decision;
      const tempWhenBlock = ast.body.statements[0] as WhenBlock;
      const bpWhenBlock = ast.body.statements[1] as WhenBlock;
      const tempBlock = tempWhenBlock.body as BlockBody;
      const bpBlock = bpWhenBlock.body as BlockBody;

      expect(tempBlock.qualifier).toBe('any');
      expect(bpBlock.qualifier).toBe('all');
      expect(tempBlock.statements).toHaveLength(2);
      expect(bpBlock.statements).toHaveLength(2);
    });

    describe('Action Statements in Block Body', () => {
      it('should parse a single do statement', () => {
        const input = `
          decision "Test":
            when "Concept" then:
              do "Activity".
            done
          done
        `;

        const result = parseInput(input);
        const decision = result.statements[0] as Decision;
        const whenBlock = decision.body.statements[0] as WhenBlock;
        const blockBody = whenBlock.body as BlockBody;

        expect(blockBody.statements).toHaveLength(1);
        const action = blockBody.statements[0] as ActionStatement;
        expect(action.action.type).toBe(DoActivityType.type);
        expect((action.action as DoActivity).activityName).toBe('Activity');
      });

      it('should parse two do statements', () => {
        const input = `
          decision "Test":
            when "Concept" then:
              do "First Activity".
              do "Second Activity".
            done
          done
        `;

        const result = parseInput(input);
        const decision = result.statements[0] as Decision;
        const whenBlock = decision.body.statements[0] as WhenBlock;
        const blockBody = whenBlock.body as BlockBody;

        expect(blockBody.statements).toHaveLength(2);
        const firstAction = blockBody.statements[0] as ActionStatement;
        expect(firstAction.action.type).toBe(DoActivityType.type);
        expect((firstAction.action as DoActivity).activityName).toBe('First Activity');

        const secondAction = blockBody.statements[1] as ActionStatement;
        expect(secondAction.action.type).toBe(DoActivityType.type);
        expect((secondAction.action as DoActivity).activityName).toBe('Second Activity');
      });

      it('should parse no do statements', () => {
        const input = `
          decision "Test":
            when "Concept" then:
            done
          done
        `;

        const result = parseInput(input);
        const decision = result.statements[0] as Decision;
        const whenBlock = decision.body.statements[0] as WhenBlock;
        const blockBody = whenBlock.body as BlockBody;

        expect(blockBody.statements).toHaveLength(0);
      });

      it('should parse a single use statement', () => {
        const input = `
          decision "Test":
            when "Concept" then:
              use "Other Decision".
            done
          done
        `;

        const result = parseInput(input);
        const decision = result.statements[0] as Decision;
        const whenBlock = decision.body.statements[0] as WhenBlock;
        const blockBody = whenBlock.body as BlockBody;

        expect(blockBody.statements).toHaveLength(1);
        const action = blockBody.statements[0] as ActionStatement;
        expect(action.action.type).toBe(UseDecisionType.type);
        expect((action.action as UseDecision).decisionName).toBe('Other Decision');
      });

      it('should parse two use statements', () => {
        const input = `
          decision "Test":
            when "Concept" then:
              use "First Decision".
              use "Second Decision".
            done
          done
        `;

        const result = parseInput(input);
        const decision = result.statements[0] as Decision;
        const whenBlock = decision.body.statements[0] as WhenBlock;
        const blockBody = whenBlock.body as BlockBody;

        expect(blockBody.statements).toHaveLength(2);
        const firstAction = blockBody.statements[0] as ActionStatement;
        expect(firstAction.action.type).toBe(UseDecisionType.type);
        expect((firstAction.action as UseDecision).decisionName).toBe('First Decision');

        const secondAction = blockBody.statements[1] as ActionStatement;
        expect(secondAction.action.type).toBe(UseDecisionType.type);
        expect((secondAction.action as UseDecision).decisionName).toBe('Second Decision');
      });

      it('should parse no use statements', () => {
        const input = `
          decision "Test":
            when "Concept" then:
            done
          done
        `;

        const result = parseInput(input);
        const decision = result.statements[0] as Decision;
        const whenBlock = decision.body.statements[0] as WhenBlock;
        const blockBody = whenBlock.body as BlockBody;

        expect(blockBody.statements).toHaveLength(0);
      });

      it('should parse a mixture of do and use statements', () => {
        const input = `
          decision "Test":
            when "Concept" then:
              do "First Activity".
              use "First Decision".
              do "Second Activity".
              use "Second Decision".
            done
          done
        `;

        const result = parseInput(input);
        const decision = result.statements[0] as Decision;
        const whenBlock = decision.body.statements[0] as WhenBlock;
        const blockBody = whenBlock.body as BlockBody;

        expect(blockBody.statements).toHaveLength(4);

        const firstAction = blockBody.statements[0] as ActionStatement;
        expect(firstAction.action.type).toBe(DoActivityType.type);
        expect((firstAction.action as DoActivity).activityName).toBe('First Activity');

        const secondAction = blockBody.statements[1] as ActionStatement;
        expect(secondAction.action.type).toBe(UseDecisionType.type);
        expect((secondAction.action as UseDecision).decisionName).toBe('First Decision');

        const thirdAction = blockBody.statements[2] as ActionStatement;
        expect(thirdAction.action.type).toBe(DoActivityType.type);
        expect((thirdAction.action as DoActivity).activityName).toBe('Second Activity');

        const fourthAction = blockBody.statements[3] as ActionStatement;
        expect(fourthAction.action.type).toBe(UseDecisionType.type);
        expect((fourthAction.action as UseDecision).decisionName).toBe('Second Decision');
      });
    });
  });

  describe('Terminology Statements', () => {
    it('should parse a terminology valueset', () => {
      const input = 'terminology "BMI Valueset" valueset "bmi valueset".';

      const result = parseInput(input);
      const ast = result.statements[0] as Terminology;
      expect(ast.type).toBe(TerminologyType.type);
      expect(ast.name).toBe('BMI Valueset');
      expect(ast.definition.type).toBe(TerminologyValuesetType.type);
      expect((ast.definition as TerminologyValueset).valuesetName).toBe('bmi valueset');
    });

    it('should parse a terminology system code', () => {
      const input = 'terminology "Colonoscopy" system "http://snomed.info/sct" code "73761001".';

      const result = parseInput(input);
      const ast = result.statements[0] as Terminology;
      expect(ast.definition.type).toBe(TerminologySystemCodeType.type);
      expect((ast.definition as TerminologySystemCode).system).toBe('http://snomed.info/sct');
      expect((ast.definition as TerminologySystemCode).code).toBe('73761001');
    });

    it('should parse a terminology unknown', () => {
      const input = 'terminology "Some Terminology" unknown.';

      const result = parseInput(input);
      const ast = result.statements[0] as Terminology;
      expect(ast.definition.type).toBe(TerminologyUnknownType.type);
    });
  });

  describe('Activity Statements', () => {
    it('should parse a simple activity', () => {
      const input = 'activity "Vaccinate" perform CPGImmunization.';

      const result = parseInput(input);
      const ast = result.statements[0] as Activity;
      expect(ast.type).toBe('Activity');
      expect(ast.name).toBe('Vaccinate');
      expect(ast.perform).toBe('CPGImmunization');
      expect(ast.terminologyReference).toBeUndefined();
    });

    it('should parse an activity with of clause', () => {
      const input = 'activity "Indicate" perform CPGProposeDiagnosis of "Colonoscopy".';

      const result = parseInput(input);
      const ast = result.statements[0] as Activity;
      expect(ast.type).toBe('Activity');
      expect(ast.name).toBe('Indicate');
      expect(ast.perform).toBe('CPGProposeDiagnosis');
      expect(ast.terminologyReference).toBe('Colonoscopy');
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

      const result = parseInput(input);
      const ast = result.statements[0] as Concept;
      expect(ast.type).toBe(ConceptType.type);
      expect(ast.name).toBe('BMI Range as a Condition');
      expect(ast.conceptType).toBe('Condition');
      expect(ast.valueType).toBe('CodeableConcept');
      expect(ast.definition.type).toBe(CodedByDefinitionType.type);
      expect((ast.definition as CodedByDefinition).terminologyName).toBe('BMI Valueset');
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

      const result = parseInput(input);
      const ast = result.statements[0] as Concept;
      expect(ast.type).toBe(ConceptType.type);
      expect(ast.name).toBe('Most Recent BMI');
      expect(ast.conceptType).toBe('Observation');
      expect(ast.valueType).toBe('boolean');
      expect(ast.provenance).toBe('some provenance');
      expect(ast.definition.type).toBe(InferredByDefinitionType.type);
      const inferredBy = ast.definition as InferredByDefinition;
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

      const result = parseInput(input);
      const ast = result.statements[0] as Concept;
      expect(ast.type).toBe(ConceptType.type);
      expect(ast.name).toBe('BMI');
      expect(ast.conceptType).toBe('Observation');
      expect(ast.valueType).toBe('Quantity');
      expect(ast.definition.type).toBe(InferredByDefinitionType.type);
      const inferredBy = ast.definition as InferredByDefinition;
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

      const result = parseInput(input);
      const ast = result.statements[0] as Concept;
      expect(ast.definition.type).toBe(InferredByDefinitionType.type);
      const inferredBy = ast.definition as InferredByDefinition;
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

      const result = parseInput(input);
      const ast = result.statements;

      expect(ast.length).toBe(4);
      expect(ast[0].type).toBe(TerminologyType.type);
      expect(ast[1].type).toBe('Activity');
      expect(ast[2].type).toBe(ConceptType.type);
      expect(ast[3].type).toBe(DecisionType.type);
    });
  });

  describe('Action Statements', () => {
    it('should parse a do activity', () => {
      const input = `
decision "Test":
  when "BMI > 30" then do "CPGProposeDiagnosis".
done
`;
      const result = parseInput(input);
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
      const result = parseInput(input);
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

      const result = parseInput(input);
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
