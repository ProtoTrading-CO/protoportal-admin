export default function LoaderCodeEllipsis({ value }) {
  const text = String(value || '').trim();
  if (!text) return <span>—</span>;
  return (
    <span className="pm-code-ellipsis" title={text}>
      <strong>{text}</strong>
    </span>
  );
}
