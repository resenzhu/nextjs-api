import {
  type ClientResponse,
  createSuccessResponse
} from '@utils/response';
import type {Logger} from 'pino';
import type {Socket} from 'socket.io';

type FetchUsersReq = {
  username: string;
  password: string;
  honeypot: string;
  token: string;
};

const fetchUsersEvent = (socket: Socket, logger: Logger): void => {
  socket.on('fetch users', (callback: (response: ClientResponse) => void): void => {
    logger.info('ok');
    callback(createSuccessResponse({}));
  });
};

export type {FetchUsersReq};
export default fetchUsersEvent;
