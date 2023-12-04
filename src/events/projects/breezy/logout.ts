import {
  type ClientResponse,
  createErrorResponse,
  createSuccessResponse
} from '@utils/response';
import {type VerifyErrors, verify} from 'jsonwebtoken';
import {getItem, setItem} from 'node-persist';
import {DateTime} from 'luxon';
import type {JWTPayload} from '@events/projects/breezy/verify-token';
import type {Logger} from 'pino';
import type {Socket} from 'socket.io';
import type {User} from '@events/projects/breezy/signup';
import type {UserStatusNotif} from '@events/projects/breezy/login';
import {storage} from '@utils/storage';

const logoutEvent = (socket: Socket, logger: Logger): void => {
  const event: string = 'logout';
  socket.on(event, (callback: (response: ClientResponse) => void): void => {
    logger.info(event);
    const {token} = socket.handshake.auth;
    verify(
      token ?? '',
      Buffer.from(process.env.JWT_KEY_PRIVATE_BASE64, 'base64').toString(),
      // eslint-disable-next-line
      (jwtError: VerifyErrors | null, decoded: any): void => {
        if (jwtError) {
          const response: ClientResponse = createErrorResponse({
            code: '401',
            message: 'missing or invalid token.'
          });
          logger.warn({response: response}, `${event} failed`);
          return callback(response);
        }
        const jwtPayload = decoded as JWTPayload;
        storage.then((): void => {
          getItem('breezy users').then((users: User[]): void => {
            let offlineUser: User | null = null;
            const updatedUsers = users.map((user): User => {
              if (user.id === jwtPayload.id) {
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
      }
    );
  });
};

export default logoutEvent;
