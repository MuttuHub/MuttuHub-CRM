/**
 * Snippet de la búsqueda FTS: ts_headline envuelve cada coincidencia con
 * StartSel=« / StopSel=». Acá se hace split sobre esos delimitadores y se
 * pinta <mark> — nunca dangerouslySetInnerHTML.
 */
export function SnippetText({ snippet }: { snippet: string }) {
  const parts = snippet.split(/[«»]/);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded-sm bg-exito/15 px-0.5 text-ink-900">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
