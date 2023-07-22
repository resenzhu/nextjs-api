import {Server, Socket} from 'socket.io';
import mainRouter from '@routers/main';

const router = (server: Server): void => {
  server.on('connection', (socket: Socket): void => {
    mainRouter(socket);
  });
};

export default router;
