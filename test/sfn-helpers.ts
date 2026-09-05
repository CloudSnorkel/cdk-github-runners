// test/sfn-helpers.ts
import { Template } from 'aws-cdk-lib/assertions';

/** Resolve a state machine's DefinitionString (literals + tokens) into its parsed JSON. */
export function stateMachineDefinition(template: Template, logicalId?: string): any {
  const sms = template.findResources('AWS::StepFunctions::StateMachine');
  const keys = logicalId ? [logicalId] : Object.keys(sms);
  if (keys.length !== 1) throw new Error(`expected 1 state machine, got ${keys.length}`);

  const def = sms[keys[0]].Properties.DefinitionString;
  const json = typeof def === 'string'
    ? def
    : (def['Fn::Join'][1] as unknown[]).map(p => (typeof p === 'string' ? p : '')).join('');

  return JSON.parse(json);
}
