import { EventEmitter } from 'events';

class EventBus extends EventEmitter {}

const eventBus = new EventBus();

export const SIGNAL_EVENT = 'signal';
export const EVENT_UPDATE_EVENT = 'event_update';
export const ERROR_EVENT = 'error';
export const MOCK_EVENT_EVENT = 'mock_event';

export default eventBus;
