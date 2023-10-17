import {type VerifyErrors, verify} from 'jsonwebtoken';
import {getItem, setItem} from 'node-persist';
import {DateTime} from 'luxon';
import type {Logger} from 'pino';
import type {Socket} from 'socket.io';
import type {User} from '@events/projects/breezy/signup';
import {storage} from '@utils/storage';

type Token = {
  id: string;
  session: string;
  iat: number;
  iss: string;
  sub: string;
};

const redact: string[] = ['token'];

const connectEvent = (socket: Socket, logger: Logger): void => {
  logger.info('socket connected');
  const {token} = socket.handshake.auth;
  if (token) {
    verify(
      token ?? '',
      Buffer.from(process.env.JWT_KEY_PRIVATE_BASE64, 'base64').toString(),
      // eslint-disable-next-line
      (jwtError: VerifyErrors | null, decoded: any): void => {
        logger.info({token: token}, 'user online');
        if (jwtError) {
          logger.warn({error: jwtError.message}, 'user online failed');
          socket.disconnect();
        }
        const payload = decoded as Token;
        storage
          .then((): void => {
            getItem('breezy users').then((users: User[]): void => {
              const updatedUsers = users?.map((user): User => {
                if (
                  user.id === payload.id &&
                  user.session.id === payload.session
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
                      DateTime.fromISO(user.session.lastOnline, {zone: 'utc'})
                  )
                )
                  .plus({months: 1})
                  .diff(DateTime.utc(), ['milliseconds']).milliseconds;
                setItem('breezy users', updatedUsers, {ttl: ttl}).then(
                  (): void => {
                    logger.info('user online success');
                  }
                );
              }
            });
          })
          .catch((storageError: Error): void => {
            logger.warn({error: storageError.message}, 'user online failed');
            socket.disconnect();
          });
      }
    );
  }
};

export {redact};
export type {Token};
export default connectEvent;
