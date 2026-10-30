import { source } from '@/lib/source';
import { getMarketplaceCourses } from '@/lib/courses';
import { SITE_URL } from '@/lib/site';
import { DEFAULT_SOCIAL_DESCRIPTION } from '@/lib/social-metadata';
import { createFileRoute } from '@tanstack/react-router';
import { llms } from 'fumadocs-core/source';

// llms.txt (llmstxt.org): the site's name, a one-line summary, how to start, then the dojos and every docs page with its
// description, linked absolutely. The pages' full text is in /llms-full.txt, each page's Markdown at its .mdx address.
async function courseLines() {
  // Where loadMarketplaceCourses finds the courses; the API down, the list just goes
  const origin = process.env.DOJO_API_ORIGIN ?? (process.env.NODE_ENV !== 'production' ? 'https://dojo.foo' : null);
  if (!origin) return [];
  try {
    return (await getMarketplaceCourses(origin)).map((course) => `- [${course.name}](${SITE_URL}/courses/${course.source}/${course.slug}): ${course.description} Add it with \`npx dojofoo add ${course.source}/${course.slug}\`.`);
  } catch {
    return [];
  }
}

export const Route = createFileRoute('/llms.txt')({
  server: {
    handlers: {
      async GET() {
        const courses = await courseLines();
        const text = `# Dojo.foo

> ${DEFAULT_SOCIAL_DESCRIPTION}

A dojo is an installable course with its own sensei: the learner's coding agent, following the course's teaching notes. It explains, asks and runs the tests, and leaves the code to the learner. \`dojofoo\` is the command that sets a project up and opens the lesson UI.

To start in the user's project:

\`\`\`sh
npx dojofoo
\`\`\`

It sets the folder up when needed (\`npx dojofoo install\`), then opens the lesson UI in the browser. Add a course with \`npx dojofoo add <owner>/<repository>\`.

## Dojos

${courses.length ? courses.join('\n') : `- [Find your dojo](${SITE_URL}/dojos): every listed course`}

## Docs

${llms(source).index().replace(/^# .*\n+/, '').replaceAll('](/', `](${SITE_URL}/`)}

## Optional

- [Full docs](${SITE_URL}/llms-full.txt): every docs page's text in one file
`;
        return new Response(text, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
      },
    },
  },
});
