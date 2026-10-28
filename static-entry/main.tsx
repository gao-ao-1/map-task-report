import React from 'react';
import { createRoot } from 'react-dom/client';
import Atlas from '../app/atlas';
import '../app/globals.css';

createRoot(document.getElementById('root')!).render(
  <Atlas preview geoBase="./public/geo/" workspaceUrl="https://county-report-atlas.regaleel259.chatgpt.site/" />
);
