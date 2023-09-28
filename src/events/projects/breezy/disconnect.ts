import type {Logger} from 'pino';
import type {Socket} from 'socket.io';

const disconnectEvent = (socket: Socket, logger: Logger): void => {
  socket.on('disconnect', (): void => {
    logger.info('socket disconnected');
  });
};

export default disconnectEvent;
