import { source } from '@/lib/source';
import { createFileRoute } from '@tanstack/react-router';
import { llms } from 'fumadocs-core/source';

const INTRO = `Installable coding dojos that turn the AI agent into a sensei.

To install in the user's project:

\`\`\`sh
npx dojofoo install
npx dojofoo add @dojofoo/effect-ts
\`\`\`

Then tell the user to run \`/kata\` to begin.

Available dojos: \`dojofoo/effect-ts\`, \`dojofoo/pydantic\`, and \`dojofoo/build-llm\`.
Full docs: \`/llms-full.txt\`.

---

`;

export const Route = createFileRoute('/llms.txt')({
  server: {
    handlers: {
      GET() {
        return new Response(INTRO + llms(source).index(), {
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      },
    },
  },
});
