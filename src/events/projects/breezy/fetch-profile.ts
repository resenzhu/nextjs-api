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
  const event: string = 'fetch profile';
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
            const account = users.find(
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
            logger.info({response: response}, `${event} success`);
            return callback(response);
          });
        });
        return undefined;
      }
    );
  });
};

export default fetchProfileEvent;
