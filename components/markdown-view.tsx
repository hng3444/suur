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
  const blocks: ReactNode[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith('```')) {
      const start = index;
      const code: string[] = [];
      while (++index < lines.length && !lines[index].startsWith('```')) code.push(lines[index]);
      blocks.push(<pre key={start}><code>{code.join('\n')}</code></pre>);
      continue;
    }
    const ordered = /^\s*\d+[.)]\s+/.test(line);
    const unordered = /^\s*[-*]\s+(?!\[[ xX]\])/.test(line);
    if (ordered || unordered) {
      const start = index;
      const pattern = ordered ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*[-*]\s+(?!\[[ xX]\])(.+)$/;
      const items: ReactNode[] = [];
      while (index < lines.length) {
        const match = lines[index].match(pattern);
        if (!match) break;
        items.push(<li key={index}>{inline(match[1])}</li>);
        index += 1;
      }
      index -= 1;
      blocks.push(ordered ? <ol key={start} start={Number(line.trim().match(/^\d+/)?.[0]) || 1}>{items}</ol> : <ul key={start}>{items}</ul>);
      continue;
    }
    blocks.push(renderLine(line, index));
  }
  return <div className="markdown-view">{blocks}</div>;
}

function renderLine(line: string, index: number) {
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
}
