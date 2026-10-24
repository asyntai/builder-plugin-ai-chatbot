// Asyntai AI Chatbot plugin for Builder.io.
//
// Builder loads this file in its editor (SystemJS). It adds:
// - plugin settings: widget ID (required), API key and website ID (optional)
// - "Add Asyntai AI Chatbot to this page" / "Remove ..." on page entries
// - "Add to Asyntai knowledge base" on one entry and on a selection of entries
import { Builder } from '@builder.io/react';
import appState from '@builder.io/app-context';
import { register } from './register.js';

register(Builder, appState);
