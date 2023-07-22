import {DateTime} from 'luxon';
import pino from 'pino';

const logger = pino({
  transport: {
    target: 'pino-pretty'
  },
  timestamp: (): string => `,"timestamp":"${DateTime.utc().toISO()}"`
});

export default logger;
