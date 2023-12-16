import pino, {type Logger} from 'pino';
import {DateTime} from 'luxon';
import type {Socket} from 'socket.io';

export const logger = pino({
  transport: {
    target: 'pino-pretty'
  },
  timestamp: (): string => `,"timestamp":"${DateTime.utc().toISO()}"`
});

export const createRouterLogger = ({
  socket,
  redaction
}: {
  socket: Socket;
  redaction: string[];
}): Logger =>
  logger.child(
    {
      namespace: socket.nsp.name.slice(1),
      socketid: socket.id
    },
    {redact: {paths: redaction, censor: '[redacted]'}}
  );

export const getRedaction = async ({
  module
}: {
  module: string;
}): Promise<string[]> => {
  const submodules = Object.keys(await import(module));
  const allRedaction = await Promise.all(
    submodules.map(
      async (submodule): Promise<string> =>
        (
          await import(
            `${module}/${submodule.replace(
              /[A-Z]/gu,
              (word): string => `-${word.toLowerCase()}`
            )}`
          )
        ).redact
    )
  );
  const definedRedaction = allRedaction
    .filter((redaction): boolean => redaction !== undefined)
    .toString()
    .split(',');
  const distinctRedaction = definedRedaction.filter(
    (redaction, index): boolean => definedRedaction.indexOf(redaction) === index
  );
  return distinctRedaction;
};
