import type { ReactNode } from 'react';

function inline(value: string): ReactNode[] {
  const pattern = /(\[[^\]]+\]\(https?:\/\/[^\s)]+\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  return value.split(pattern).filter(Boolean).map((part, index) => {
    if (part.startsWith('[')) {
      const match = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
      if (match) return <a key={index} href={match[2]} target="_blank" rel="noopener noreferrer">{match[1]}</a>;
    }
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={index}>{part.slice(1, -1)}</em>;
    return part;
  });
}

export function MarkdownView({ value }: { value: string }) {
  const lines = value.split(/\r?\n/);
  return <div className="markdown-view">{lines.map((line, index) => {
    if (!line.trim()) return <br key={index} />;
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const content = inline(heading[2]);
      if (heading[1].length === 1) return <h2 key={index}>{content}</h2>;
      if (heading[1].length === 2) return <h3 key={index}>{content}</h3>;
      return <h4 key={index}>{content}</h4>;
    }
    const task = line.match(/^\s*-\s+\[([ xX])\]\s+(.+)$/);
    if (task) return <p className={`markdown-task ${task[1].toLowerCase() === 'x' ? 'checked' : ''}`} key={index}><span>{task[1].toLowerCase() === 'x' ? '✓' : ''}</span>{inline(task[2])}</p>;
    const list = line.match(/^\s*[-*]\s+(.+)$/);
    if (list) return <p className="markdown-list" key={index}>• {inline(list[1])}</p>;
    if (line.startsWith('> ')) return <blockquote key={index}>{inline(line.slice(2))}</blockquote>;
    return <p key={index}>{inline(line)}</p>;
  })}</div>;
}
