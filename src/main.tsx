import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initClientSentry } from './services/sentry.client.ts';

initClientSentry();

createRoot(document.getElementById('root')!).render(<App />);
