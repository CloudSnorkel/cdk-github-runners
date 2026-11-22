// Languages the API is published in. The id is used in the `?lang=` query, local storage and CSS classes.
export const LANGUAGES = [
  { id: 'typescript', name: 'TypeScript', fence: 'ts' },
  { id: 'python', name: 'Python', fence: 'python' },
  { id: 'java', name: 'Java', fence: 'java' },
  { id: 'csharp', name: 'C#', fence: 'csharp' },
  { id: 'go', name: 'Go', fence: 'go' },
] as const;

export type LanguageId = typeof LANGUAGES[number]['id'];

export const DEFAULT_LANGUAGE: LanguageId = 'typescript';
