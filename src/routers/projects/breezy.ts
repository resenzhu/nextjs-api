import {disconnect, login, signup} from '@events/projects/breezy';
import type {Server} from 'socket.io';
import logger from '@utils/logger';

const breezyRouter = (server: Server): void => {
  const breezy = server.of('/project/breezy');
  breezy.on('connection', (socket): void => {
    const breezyLogger = logger.child({
      namespace: 'project/breezy',
      socketid: socket.id
    });
    breezyLogger.info('socket connected');
    signup(socket, breezyLogger);
    login(socket, breezyLogger);
    disconnect(socket, breezyLogger);
  });
};

export default breezyRouter;
