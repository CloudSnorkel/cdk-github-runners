import * as cdk from 'aws-cdk-lib';
import { Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { generateStateName } from '../src/providers/common';
import { cleanUp } from './test-utils';

describe('generateStateName', () => {
  let app: cdk.App;
  let stack: cdk.Stack;

  beforeEach(() => {
    app = new cdk.App();
    stack = new Stack(app, 'TestStack');
  });

  afterEach(() => cleanUp(app));

  test('creates state name from construct path without suffix', () => {
    const construct = new Construct(stack, 'MyProvider');
    const result = generateStateName(construct);

    expect(result).toBe('MyProvider');
    expect(result.length).toBeLessThanOrEqual(80);
  });

  test('creates state name from construct path with suffix', () => {
    const construct = new Construct(stack, 'MyProvider');
    const result = generateStateName(construct, 'data');

    expect(result).toBe('MyProvider data');
    expect(result.length).toBeLessThanOrEqual(80);
  });

  test('shortens long construct path with suffix', () => {
    // Create a construct with a very long path
    let current: Construct = stack;
    for (let i = 0; i < 10; i++) {
      current = new Construct(current, `VeryLongName${i}`);
    }

    const result = generateStateName(current, 'subnet-0113588416c0c6005');
    expect(result.length).toBeLessThanOrEqual(80);
    expect(result).toMatch(/-[a-z0-9]+$/); // Should have hash suffix if shortened
  });

  test('produces different names for different constructs', () => {
    const construct1 = new Construct(stack, 'Provider1');
    const construct2 = new Construct(stack, 'Provider2');

    const result1 = generateStateName(construct1, 'data');
    const result2 = generateStateName(construct2, 'data');

    expect(result1).not.toBe(result2);
  });

  test('produces different names for different suffixes on same construct', () => {
    const construct = new Construct(stack, 'MyProvider');

    const result1 = generateStateName(construct, 'data');
    const result2 = generateStateName(construct, 'rand');
    const result3 = generateStateName(construct, 'choice');

    expect(result1).not.toBe(result2);
    expect(result2).not.toBe(result3);
    expect(result1).not.toBe(result3);
  });

  test('handles empty suffix', () => {
    const construct = new Construct(stack, 'MyProvider');

    const result1 = generateStateName(construct);
    const result2 = generateStateName(construct, '');

    expect(result1).toBe(result2);
  });

  test('shortens when name exceeds 80 characters', () => {
    // Create a construct with a very long path
    let current: Construct = stack;
    for (let i = 0; i < 20; i++) {
      current = new Construct(current, `VeryLongName${i}`);
    }

    const result = generateStateName(current, 'subnet-0113588416c0c6005');
    expect(result.length).toBeLessThanOrEqual(80);
    expect(result).toMatch(/-[a-z0-9]+$/); // Should have hash suffix
  });

  test('is deterministic - same input produces same output', () => {
    const construct = new Construct(stack, 'MyProvider');

    const result1 = generateStateName(construct, 'data');
    const result2 = generateStateName(construct, 'data');

    expect(result1).toBe(result2);
  });

  test('handles the GitHub issue example with long path', () => {
    const construct = new Construct(stack, 'fuel-ec2-c6a.2xlarge-dev-windows-x64-vs22-rust-full-nospot');

    const result = generateStateName(construct, 'subnet-0113588416c0c6005');
    expect(result.length).toBeLessThanOrEqual(80);
    // Should preserve some of the prefix
    expect(result).toContain('fuel-ec2');
  });

  test('preserves prefix when shortening', () => {
    let current: Construct = stack;
    current = new Construct(current, 'my-provider-name');
    for (let i = 0; i < 20; i++) {
      current = new Construct(current, `x${i}`);
    }

    const result = generateStateName(current, 'suffix');
    expect(result.length).toBeLessThanOrEqual(80);
    expect(result.startsWith('my-provider-name')).toBe(true);
    expect(result).toMatch(/-[a-z0-9]+$/); // Should end with hash suffix
  });
});

