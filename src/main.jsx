import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import './index.css';
import Root from './Root.jsx';
import { bootIntercom } from './lib/intercom.js';

void bootIntercom();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
    <Analytics />
  </StrictMode>,
);
