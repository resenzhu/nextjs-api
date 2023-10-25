import {
  type ClientResponse,
  createErrorResponse,
  createSuccessResponse
} from '@utils/response';
import {type VerifyErrors, verify} from 'jsonwebtoken';
import type {JWTPayload} from '@events/projects/breezy/verify';
import type {Logger} from 'pino';
import type {Socket} from 'socket.io';
import type {User} from '@events/projects/breezy/signup';
import {getItem} from 'node-persist';
import {storage} from '@utils/storage';

const fetchUsersEvent = (socket: Socket, logger: Logger): void => {
  socket.on(
    'fetch users',
    (callback: (response: ClientResponse) => void): void => {
      logger.info('fetch users');
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
            logger.warn({response: response}, 'fetch users failed');
            return callback(response);
          }
          const jwtPayload = decoded as JWTPayload;
          storage
            .then((): void => {
              getItem('breezy users').then(
                (users: User[] | undefined): void => {
                  const response: ClientResponse = createSuccessResponse({
                    data: {
                      users:
                        users
                          ?.filter((user): boolean => user.id !== jwtPayload.id)
                          .map((user): object => ({
                            id: user.id,
                            username: user.username,
                            displayName: user.displayName,
                            session: {
                              status: user.session.status,
                              lastOnline: user.session.lastOnline
                            }
                          })) ?? []
                    }
                  });
                  logger.info({response: response}, 'fetch users success');
                  return callback(response);
                }
              );
            })
            .catch((storageError: Error): void => {
              const response: ClientResponse = createErrorResponse({
                code: '500',
                message: 'an error occured while accessing the storage.'
              });
              logger.warn(
                {response: response, error: storageError.message},
                'fetch users failed'
              );
              return callback(response);
            });
          return undefined;
        }
      );
    }
  );
};

export default fetchUsersEvent;
