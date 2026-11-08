import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './auth.jsx';
import { ToastProvider } from './ui.jsx';
import './styles.css';
document.documentElement.dataset.theme = localStorage.getItem('theme') || 'dark';
createRoot(document.getElementById('root')).render(
  <HashRouter><ToastProvider><AuthProvider><App /></AuthProvider></ToastProvider></HashRouter>
);
