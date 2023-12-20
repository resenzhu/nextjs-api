import {
  type ClientResponse,
  createErrorResponse,
  createSuccessResponse,
  obfuscateResponse
} from '@utils/response';
import type {JWTPayload, User, UserStatusNotif} from '@events/projects/breezy';
import {getItem, setItem} from 'node-persist';
import {DateTime} from 'luxon';
import type {Logger} from 'pino';
import type {Socket} from 'socket.io';
import {storage} from '@utils/storage';
import {verifyJwt} from '@utils/breezy';

const logoutEvent = (socket: Socket, logger: Logger): void => {
  const event: string = 'logout';
  socket.on(event, (callback: (response: ClientResponse) => void): void => {
    logger.info(event);
    verifyJwt(socket)
      .then((jwtPayload): void => {
        const verifiedJwt = jwtPayload as JWTPayload;
        storage.then((): void => {
          getItem('breezy users').then((users: User[]): void => {
            let offlineUser: User | null = null;
            const updatedUsers = users.map((user): User => {
              if (user.id === verifiedJwt.id) {
                const updatedUser: User = {
                  ...user,
                  session: {
                    ...user.session,
                    socket: null,
                    status: 'offline',
                    lastOnline:
                      DateTime.utc().toISO() ?? new Date().toISOString()
                  }
                };
                offlineUser = updatedUser;
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
              if (offlineUser) {
                const userStatusNotif: UserStatusNotif = {
                  user: {
                    id: offlineUser.id,
                    session: {
                      status: offlineUser.session.status
                        .replace('appear', '')
                        .trim() as 'online' | 'away' | 'offline',
                      lastOnline: offlineUser.session.lastOnline
                    }
                  }
                };
                socket.broadcast.emit('update user status', userStatusNotif);
              }
              const response: ClientResponse = createSuccessResponse({});
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

export default logoutEvent;
