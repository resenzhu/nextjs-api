import type {Server, Socket} from 'socket.io';
import {logger} from '@utils/logger';

const breezyRouter = (server: Server): void => {
  const breezy = server.of('/project/breezy');
  breezy.on('connection', (socket: Socket): void => {
    const breezyLogger = logger.child({
      namespace: 'project/breezy',
      socketid: socket.id
    });
    breezyLogger.info('socket connected');
    socket.on('disconnect', (): void => {
      breezyLogger.info('socket disconnected');
    });
  });
};

export default breezyRouter;
