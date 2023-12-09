import type {Namespace, Socket} from 'socket.io';
import {getItem, setItem} from 'node-persist';
import {DateTime} from 'luxon';
import type {Logger} from 'pino';
import type {User} from '@events/projects/breezy/signup';
import type {UserStatusNotif} from '@events/projects/breezy/login';
import {storage} from '@utils/storage';

const verifyStatusEvent = (
  socket: Socket,
  logger: Logger,
  namespace: Namespace
): void => {
  const {token} = socket.handshake.auth;
  if (token) {
    const event: string = 'verify status';
    logger.info(event);
    storage.then((): void => {
      getItem('breezy users').then((users: User[] | undefined): void => {
        if (users) {
          let offlineUsers: User[] = [];
          const updatedUsers = users.map((user): User => {
            if (
              !Array.from(namespace.sockets)
                .map(([name, value]) => ({name: name, value: value}))
                .some(
                  (connectedSocket): boolean =>
                    connectedSocket.name === user.session.socket
                )
            ) {
              const updatedUser: User = {
                ...user,
                session: {
                  ...user.session,
                  socket: null
                }
              };
              offlineUsers = [...offlineUsers, updatedUser];
              return updatedUser;
            }
            return user;
          });
          const ttl = DateTime.max(
            ...updatedUsers.map(
              (user): DateTime =>
                DateTime.fromISO(user.session.lastOnline, {zone: 'utc'})
            )
          )
            .plus({weeks: 1})
            .diff(DateTime.utc(), ['milliseconds']).milliseconds;
          setItem('breezy users', updatedUsers, {ttl: ttl}).then((): void => {
            if (offlineUsers.length !== 0) {
              for (const offlineUser of offlineUsers) {
                const userStatusNotif: UserStatusNotif = {
                  user: {
                    id: offlineUser.id,
                    session: {
                      status: 'offline',
                      lastOnline: offlineUser.session.lastOnline
                    }
                  }
                };
                namespace.emit('update user status', userStatusNotif);
              }
            }
          });
        }
      });
    });
  }
};

export default verifyStatusEvent;
