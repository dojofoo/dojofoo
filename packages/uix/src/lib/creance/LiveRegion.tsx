'use client';

import { useEffect, useState } from 'react';

/**
 * A polite live region. The message is set a beat after mount because screen readers only announce
 * changes to a region that already exists in the DOM.
 */
export function LiveRegion({ message }: { message: string }) {
  const [text, setText] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setText(message), 150);
    return () => clearTimeout(id);
  }, [message]);
  return (
    <div role="status" className="cr-visually-hidden">
      {text}
    </div>
  );
}
