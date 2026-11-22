import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  CSharpVisitor,
  GoVisitor,
  JavaVisitor,
  PythonVisitor,
  Translator,
  typeScriptSnippetFromCompleteSource,
} from 'jsii-rosetta';
import type MarkdownIt from 'markdown-it';
import * as ts from 'typescript';
import { LANGUAGES } from './languages';

const VISITORS = {
  python: PythonVisitor,
  java: JavaVisitor,
  csharp: CSharpVisitor,
  go: GoVisitor,
};

/**
 * Translates every TypeScript code block to all languages with jsii-rosetta, so the language picker can show the
 * reader's language.
 *
 * Snippets are compiled against the library with `rosetta/default.ts-fixture`. Guide snippets that don't compile fail
 * the build. Docstring examples in the API reference are only translated, as nothing compiles them today.
 */
export function rosettaPlugin(md: MarkdownIt, root: string) {
  // snippets import the library by its package name, so give the compiler a node_modules that has it
  const compilationDirectory = path.join(root, 'docs', '.vitepress', 'cache', 'rosetta');
  const stub = path.join(compilationDirectory, 'node_modules', '@cloudsnorkel', 'cdk-github-runners');
  fs.mkdirSync(stub, { recursive: true });
  fs.writeFileSync(path.join(stub, 'package.json'), JSON.stringify({ name: '@cloudsnorkel/cdk-github-runners', types: 'index.d.ts' }));
  // import paths need forward slashes, also on Windows
  const lib = path.relative(stub, path.join(root, 'lib')).split(path.sep).join('/');
  fs.writeFileSync(path.join(stub, 'index.d.ts'), `export * from '${lib}';\n`);

  const fixture = fs.readFileSync(path.join(root, 'rosetta', 'default.ts-fixture'), 'utf-8');
  // one translator shares the compiler cache between snippets, and pages render more than once during build
  const rosetta = new Translator(true);
  const translations = new Map<string, Record<string, string>>();

  const fence = md.renderer.rules.fence!;
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    if (token.info.trim() !== 'typescript') {
      return fence(tokens, idx, options, env, self);
    }

    const where = `${env.relativePath}:${(token.map?.[0] ?? 0) + 1}`;
    const strict = !env.relativePath.startsWith('api/');
    if (!translations.has(token.content)) {
      translations.set(token.content, translate(token.content, where, strict));
    }
    const translated = translations.get(token.content)!;

    return LANGUAGES.map(lang => {
      const content = translated[lang.id];
      const copy = Object.assign(Object.create(Object.getPrototypeOf(token)), token, { info: lang.fence, content });
      return `<div class="lang lang-${lang.id}">${fence([copy], 0, options, env, self)}</div>`;
    }).join('');
  };

  function translate(code: string, where: string, strict: boolean): Record<string, string> {
    const { hoisted, statements } = sideline(code);
    const source = [
      '/// !show', hoisted, '/// !hide',
      fixture.replace('/// here', `/// !show\n${statements}\n/// !hide`),
    ].join('\n');
    const snippet = typeScriptSnippetFromCompleteSource(source, { api: { api: 'file', fileName: where } }, strict, {
      $compilation: compilationDirectory,
    });
    const translator = rosetta.translatorFor(snippet);
    const errors = translator.compileDiagnostics.filter(d => d.category === ts.DiagnosticCategory.Error);
    if (strict && errors.length > 0) {
      const messages = errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
      throw new Error(`Snippet in ${where} doesn't compile:\n  ${messages.join('\n  ')}`);
    }
    const result: Record<string, string> = { typescript: code };
    for (const [lang, Visitor] of Object.entries(VISITORS)) {
      result[lang] = translator.renderUsing(new Visitor());
    }
    return result;
  }
}

/**
 * Split imports and `declare const` from the rest of the snippet, like rosetta does with fixtures. They go on top and
 * the rest replaces `/// here`.
 */
function sideline(source: string) {
  let hoisted = '';
  let statements = '';
  for (const statement of ts.createSourceFile('snippet.ts', source, ts.ScriptTarget.Latest, true).statements) {
    if (ts.isImportDeclaration(statement) || (ts.isVariableStatement(statement) && statement.modifiers?.some(m => m.kind === ts.SyntaxKind.DeclareKeyword))) {
      hoisted += statement.getFullText();
    } else {
      statements += statement.getFullText();
    }
  }
  return { hoisted, statements };
}
