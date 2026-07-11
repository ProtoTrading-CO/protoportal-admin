import { useEffect, useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { APOLLO_COMPOSER_HINTS } from '../lib/apolloInboxPresentation.js';

export default function ApolloTalkComposer({
  input,
  onInputChange,
  onSend,
  busy,
  error,
}) {
  const [hintIndex, setHintIndex] = useState(0);
  const placeholder = APOLLO_COMPOSER_HINTS[hintIndex] || APOLLO_COMPOSER_HINTS[0];

  useEffect(() => {
    if (input.trim()) return undefined;
    const timer = window.setInterval(() => {
      setHintIndex((current) => (current + 1) % APOLLO_COMPOSER_HINTS.length);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [input]);

  return (
    <div className="apollo-talk-composer">
      {error && <p className="apollo-error">{error}</p>}
      <form
        className="apollo-talk-composer-form"
        onSubmit={(e) => {
          e.preventDefault();
          void onSend(input);
        }}
      >
        <input
          type="text"
          className="apollo-talk-composer-input"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder={placeholder}
          disabled={busy}
          aria-label="Talk to Apollo"
        />
        <button
          type="submit"
          className="apollo-talk-composer-send"
          disabled={busy || !input.trim()}
          aria-label="Send"
        >
          {busy ? <Loader2 size={16} className="spin" /> : <ArrowRight size={16} />}
        </button>
      </form>
    </div>
  );
}
