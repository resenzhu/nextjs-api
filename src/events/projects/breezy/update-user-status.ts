import type {Logger} from 'pino';
import type {Socket} from 'socket.io';

const updateUserStatusEvent = (socket: Socket, logger: Logger): void => {
  socket.on('update user status', (): void => {});
};

export default updateUserStatusEvent;
