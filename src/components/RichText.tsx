'use client';

import { useEffect, useRef } from 'react';

/**
 * A small rich-text box for comment bodies.
 *
 * Comment text in these templates is HTML - paragraphs, bold, lists - so the
 * editor has to preserve that rather than flatten it to plain text. This uses a
 * contenteditable div with the browser's own formatting commands, which keeps
 * the app dependency-free; whatever it produces is sanitised again on the
 * server before it is stored.
 */
const COMMANDS: { label: string; cmd: string; title: string; style?: React.CSSProperties }[] = [
  { label: 'B', cmd: 'bold', title: 'Bold', style: { fontWeight: 700 } },
  { label: 'I', cmd: 'italic', title: 'Italic', style: { fontStyle: 'italic' } },
  { label: 'U', cmd: 'underline', title: 'Underline', style: { textDecoration: 'underline' } },
  { label: '• List', cmd: 'insertUnorderedList', title: 'Bulleted list' },
  { label: '1. List', cmd: 'insertOrderedList', title: 'Numbered list' },
  { label: 'Clear', cmd: 'removeFormat', title: 'Remove formatting' },
];

export default function RichText({
  html,
  onChange,
}: {
  html: string;
  onChange: (html: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Only push incoming HTML into the DOM when it differs, otherwise React would
  // reset the caret to the start on every keystroke.
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== html) {
      ref.current.innerHTML = html;
    }
  }, [html]);

  return (
    <div className="rte-wrap">
      <div className="rte-toolbar">
        {COMMANDS.map((c) => (
          <button
            key={c.cmd}
            type="button"
            title={c.title}
            style={c.style}
            // onMouseDown keeps the selection inside the editable area.
            onMouseDown={(e) => {
              e.preventDefault();
              document.execCommand(c.cmd);
              if (ref.current) onChange(ref.current.innerHTML);
            }}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div
        ref={ref}
        className="rte"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Comment text"
        onInput={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
        onPaste={(e) => {
          // Paste as plain text so formatting from Word or a browser does not
          // drag styles and stray markup into the template.
          e.preventDefault();
          const text = e.clipboardData.getData('text/plain');
          document.execCommand('insertText', false, text);
          if (ref.current) onChange(ref.current.innerHTML);
        }}
      />
    </div>
  );
}
