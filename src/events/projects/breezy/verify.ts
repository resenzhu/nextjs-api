import {type VerifyErrors, verify} from 'jsonwebtoken';
import {getItem, setItem} from 'node-persist';
import {DateTime} from 'luxon';
import type {ExtendedError} from 'socket.io/dist/namespace';
import type {Logger} from 'pino';
import type {Socket} from 'socket.io';
import type {User} from '@events/projects/breezy/signup';
import type {UserStatusNotif} from '@events/projects/breezy/login';
import {storage} from '@utils/storage';

type JWTPayload = {
  id: string;
  session: string;
  iat: number;
  iss: string;
  sub: string;
};

const redact: string[] = ['token'];

const verifyMiddleware =
  (
    logger: Logger
  ): ((
    socket: Socket,
    next: (error?: ExtendedError | undefined) => void
  ) => void) =>
  (socket, next): void => {
    const breezyLogger = logger.child(
      {
        namespace: 'project/breezy',
        socketid: socket.id
      },
      {redact: {paths: [...redact], censor: '[redacted]'}}
    );
    const {token} = socket.handshake.auth;
    if (token) {
      const event: string = 'verify token';
      breezyLogger.info({token: token}, event);
      verify(
        token ?? '',
        Buffer.from(process.env.JWT_KEY_PRIVATE_BASE64, 'base64').toString(),
        // eslint-disable-next-line
        (jwtError: VerifyErrors | null, decoded: any): void => {
          if (jwtError) {
            breezyLogger.warn({error: jwtError.message}, `${event} failed`);
            next(new Error('JWTError'));
          } else {
            const jwtPayload = decoded as JWTPayload;
            storage.then((): void => {
              getItem('breezy users').then((users: User[]): void => {
                let onlineUser: User | null = null;
                const updatedUsers = users.map((user): User => {
                  if (
                    user.id === jwtPayload.id &&
                    user.session.id === jwtPayload.session
                  ) {
                    const updatedUser: User = {
                      ...user,
                      session: {
                        ...user.session,
                        socket: socket.id,
                        lastOnline:
                          DateTime.utc().toISO() ?? new Date().toISOString()
                      }
                    };
                    onlineUser = updatedUser;
                    return updatedUser;
                  }
                  return user;
                });
                const ttl = DateTime.max(
                  ...updatedUsers.map(
                    (user): DateTime =>
                      DateTime.fromISO(user.session.lastOnline, {
                        zone: 'utc'
                      })
                  )
                )
                  .plus({weeks: 1})
                  .diff(DateTime.utc(), ['milliseconds']).milliseconds;
                setItem('breezy users', updatedUsers, {ttl: ttl}).then(
                  (): void => {
                    if (onlineUser) {
                      const userStatusNotif: UserStatusNotif = {
                        user: {
                          id: onlineUser.id,
                          session: {
                            status: onlineUser.session.status
                              .replace('appear', '')
                              .trim() as 'online' | 'away' | 'offline',
                            lastOnline: onlineUser.session.lastOnline
                          }
                        }
                      };
                      socket.broadcast.emit(
                        'update user status',
                        userStatusNotif
                      );
                    }
                    breezyLogger.info(`${event} success`);
                    next();
                  }
                );
              });
            });
          }
        }
      );
    } else {
      next();
    }
  };

export {redact};
export type {JWTPayload};
export default verifyMiddleware;
