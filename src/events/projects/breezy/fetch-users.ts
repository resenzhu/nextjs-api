import {
  type ClientResponse,
  createErrorResponse,
  createSuccessResponse,
  obfuscateResponse
} from '@utils/response';
import type {JWTPayload, User, UserStatusNotif} from '@events/projects/breezy';
import type {Namespace, Socket} from 'socket.io';
import {getItem, setItem} from 'node-persist';
import {DateTime} from 'luxon';
import type {Logger} from 'pino';
import {storage} from '@utils/storage';
import {verifyJwt} from '@utils/breezy';

const fetchUsersEvent = (
  socket: Socket,
  logger: Logger,
  {namespace}: {namespace: Namespace}
): void => {
  const event: string = 'fetch users';
  socket.on(event, (callback: (response: ClientResponse) => void): void => {
    logger.info(event);
    verifyJwt(socket)
      .then((jwtPayload): void => {
        const verifiedJwt = jwtPayload as JWTPayload;
        storage.then((): void => {
          getItem('breezy users').then((users: User[]): void => {
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
                  socket.broadcast.emit('update user status', userStatusNotif);
                }
              }
              const response: ClientResponse = createSuccessResponse({
                data: {
                  users: updatedUsers
                    .filter((user): boolean => user.id !== verifiedJwt.id)
                    .map((user): object => ({
                      id: user.id,
                      username: user.username,
                      displayName: user.displayName,
                      session: {
                        status: user.session.status
                          .replace('appear', '')
                          .trim() as 'online' | 'away' | 'offline',
                        lastOnline: user.session.lastOnline
                      }
                    }))
                }
              });
              logger.info({response: response}, `${event} success`);
              return callback(response);
            });
          });
        });
      })
      .catch((jwtError: Error): void => {
        const response: ClientResponse = createErrorResponse({
          code: jwtError.message.split('|')[0],
          message: jwtError.message.split('|')[1]
        });
        logger.warn(
          {
            response: response,
            error:
              jwtError.message.split('|')[2] ?? jwtError.message.split('|')[1]
          },
          `${event} failed`
        );
        return callback(obfuscateResponse(response));
      });
  });
};

export default fetchUsersEvent;
