/** The wrapper names the image once; its artwork is decorative, including brand files with their own image role. */
export const decorativeSvg = (svg: string) => svg
    .replace(/<title>[\s\S]*?<\/title>/g, '')
    .replace(/<svg\b([^>]*)>/, (_, attributes: string) => `<svg${attributes.replace(/\s(?:role|aria-hidden|focusable)=(?:"[^"]*"|'[^']*')/g, '')} aria-hidden="true" focusable="false">`);
