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
      getItem('breezy users').then((users: User[] | undefined): void => {
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
          const ttl = DateTime.max(
            ...updatedUsers.map(
              (user): DateTime =>
                DateTime.fromISO(user.session.lastOnline, {zone: 'utc'})
            )
          )
            .plus({weeks: 2})
            .diff(DateTime.utc(), ['milliseconds']).milliseconds;
          setItem('breezy users', updatedUsers, {ttl: ttl});
        }
      });
    });
  });
};

export default disconnectEvent;
