import React from 'react';
import { createRoot } from 'react-dom/client';
import './app/styles.css';
import App from './app/App';
import ErrorBoundary from './app/ErrorBoundary';

createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary><App /></ErrorBoundary></React.StrictMode>);
