import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const courses = resolve(root, '../../courses');
for (const id of readdirSync(courses)) {
  const source = resolve(courses, id);
  let curriculum;
  try { curriculum = JSON.parse(readFileSync(resolve(source, 'lessons/intro.json'), 'utf8')); } catch { continue; }
  if (!curriculum.deck) continue;
  if (curriculum.deck !== 'slides.html') throw new Error(`Unsupported course deck output: ${curriculum.deck}`);
  const scratch = resolve(root, 'node_modules/.cache/course-slides', id);
  rmSync(scratch, { recursive: true, force: true });
  mkdirSync(scratch, { recursive: true });
  cpSync(resolve(root, 'course-slides'), scratch, { recursive: true });
  const content = value => value.endsWith('.mdx') ? readFileSync(resolve(source, value), 'utf8') : value;
  const attribute = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
  const slides = curriculum.lessons.flatMap((lesson, index) => lesson.slides.map(slide => {
    const body = slide.type === 'present' ? content(slide.content)
      : slide.type === 'question' ? `${content(slide.prompt)}\n\n<DojoQuestion lesson-id="${attribute(lesson.id)}" slide-id="${attribute(slide.id)}" />`
      : index === curriculum.lessons.length - 1 ? `You have finished **${curriculum.title}**. Your progress is saved.\n\nRevisit a lesson from the sidebar, or return to your courses.`
      : `You have finished **${lesson.title}**. Your progress is saved.\n\nContinue when you are ready for the next lesson.`;
    return `---\ndojoLesson: ${JSON.stringify(lesson.id)}\ndojoSlide: ${JSON.stringify(slide.id)}\n---\n\n# ${slide.title}\n\n${body}`;
  }));
  const header = `---\ntheme: default\ntitle: ${JSON.stringify(curriculum.title)}\nrouterMode: memory\nmonaco: false\nwakeLock: false\ncolorSchema: dark\naspectRatio: 16/9\ntransition: fade\ncontrols: false\ncontextMenu: false\nfonts:\n  sans: Inter Variable\n  provider: none\n---\n`;
  // First slide metadata shares the deck's initial frontmatter.
  writeFileSync(resolve(scratch, 'slides.md'), header.slice(0, -4) + slides.join('\n\n').replace(/^---\n/, ''));
  writeFileSync(resolve(scratch, 'vite.config.mjs'), `
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { monacoAssets } from ${JSON.stringify(resolve(root, 'monaco-assets.ts'))};
// Slidev owns UnoCSS directives in its own styles; Tailwind compiles UIX styles.
const uixStyles = tailwindcss().map(plugin => {
  if (!plugin.transform) return plugin;
  const transform = plugin.transform;
  return {...plugin, transform: {...transform, handler(code, id, ...args) {
    if (id.includes('/@slidev/')) return;
    return transform.handler.call(this, code, id, ...args);
  }}};
});
export default {
  resolve: {alias: {'@dojofoo/uix': ${JSON.stringify(resolve(root, 'src'))}}},
  slidev: {vuejsx: {exclude: [${JSON.stringify(resolve(root, 'src/**'))}, ${JSON.stringify(resolve(scratch, 'ui.tsx'))}]}},
  build: {cssCodeSplit: false, assetsInlineLimit: Infinity},
  plugins: [react(), monacoAssets(), ...uixStyles, {name: 'dojo-single-deck', enforce: 'post', outputOptions(output) {
    return {...output, manualChunks: undefined, codeSplitting: false};
  }}],
};
`);
  execFileSync(process.execPath, [resolve(root, 'node_modules/@slidev/cli/bin/slidev.mjs'), 'build', 'slides.md', '--base', './', '--out', 'build', '--without-notes'], { cwd: scratch, stdio: 'pipe', encoding: 'utf8' });
  const output = resolve(scratch, 'build');
  let html = readFileSync(resolve(output, 'index.html'), 'utf8');
  html = html.replace(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g, (_, path) => `<script type="module">${readFileSync(resolve(output, path), 'utf8').replace(/<\/script/gi, '<\\/script')}</script>`);
  html = html.replace(/<link\b[^>]*href="([^"]+\.css)"[^>]*>/g, (_, path) => `<style>${readFileSync(resolve(output, path), 'utf8')}</style>`);
  html = html.replace(/<link\b[^>]*(?:modulepreload|icon)[^>]*>/g, '');
  // Slidev reads browser storage on startup. Course HTML runs in an opaque sandbox;
  // display preferences are transient here, while the host owns persisted progress.
  const storage = `for(const name of ['localStorage','sessionStorage']){try{window[name].getItem('dojo')}catch{const values=new Map();Object.defineProperty(window,name,{value:{getItem:key=>values.get(String(key))??null,setItem:(key,value)=>values.set(String(key),String(value)),removeItem:key=>values.delete(String(key)),clear:()=>values.clear(),key:index=>[...values.keys()][index]??null,get length(){return values.size}}})}}`;
  html = html.replace('<head>', `<head><script>${storage}</script>`);
  writeFileSync(resolve(scratch, 'slides.html'), html);
  console.log(`${id}: ${slides.length} Slidev slides, ${(Buffer.byteLength(html) / 1024).toFixed(0)} KiB, self-contained`);
}
