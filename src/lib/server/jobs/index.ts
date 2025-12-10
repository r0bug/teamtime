// Job queue exports
export * from './queue';
export { processPendingJobs, runProcessor, registerHandler } from './processor';

// Register all job handlers (import for side effects)
import './inventory-drop-processor';
