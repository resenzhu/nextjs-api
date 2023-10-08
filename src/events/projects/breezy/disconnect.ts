import {getItem, setItem} from 'node-persist';
import {DateTime} from 'luxon';
import type {Logger} from 'pino';
import type {Session} from '@events/projects/breezy/signup';
import type {Socket} from 'socket.io';
import {storage} from '@utils/storage';

const disconnectEvent = (socket: Socket, logger: Logger): void => {
  socket.on('disconnect', (): void => {
    logger.info('socket disconnected');
    storage.then((): void => {
      getItem('breezy sessions').then((sessions: Session[]): void => {
        const newSessions = sessions?.map((session): Session => {
          if (session.socket === socket.id) {
            const newSession: Session = {
              ...session,
              socket: null,
              status: 'offline',
              lastOnline:
                DateTime.utc().toISO() ?? new Date(Date.now()).toISOString()
            };
            return newSession;
          }
          return session;
        });
        if (newSessions) {
          setItem('breezy sessions', newSessions);
        }
      });
    });
  });
};

export default disconnectEvent;
