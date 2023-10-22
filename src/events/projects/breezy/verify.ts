import {type VerifyErrors, verify} from 'jsonwebtoken';
import {getItem, setItem} from 'node-persist';
import {DateTime} from 'luxon';
import type {ExtendedError} from 'socket.io/dist/namespace';
import type {Logger} from 'pino';
import type {Socket} from 'socket.io';
import type {User} from '@events/projects/breezy/signup';
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
      breezyLogger.info({token: token}, 'verify token');
      verify(
        token ?? '',
        Buffer.from(process.env.JWT_KEY_PRIVATE_BASE64, 'base64').toString(),
        // eslint-disable-next-line
        (jwtError: VerifyErrors | null, decoded: any): void => {
          if (jwtError) {
            breezyLogger.warn({error: jwtError.message}, 'verify token failed');
            next(new Error(jwtError.name));
          }
          const jwtPayload = decoded as JWTPayload;
          storage
            .then((): void => {
              getItem('breezy users').then(
                (users: User[] | undefined): void => {
                  const updatedUsers = users?.map((user): User => {
                    if (
                      user.id === jwtPayload.id &&
                      user.session.id === jwtPayload.session
                    ) {
                      const updatedUser: User = {
                        ...user,
                        session: {
                          ...user.session,
                          socket: socket.id,
                          status: 'online',
                          lastOnline:
                            DateTime.utc().toISO() ?? new Date().toISOString()
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
                          DateTime.fromISO(user.session.lastOnline, {
                            zone: 'utc'
                          })
                      )
                    )
                      .plus({weeks: 1})
                      .diff(DateTime.utc(), ['milliseconds']).milliseconds;
                    setItem('breezy users', updatedUsers, {ttl: ttl}).then(
                      (): void => {
                        breezyLogger.info('verify token success');
                        next();
                      }
                    );
                  }
                }
              );
            })
            .catch((storageError: Error): void => {
              breezyLogger.warn(
                {error: storageError.message},
                'verify token failed'
              );
              next(new Error(storageError.message));
            });
        }
      );
    } else {
      next();
    }
  };

export {redact};
export type {JWTPayload};
export default verifyMiddleware;
