import {DateTime} from 'luxon';
import pino from 'pino';

export const logger = pino({
  transport: {
    target: 'pino-pretty'
  },
  timestamp: (): string => `,"timestamp":"${DateTime.utc().toISO()}"`
});
