import { Fragment } from 'react';
import { cn } from '../../utils/cn.js';

/*
 * Renders the prototype's brief/feedback strings, which use exactly two
 * inline tags: <b>…</b> and <code>…</code>. Nothing is injected as HTML —
 * the string is tokenised and mapped to React elements, so any other
 * markup is shown as plain text.
 */
const TOKEN = /(<b>|<\/b>|<code>|<\/code>)/i;

export function RichText({ text = '', className, as: Tag = 'p', boldClassName = 'bg-yellow px-1 font-bold text-ink' }) {
  const parts = String(text).split(TOKEN);
  const out = [];
  let bold = false;
  let code = false;
  parts.forEach((part, i) => {
    const lower = part.toLowerCase();
    if (lower === '<b>') bold = true;
    else if (lower === '</b>') bold = false;
    else if (lower === '<code>') code = true;
    else if (lower === '</code>') code = false;
    else if (part) {
      if (code) out.push(<code key={i} className="border-2 border-ink bg-white px-1 py-0.5 font-mono text-[0.85em] text-blue">{part}</code>);
      else if (bold) out.push(<b key={i} className={boldClassName}>{part}</b>);
      else out.push(<Fragment key={i}>{part}</Fragment>);
    }
  });
  return <Tag className={cn(className)}>{out}</Tag>;
}
