import { setupWorker } from 'msw/browser';
import { adoHandlers } from './handlers.js';

export const worker = setupWorker(...adoHandlers);