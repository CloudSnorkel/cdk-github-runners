import { increaseVersion } from '../src/image-builders/aws-image-builder/versioner.lambda';

test('No versions found', () => {
  expect(
    increaseVersion([]),
  ).toBe('1.0.1');
});

test('Simple version increments', () => {
  expect(
    increaseVersion(['1.0.0']),
  ).toBe('1.0.1');

  expect(
    increaseVersion(['1.0.1']),
  ).toBe('1.0.2');

  expect(
    increaseVersion(['0.0.1']),
  ).toBe('0.0.2');

  expect(
    increaseVersion(['135.55.68']),
  ).toBe('135.55.69');
});

test('Multi version increments', () => {
  expect(
    increaseVersion(['1.0.0', '1.0.1', '1.0.2']),
  ).toBe('1.0.3');

  expect(
    increaseVersion(['1.0.2', '1.0.1', '1.0.0']),
  ).toBe('1.0.3');
});
