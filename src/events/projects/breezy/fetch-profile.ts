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

const fetchProfileEvent = (socket: Socket, logger: Logger): void => {
  socket.on(
    'fetch profile',
    (callback: (response: ClientResponse) => void): void => {
      logger.info('fetch profile');
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
            logger.warn({response: response}, 'fetch profile failed');
            return callback(response);
          }
          const jwtPayload = decoded as JWTPayload;
          storage
            .then((): void => {
              getItem('breezy users').then(
                (users: User[] | undefined): void => {
                  const account = users?.find(
                    (user): boolean => user.id === jwtPayload.id
                  );
                  const response: ClientResponse = createSuccessResponse({
                    data: {
                      user: account
                        ? {
                            id: account.id,
                            username: account.username,
                            displayName: account.displayName,
                            session: {
                              status: account.session.status,
                              lastOnline: account.session.lastOnline
                            }
                          }
                        : undefined
                    }
                  });
                  logger.info({response: response}, 'fetch profile success');
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
                'fetch profile failed'
              );
              return callback(response);
            });
          return undefined;
        }
      );
    }
  );
};

export default fetchProfileEvent;
