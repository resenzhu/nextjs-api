import {Server, Socket} from 'socket.io';
import logger from '@utils/logger';

const mainRouter = (server: Server) => {
  const main = server.of('/main');

  main.on('connection', (socket: Socket): void => {
    const mainLogger = logger.child({scope: 'main', socketid: socket.id});
    mainLogger.info('socket connected');
  });
};

export default mainRouter;
