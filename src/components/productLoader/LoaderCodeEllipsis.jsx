/** Truncate long SKU/filename text with ellipsis; full value on hover via title. */
export default function LoaderCodeEllipsis({
  value,
  strong = true,
  maxCh = 20,
  className = '',
}) {
  const text = String(value ?? '').trim();
  if (!text) return <span>—</span>;
  const content = strong ? <strong>{text}</strong> : text;
  return (
    <span
      className={`pm-code-ellipsis ${className}`.trim()}
      style={{ maxWidth: `${maxCh}ch` }}
      title={text}
    >
      {content}
    </span>
  );
}
