import {
  type ClientResponse,
  createErrorResponse,
  createSuccessResponse,
  obfuscateResponse
} from '@utils/response';
import type {JWTPayload, User} from '@events/projects/breezy';
import type {Logger} from 'pino';
import type {Socket} from 'socket.io';
import {getItem} from 'node-persist';
import {storage} from '@utils/storage';
import {verifyJwt} from '@utils/breezy';

const fetchProfileEvent = (socket: Socket, logger: Logger): void => {
  const event: string = 'fetch profile';
  socket.on(event, (callback: (response: ClientResponse) => void): void => {
    logger.info(event);
    verifyJwt(socket)
      .then((jwtPayload): void => {
        const verifiedJwt = jwtPayload as JWTPayload;
        storage.then((): void => {
          getItem('breezy users').then((users: User[]): void => {
            const account = users.find(
              (user): boolean => user.id === verifiedJwt.id
            );
            if (!account) {
              const response: ClientResponse = createErrorResponse({
                code: '500',
                message: 'user was not found.'
              });
              logger.warn({response: response}, `${event} failed`);
              return callback(response);
            }
            const response: ClientResponse = createSuccessResponse({
              data: {
                user: {
                  id: account.id,
                  username: account.username,
                  displayName: account.displayName,
                  session: {
                    status: account.session.status,
                    lastOnline: account.session.lastOnline
                  }
                }
              }
            });
            logger.info({response: response}, `${event} success`);
            return callback(response);
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

export default fetchProfileEvent;
