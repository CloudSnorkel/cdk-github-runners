import * as fs from 'node:fs';
import * as path from 'node:path';
import { Documentation, Language } from 'jsii-docgen';
import type MarkdownIt from 'markdown-it';
import { LANGUAGES, LanguageId } from './languages';

const DOCGEN_LANGUAGES: Record<LanguageId, Language> = {
  typescript: Language.TYPESCRIPT,
  python: Language.PYTHON,
  java: Language.JAVA,
  csharp: Language.CSHARP,
  go: Language.GO,
};

const KINDS = {
  constructs: 'Construct',
  classes: 'Class',
  structs: 'Struct',
  interfaces: 'Interface',
  enums: 'Enum',
} as const;

type Kind = keyof typeof KINDS;

/** API reference sections in the order they show in the sidebar and index page. */
export const API_SECTIONS: [Kind, string][] = [
  ['constructs', 'Constructs'],
  ['classes', 'Classes'],
  ['structs', 'Structs'],
  ['interfaces', 'Interfaces'],
  ['enums', 'Enums'],
];

const CDK_API = 'https://docs.aws.amazon.com/cdk/api/v2/docs';
const SITE = 'https://ghr.cloudsnorkel.com';

export interface ApiPage {
  readonly name: string;
  readonly kind: Kind;
  readonly summary: string;
  readonly content: string;
}

/**
 * Writes the API reference pages to `dir`, which holds only generated files.
 */
export function writeApiPages(dir: string, pages: ApiPage[]) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const page of pages) {
    fs.writeFileSync(path.join(dir, `${page.name}.md`), page.content);
  }
  const index = [
    '---', 'editLink: false', '---', '',
    '# API Reference', '',
    'The API is the same in every language. Pick yours at the top of the page and the signatures and examples will follow.', '',
    '<div v-pre>', '',
  ];
  for (const [kind, title] of API_SECTIONS) {
    index.push(`## ${title}`, '');
    for (const page of pages.filter(p => p.kind === kind)) {
      index.push(`- [${page.name}](/api/${page.name}): ${escapeHtml(page.summary).replace(/[{}]/g, c => `&#${c.charCodeAt(0)};`)}`);
    }
    index.push('');
  }
  index.push('</div>', '');
  fs.writeFileSync(path.join(dir, 'index.md'), index.join('\n'));
}

interface ApiType {
  readonly id: string;
  readonly name: string;
  readonly kind: Kind;
  readonly byLang: Record<LanguageId, any>;
}

/**
 * Renders a page for every type in the jsii assembly of the project in `root`.
 *
 * Each page holds every language. The language picker hides the ones the reader didn't choose. Anchors use the
 * TypeScript name so links work in every language.
 */
export async function generateApiPages(root: string): Promise<ApiPage[]> {
  const docs = await Documentation.forProject(root);
  const references = {} as Record<LanguageId, any>;
  try {
    for (const lang of LANGUAGES) {
      const json = await docs.toJson({ language: DOCGEN_LANGUAGES[lang.id], readme: false });
      references[lang.id] = json.content.apiReference;
    }
  } finally {
    await docs.cleanup();
  }

  const types = new Map<string, ApiType>();
  for (const kind of Object.keys(KINDS) as Kind[]) {
    for (const type of references.typescript[kind]) {
      const byLang = {} as Record<LanguageId, any>;
      for (const lang of LANGUAGES) {
        byLang[lang.id] = references[lang.id][kind].find((t: any) => t.id === type.id);
      }
      types.set(type.id, { id: type.id, name: type.displayName, kind, byLang });
    }
  }

  const links = new LinkResolver(root, types, references.typescript);
  const pages = [...types.values()].map(type => ({
    name: type.name,
    kind: type.kind,
    summary: (type.byLang.typescript.docs?.summary ?? '').replace(/\{@link\s+([^\s}]+)(?:\s+([^}]*))?\}/g, (_: string, t: string, l?: string) => l || t),
    content: new TypePage(type, links).render(),
  }));
  links.assertResolved();
  return pages.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Resolves `{@link}` targets and type references to URLs.
 *
 * Our types go to their page here. Types from aws-cdk-lib and constructs go to the AWS CDK API reference.
 */
class LinkResolver {
  private readonly byName = new Map<string, ApiType>();
  private readonly external = new Map<string, string>();
  private readonly unresolved: string[] = [];

  constructor(private readonly root: string, private readonly types: Map<string, ApiType>, reference: any) {
    for (const type of types.values()) {
      this.byName.set(type.name, type);
    }
    collectTypeRefs(reference, ref => {
      if (!types.has(ref.id)) {
        this.external.set(ref.displayName, ref.id);
      }
    });
  }

  typeUrl(id: string): string | undefined {
    const type = this.types.get(id);
    if (type) {
      return `/api/${type.name}`;
    }
    if (id.startsWith('aws-cdk-lib.') || id.startsWith('constructs.')) {
      return `${CDK_API}/${id}.html`;
    }
    return undefined;
  }

  /**
   * Resolve a `{@link}` target like `Type`, `Type.member` or `Type#member`.
   */
  resolve(target: string, where: string): string {
    const [typeName, member] = target.split(/[.#]/, 2);
    const type = this.byName.get(typeName);
    if (type && (!member || memberNames(type).has(member))) {
      return `/api/${type.name}${member ? `#${member}` : ''}`;
    }
    const external = this.external.get(typeName);
    if (external) {
      return `${CDK_API}/${external}.html${member ? `#${member.toLowerCase()}` : ''}`;
    }
    this.unresolved.push(`{@link ${target}} in ${where}`);
    return '#';
  }

  /**
   * Whether a `{@link}` target is one of our methods, so its label can end with `()`.
   */
  isMethod(target: string): boolean {
    const [typeName, member] = target.split(/[.#]/, 2);
    const ts = this.byName.get(typeName)?.byLang.typescript;
    return ['instanceMethods', 'staticMethods'].some(key => ts?.[key]?.some((m: any) => m.displayName === member));
  }

  /**
   * Turn a URL on this site into a relative link labeled with the page title, or the heading title for an anchor.
   */
  siteLink(url: string, where: string): string {
    const [page, anchor] = url.slice(SITE.length).split('#');
    const file = path.join(this.root, 'docs', `${page}.md`);
    const md = (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '')
      .replace(/<!--@include: (.+?)-->/, (_, include) => fs.readFileSync(path.resolve(path.dirname(file), include), 'utf8'));
    const title = md.split('\n').find(line => anchor ? /^#+ /.test(line) && slugify(line) === anchor : line.startsWith('# '));
    if (!title) {
      this.unresolved.push(`${url} in ${where}`);
    }
    return `[${title?.replace(/^#+ /, '') ?? url}](${url.slice(SITE.length)})`;
  }

  assertResolved() {
    if (this.unresolved.length > 0) {
      throw new Error(`Unresolved docstring links:\n  ${this.unresolved.join('\n  ')}`);
    }
  }
}

class TypePage {
  private readonly lines: string[] = [];

  constructor(private readonly type: ApiType, private readonly links: LinkResolver) {
  }

  render(): string {
    const ts = this.type.byLang.typescript;

    this.lines.push('---', `title: ${this.type.name}`, 'editLink: false', 'outline: [2, 3]', '---', '');
    // the title stays out of v-pre so VitePress picks it up
    this.lines.push(`# ${this.type.name} <span class="VPBadge info">${KINDS[this.type.kind]}</span>`, '', '<div v-pre>', '');
    this.docs(ts, this.type.name);

    if (ts.interfaces?.length) {
      this.lines.push(`**Implements:** ${ts.interfaces.map((i: any) => this.typeLink(i)).join(', ')}`, '');
    }
    if (ts.implementations?.length) {
      this.lines.push(`**Implemented by:** ${ts.implementations.map((i: any) => this.typeLink(i)).join(', ')}`, '');
    }

    if (this.type.kind === 'structs') {
      this.section('Initializer', 'initializer');
      this.variants(lang => this.code(lang, this.type.byLang[lang].usage));
    }
    if (ts.initializer) {
      this.section('Initializer', 'initializer');
      this.variants(lang => {
        const init = this.type.byLang[lang].initializer;
        this.code(lang, init.usage);
        this.parameters(lang, init.parameters, `${this.type.name} initializer`);
      });
    }
    this.methods('Methods', 'instanceMethods');
    this.methods('Static Functions', 'staticMethods');
    this.properties('Properties', 'properties');
    this.properties('Constants', 'constants');
    if (ts.members?.length) {
      this.section('Members', 'members');
      ts.members.forEach((member: any, i: number) => {
        this.heading('members', i);
        this.docs(member, `${this.type.name}.${member.displayName}`);
      });
    }

    this.lines.push('</div>', '');
    return this.lines.join('\n');
  }

  private methods(title: string, key: string) {
    const methods = this.type.byLang.typescript[key] ?? [];
    if (methods.length === 0) {
      return;
    }
    this.section(title, key);
    methods.forEach((method: any, i: number) => {
      const where = `${this.type.name}.${method.displayName}`;
      this.heading(key, i, '()');
      this.docs(method, where);
      this.variants(lang => {
        const m = this.type.byLang[lang][key][i];
        this.code(lang, m.usage);
        this.parameters(lang, m.parameters, where);
      });
    });
  }

  private properties(title: string, key: string) {
    const properties = this.type.byLang.typescript[key] ?? [];
    if (properties.length === 0) {
      return;
    }
    this.section(title, key);
    properties.forEach((property: any, i: number) => {
      const where = `${this.type.name}.${property.displayName}`;
      this.heading(key, i);
      this.variants(lang => {
        const p = this.type.byLang[lang][key][i];
        this.lines.push(`<code>${escapeHtml(p.displayName)}${p.optional ? '?' : ''}</code>: <code>${this.typeHtml(p.type)}</code>`, '');
      });
      this.docs(property, where);
      if (property.default) {
        this.lines.push(`**Default:** ${this.prose(property.default, where)}`, '');
      }
    });
  }

  private parameters(lang: LanguageId, parameters: any[], where: string) {
    for (const p of parameters) {
      const name = `<code>${escapeHtml(p.displayName)}${p.optional ? '?' : ''}</code>`;
      this.lines.push(`- ${name}: <code>${this.typeHtml(p.type)}</code>`, '');
      const docs = [p.docs?.summary, p.docs?.remarks, p.default && `**Default:** ${p.default}`].filter(Boolean);
      for (const text of docs) {
        this.lines.push(indent(this.prose(text, `${where} parameter ${p.displayName} (${lang})`)), '');
      }
    }
  }

  private docs(item: any, where: string) {
    for (const text of [item.docs?.summary, item.docs?.remarks]) {
      if (text) {
        this.lines.push(this.prose(text, where), '');
      }
    }
    for (const see of item.docs?.links ?? []) {
      const link = /^https?:\/\/\S+$/.test(see) && !see.startsWith(SITE) ? `[${see}](${see})` : this.prose(see, where);
      this.lines.push(`**See:** ${link}`, '');
    }
  }

  /**
   * Member heading with the name in every language, anchored by the TypeScript name. The outline only reads the
   * TypeScript name, as VitePress skips `ignore-header`.
   */
  private heading(key: string, i: number, suffix = '') {
    const names = LANGUAGES.map(lang => `<span class="lang lang-${lang.id}${lang.id === 'typescript' ? '' : ' ignore-header'}">${escapeHtml(this.type.byLang[lang.id][key][i].displayName)}${suffix}</span>`);
    this.lines.push(`### ${names.join('')} {#${this.type.byLang.typescript[key][i].displayName}}`, '');
  }

  private section(title: string, id: string) {
    this.lines.push(`## ${title} {#${id}}`, '');
  }

  private variants(render: (lang: LanguageId) => void) {
    for (const lang of LANGUAGES) {
      this.lines.push(`<div class="lang lang-${lang.id}">`, '');
      render(lang.id);
      this.lines.push('</div>', '');
    }
  }

  private code(lang: LanguageId, code: string) {
    const fence = LANGUAGES.find(l => l.id === lang)!.fence;
    this.lines.push('```' + fence, code, '```', '');
  }

  private typeHtml(type: any): string {
    let i = 0;
    return escapeHtml(type.formattingPattern).replace(/%/g, () => {
      const t = type.types[i++];
      return t.formattingPattern === undefined ? this.typeLink(t, true) : this.typeHtml(t);
    });
  }

  private typeLink(ref: any, html = false): string {
    const url = this.links.typeUrl(ref.id);
    if (!url) {
      return html ? escapeHtml(ref.displayName) : ref.displayName;
    }
    return html ? `<a href="${url}">${escapeHtml(ref.displayName)}</a>` : `[${ref.displayName}](${url})`;
  }

  /**
   * Docstring markdown with links resolved and HTML and braces escaped outside code.
   */
  private prose(text: string, where: string): string {
    return mapOutsideCode(text, part => part
      .replace(/</g, '&lt;')
      .replace(/https:\/\/ghr\.cloudsnorkel\.com\/[^\s)]*[^\s).,]/g, url => this.links.siteLink(url, where))
      .replace(/\{@link\s+([^\s}]+)(?:\s+([^}]*))?\}/g, (_, target: string, label?: string) => {
        if (/^https?:\/\//.test(target)) {
          return `[${label || target}](${target})`;
        }
        return `[\`${label || (this.links.isMethod(target) ? `${target}()` : target)}\`](${this.links.resolve(target, where)})`;
      })
      // VitePress reads `{...}` as attributes
      .replace(/\{/g, '&#123;')
      .replace(/\}/g, '&#125;'));
  }
}

function memberNames(type: ApiType): Set<string> {
  const ts = type.byLang.typescript;
  return new Set(['instanceMethods', 'staticMethods', 'properties', 'constants', 'members']
    .flatMap(key => (ts[key] ?? []).map((m: any) => m.displayName)));
}

function collectTypeRefs(node: any, visit: (ref: any) => void) {
  if (Array.isArray(node)) {
    node.forEach(n => collectTypeRefs(n, visit));
  } else if (node && typeof node === 'object') {
    if (node.packageName && node.id) {
      visit(node);
    }
    Object.values(node).forEach(n => collectTypeRefs(n, visit));
  }
}

function slugify(heading: string): string {
  return heading.replace(/^#+ /, '').toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
}

function mapOutsideCode(text: string, map: (part: string) => string): string {
  return text.split(/(```[\s\S]*?```|`[^`\n]*`)/).map((part, i) => i % 2 ? part : map(part)).join('');
}

/**
 * Escape for HTML we put in markdown, including `*` and `_` that markdown would still read as emphasis.
 */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\*/g, '&#42;').replace(/_/g, '&#95;');
}

function indent(text: string): string {
  return text.split('\n').map(line => line ? `  ${line}` : line).join('\n');
}

/**
 * Member headings hold the name in every language, so give their permalinks the TypeScript one, like the anchor.
 */
export function apiHeadingsPlugin(md: MarkdownIt) {
  md.core.ruler.push('api_headings', state => {
    for (const token of state.tokens) {
      for (const child of token.children ?? []) {
        const name = /<span class="lang lang-typescript">(.*?)<\/span>/.exec(child.attrGet('aria-label') ?? '');
        if (child.attrGet('class') === 'header-anchor' && name) {
          child.attrSet('aria-label', `Permalink to "${name[1]}"`);
        }
      }
    }
  });
}
