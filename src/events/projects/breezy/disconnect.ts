import {getItem, setItem} from 'node-persist';
import {DateTime} from 'luxon';
import type {Logger} from 'pino';
import type {Socket} from 'socket.io';
import type {User} from '@events/projects/breezy/signup';
import {storage} from '@utils/storage';

const disconnectEvent = (socket: Socket, logger: Logger): void => {
  socket.on('disconnect', (): void => {
    logger.info('socket disconnected');
    storage.then((): void => {
      getItem('breezy users').then((users: User[]): void => {
        const updatedUsers = users?.map((user): User => {
          if (user.session.socket === socket.id) {
            const updatedUser: User = {
              ...user,
              session: {
                ...user.session,
                socket: null,
                status: 'offline',
                lastOnline: DateTime.utc().toISO() ?? new Date().toISOString()
              }
            };
            return updatedUser;
          }
          return user;
        });
        if (updatedUsers) {
          setItem('breezy users', updatedUsers);
        }
      });
    });
  });
};

export default disconnectEvent;
